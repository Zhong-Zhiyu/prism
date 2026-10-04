// ============================================================
// Surge 配置生成器（按官方 profile 文档实现）
//
// 语法基线全部取自 manual.nssurge.com：
//   [Proxy]
//     Name = ss, <host>, <port>, encrypt-method=<m>, password=<p>[, obfs=..., obfs-host=...]
//     Name = snell, <host>, <port>, psk=<psk>, version=<n>[, obfs=...]
//     Name = vmess, <host>, <port>, username=<uuid>[, ws=true, ws-path=..., ws-headers=...]
//     Name = trojan, <host>, <port>, password=<p>[, ws=..., sni=...]
//     Name = tuic, <host>, <port>, token=<pwd>, alpn=<...>            （v4）
//     Name = tuic-v5, <host>, <port>, uuid=<uuid>, password=<pwd>, alpn=<...>
//     Name = hysteria2, <host>, <port>, password=<pwd>[, download-bandwidth=<mbps>]
//     Name = anytls, <host>, <port>, password=<pwd>
//     Name = ssh, <host>, <port>, username=<u>, password=<p>
//     Name = http|https, <host>, <port>[, <username>, <password>]      ← 位置参数
//     Name = socks5|socks5-tls, <host>, <port>[, <username>, <password>] ← 位置参数
//   公共参数：udp-relay、tfo、skip-cert-verify、sni、alpn、ecn、test-url、interface
//
// 关键约束：策略组与规则里出现的每个策略名都必须已定义，否则 Surge 会判定配置错误。
// 因此本生成器先算出「实际输出成功的节点集合」，再据此生成策略组与规则。
// ============================================================

import type { ClashConfig, ProxyNode, ParsedIniConfig, ConversionParams, ProxyGroup } from '../utils/types';
import { expandPlaceholderProxies } from '../parsers/ini-parser';
import { filterValidNodes, mapNodeReference, prepareNodes } from '../utils/node-utils';
import { collectFinalRules } from '../utils/rule-collector';

/** 位置参数标记：Surge 的 http/socks5 把用户名密码写成裸值而非 key=value */
const POSITIONAL_PREFIX = 'positional:';

/** Surge 内置策略名 */
const BUILTIN_POLICIES = new Set(['DIRECT', 'REJECT', 'REJECT-TLS', 'REJECT-DROP', 'REJECT-NO-DROP']);

/** Surge 原生支持的 Clash 节点类型 → Surge 代理类型 */
const SURGE_TYPE_MAP: Record<string, string> = {
  ss: 'ss',
  vmess: 'vmess',
  trojan: 'trojan',
  tuic: 'tuic',
  hysteria2: 'hysteria2',
  snell: 'snell',
  anytls: 'anytls',
  http: 'http',
  https: 'https',
  socks5: 'socks5',
  ssh: 'ssh',
};

/**
 * 生成 Surge INI 格式的配置
 */
export function generateSurgeConfig(
  sourceConfig: ClashConfig,
  iniConfig: ParsedIniConfig,
  params: ConversionParams,
  ruleContents: Record<string, string[]>
): string {
  // 先剔除字段不完整的节点，避免 Surge 因单个畸形节点判定配置错误
  const { nodes: validProxies, dropped: droppedNodes } = filterValidNodes(sourceConfig.proxies || []);
  const prepared = prepareNodes(validProxies, params);
  const allNodes = prepared.nodes;
  const allNodeNames = prepared.allNames;

  const lines: string[] = [];
  lines.push('# ====================================');
  lines.push('# Prism - 订阅转换工具 (Surge)');
  lines.push('# ====================================');
  lines.push('');

  // ---- [General] ----
  const general: string[] = [];
  const logLevel = normalizeLogLevel(sourceConfig['log-level']);
  if (logLevel) general.push(`loglevel = ${logLevel}`);
  const externalController = sourceConfig['external-controller'];
  if (typeof externalController === 'string' && /^\d+\.\d+\.\d+\.\d+:\d+$/.test(externalController)) {
    // Surge 的 HTTP API 与 Clash 的 external-controller 语义不同，这里只做等价声明
    general.push(`http-api = ${externalController.replace(':', '@')}`);
  }
  if (general.length > 0) {
    lines.push('[General]');
    lines.push(...general);
    lines.push('');
  }

  // ---- [Proxy] ----
  const skipped = new Map<string, number>(droppedNodes);
  const proxyLines: string[] = [];
  const emittedNames: string[] = [];
  const emitted = new Set<string>();

  // 名称净化：Surge 侧统一使用净化后的名字，避免名称里的逗号/等号破坏行结构
  const surgeNames = new Map<string, string>();
  for (const node of allNodes) {
    const sanitized = escapeSurgeName(node.name);
    let unique = sanitized;
    let suffix = 2;
    while ([...surgeNames.values()].includes(unique)) unique = `${sanitized}-${suffix++}`;
    surgeNames.set(node.name, unique);
  }
  const surgeNameOf = (name: string): string => surgeNames.get(name) ?? escapeSurgeName(name);

  for (const node of allNodes) {
    const line = convertNodeToSurgeProxy(node, params, surgeNameOf(node.name));
    if (!line) {
      skipped.set(node.type, (skipped.get(node.type) ?? 0) + 1);
      continue;
    }
    if (emitted.has(node.name)) continue;
    emitted.add(node.name);
    emittedNames.push(node.name);
    proxyLines.push(line);
  }

  lines.push('[Proxy]');
  lines.push(...proxyLines);
  if (skipped.size > 0) {
    const detail = [...skipped.entries()].map(([type, count]) => `${type}×${count}`).join('、');
    lines.push(`# 已跳过 ${[...skipped.values()].reduce((sum, count) => sum + count, 0)} 个 Surge 不支持的节点（${detail}）`);
  }
  lines.push('');

  // ---- [Proxy Group] ----
  // 只允许引用「已成功输出的节点」或已定义的策略组，避免悬空引用导致整份配置失效
  const groupPlans = planGroups(sourceConfig['proxy-groups'], iniConfig, params, allNodeNames);
  const groupNames = new Set(groupPlans.map(plan => plan.name));

  // 规则引用了不存在的策略组：用全部已输出节点合成一个 select，保住规则语义
  // 目标名必须与规则实际输出用的名字一致（都经过净化），否则会补建出错误的组
  const knownPolicies = new Set<string>([
    ...emittedNames.map(surgeNameOf),
    ...groupPlans.map(plan => surgeNameOf(plan.name)),
    ...BUILTIN_POLICIES,
  ]);
  for (const rawTarget of collectRuleTargets(sourceConfig, iniConfig, params, ruleContents, prepared.displayNames)) {
    const target = surgeNameOf(rawTarget);
    if (knownPolicies.has(target)) continue;
    // 没有任何可用节点时回退到 DIRECT，保证规则本身不被丢弃
    const members = emittedNames.map(surgeNameOf).filter(name => name !== target);
    groupPlans.push({ name: target, type: 'select', members: members.length > 0 ? members : ['DIRECT'] });
    groupNames.add(target);
    knownPolicies.add(target);
  }

  const groupLines: string[] = [];

  for (const plan of groupPlans) {
    const members = plan.members
      .map(member => mapNodeReference(member, prepared.displayNames))
      .filter(member => emitted.has(member) || BUILTIN_POLICIES.has(member) || groupNames.has(member));
    // 上面的过滤用原始名判断，输出时统一换成净化名
    let unique = [...new Set(members)].filter(member => member !== plan.name);
    // 组内没有有效成员时回退到全部已输出节点（或 DIRECT），
    // 避免规则引用到一个根本不存在的策略
    if (unique.length === 0) {
      unique = emittedNames.filter(name => name !== plan.name);
      if (unique.length === 0) unique = ['DIRECT'];
    }

    // 组名与成员都要按同一套规则转义，否则名称里的逗号会把成员切成多个
    const parts = [`${surgeNameOf(plan.name)} = ${plan.type}`, ...unique.map(surgeNameOf)];
    if (plan.type === 'url-test' || plan.type === 'fallback') {
      parts.push(`url = ${plan.url || 'http://www.gstatic.com/generate_204'}`);
      parts.push(`interval = ${plan.interval && plan.interval > 0 ? plan.interval : 300}`);
      if (plan.type === 'url-test' && plan.tolerance && plan.tolerance > 0) {
        parts.push(`tolerance = ${plan.tolerance}`);
      }
    }
    groupLines.push(parts.join(', '));
  }

  if (groupLines.length > 0) {
    lines.push('[Proxy Group]');
    lines.push(...groupLines);
    lines.push('');
  }

  // ---- [Rule] ----
  const ruleLines = buildRules(sourceConfig, iniConfig, params, ruleContents, emitted, groupNames,
    prepared.displayNames, surgeNameOf);
  if (ruleLines.length > 0) {
    lines.push('[Rule]');
    lines.push(...ruleLines);
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================
// 策略组规划
// ============================================================

interface SurgeGroupPlan {
  name: string;
  type: 'select' | 'url-test' | 'fallback' | 'load-balance';
  members: string[];
  url?: string;
  interval?: number;
  tolerance?: number;
}

function planGroups(
  sourceGroups: ProxyGroup[] | undefined,
  iniConfig: ParsedIniConfig,
  params: ConversionParams,
  allNodeNames: string[]
): SurgeGroupPlan[] {
  const plans: SurgeGroupPlan[] = [];

  if (params.config && iniConfig.customProxyGroups.length > 0) {
    for (const group of expandPlaceholderProxies(iniConfig.customProxyGroups, allNodeNames)) {
      plans.push({
        name: group.name,
        type: mapGroupType(group.groupType),
        members: group.proxies,
        url: group.url,
        interval: group.interval,
      });
    }
    return plans;
  }

  if (sourceGroups && sourceGroups.length > 0) {
    for (const group of sourceGroups) {
      plans.push({
        name: group.name,
        type: mapGroupType(group.type || 'select'),
        members: group.proxies || [],
        url: group.url,
        interval: group.interval,
        tolerance: group.tolerance,
      });
    }
    return plans;
  }

  // 兜底：没有任何策略组时，用全部节点建一个 select
  plans.push({
    name: 'PROXY',
    type: 'select',
    members: allNodeNames.length > 0 ? [...allNodeNames] : ['DIRECT'],
  });
  return plans;
}

function mapGroupType(type: string): SurgeGroupPlan['type'] {
  switch (String(type || '').toLowerCase()) {
    case 'url-test': return 'url-test';
    case 'fallback': return 'fallback';
    case 'load-balance': return 'load-balance';
    default: return 'select';
  }
}

// ============================================================
// 规则
// ============================================================

function buildRules(
  sourceConfig: ClashConfig,
  iniConfig: ParsedIniConfig,
  params: ConversionParams,
  ruleContents: Record<string, string[]>,
  emitted: Set<string>,
  groupNames: Set<string>,
  nodeNameMap: Map<string, string>,
  surgeNameOf: (name: string) => string
): string[] {
  const rules = collectFinalRules(sourceConfig, iniConfig, params, ruleContents, {
    finalType: 'FINAL',
    onMissingContent: entry => `# 规则集下载失败: ${entry.groupName}`,
  });
  const lines: string[] = [];
  let fallbackTarget: string | undefined;

  for (const rule of rules) {
    if (!rule || rule.startsWith('#')) continue;
    const parsed = parseSurgeRule(rule);
    if (!parsed) continue;

    const target = resolveSurgeTarget(parsed.target, emitted, groupNames, nodeNameMap);
    if (!target) continue;

    if (parsed.type === 'MATCH' || parsed.type === 'FINAL') {
      fallbackTarget = target;
      break;
    }

    const converted = convertRuleToSurge(parsed);
    if (!converted) continue;
    // 规则取值里也可能含逗号（URL-REGEX、PROCESS-NAME），同样需要净化
    const type = parsed.type;
    const safeValue = sanitizeSurgeValue(parsed.value);
    const body = type === 'URL-REGEX' || type === 'PROCESS-NAME'
      ? `${type},${safeValue}`
      : converted;
    lines.push(`${body},${surgeNameOf(target)}${parsed.noResolve ? ',no-resolve' : ''}`);
  }

  // Surge 需要 FINAL 兜底；缺失时补一条，避免未命中流量没有出口
  if (!fallbackTarget) {
    fallbackTarget = pickSurgeFallback(groupNames, emitted);
  }
  if (fallbackTarget) lines.push(`FINAL,${surgeNameOf(fallbackTarget)}`);

  return lines;
}

interface SurgeRule {
  type: string;
  value: string;
  target: string;
  noResolve: boolean;
}

function parseSurgeRule(rule: string): SurgeRule | null {
  const parts = rule.split(',').map(part => part.trim());
  if (parts.length < 2) return null;
  const type = parts[0].toUpperCase();
  let end = parts.length;
  let noResolve = false;
  if (parts[parts.length - 1].toLowerCase() === 'no-resolve') {
    noResolve = true;
    end -= 1;
  }
  if (end < 2) return null;
  if (type === 'MATCH' || type === 'FINAL') {
    return { type, value: '', target: parts[end - 1] || 'DIRECT', noResolve };
  }
  const hasTarget = end >= 3;
  return {
    type,
    value: parts.slice(1, hasTarget ? end - 1 : end).join(','),
    target: hasTarget ? parts[end - 1] : 'DIRECT',
    noResolve,
  };
}

function resolveSurgeTarget(
  target: string,
  emitted: Set<string>,
  groupNames: Set<string>,
  nodeNameMap: Map<string, string>
): string | null {
  const mapped = nodeNameMap.get(target) || target;
  if (emitted.has(mapped) || groupNames.has(mapped)) return mapped;
  const upper = mapped.toUpperCase();
  if (upper === 'REJECT' || upper === 'REJECT-TLS' || upper === 'REJECT-DROP' || upper === 'REJECT-NO-DROP') {
    return upper;
  }
  if (upper === 'DIRECT' || upper === 'PASS' || upper === 'COMPATIBLE') return 'DIRECT';
  // 目标不存在（对应节点被跳过）：丢弃该规则，交给 FINAL 兜底
  return null;
}

function pickSurgeFallback(groupNames: Set<string>, emitted: Set<string>): string | undefined {
  for (const name of groupNames) return name;
  for (const name of emitted) return name;
  return 'DIRECT';
}

/** Clash 规则 → Surge 规则主体（不含策略名） */
function convertRuleToSurge(parsed: SurgeRule): string | null {
  const { type, value } = parsed;
  switch (type) {
    case 'DOMAIN':
    case 'DOMAIN-SUFFIX':
    case 'DOMAIN-KEYWORD':
    case 'DOMAIN-WILDCARD':
    case 'IP-CIDR':
    case 'IP-CIDR6':
    case 'IP-ASN':
    case 'GEOIP':
    case 'SRC-IP':
    case 'SRC-PORT':
    case 'DST-PORT':
    case 'PROTOCOL':
    case 'USER-AGENT':
    case 'URL-REGEX':
    case 'PROCESS-NAME':
    case 'SUBNET':
      return `${type},${value}`;
    default:
      return null;
  }
}

// ============================================================
// 节点转换
// ============================================================

/** 把 Clash 代理节点转换为 Surge [Proxy] 行；不支持的类型返回 null */
export function convertNodeToSurgeProxy(node: ProxyNode, params: ConversionParams, displayName?: string): string | null {
  const type = String(node.type || '').toLowerCase();
  const surgeType = SURGE_TYPE_MAP[type];
  if (!surgeType) {
    console.warn(`[Surge] 不支持的节点类型: ${type} (${node.name})，已跳过`);
    return null;
  }

  const name = displayName ?? escapeSurgeName(node.name);
  const head = `${name} = ${surgeType}, ${node.server}, ${node.port}`;
  const extras: string[] = [];

  // ---- 通用参数 ----
  const udpRelay = supportsUdpRelay(type) && (params.udp === true || node.udp === true);
  if (udpRelay) extras.push('udp-relay=true');
  if (params.tfo === true || node.tfo === true) extras.push('tfo=true');

  switch (type) {
    case 'ss': {
      const parts = [`encrypt-method=${node.cipher || 'aes-128-gcm'}`, `password=${node.password || ''}`];
      const obfs = ssObfs(node);
      if (obfs) parts.push(...obfs);
      return joinProxy(head, parts, extras);
    }

    case 'snell': {
      const version = resolveSnellVersion(node.version);
      const parts = [`psk=${node.psk ?? node.password ?? ''}`, `version=${version}`];
      // 官方：v1-3 支持 obfs=http|tls，v4-5 仅 http，v6 不支持混淆
      const obfsOpts = asRecord(node['obfs-opts']);
      const mode = String(obfsOpts.mode || '').toLowerCase();
      const allowed = version <= 3 ? ['http', 'tls'] : version <= 5 ? ['http'] : [];
      if (allowed.includes(mode)) {
        parts.push(`obfs=${mode}`);
        if (typeof obfsOpts.host === 'string' && obfsOpts.host) parts.push(`obfs-host=${obfsOpts.host}`);
        if (typeof obfsOpts.uri === 'string' && obfsOpts.uri) parts.push(`obfs-uri=${obfsOpts.uri}`);
      }
      return joinProxy(head, parts, extras);
    }

    case 'vmess': {
      const parts = [`username=${node.uuid || ''}`];
      // 官方：encrypt-method 仅 aes-128-gcm / chacha20-ietf-poly1305，默认 aes-128-gcm；
      // vmess-aead 必须与服务端一致（Clash 侧 alterId=0 即 AEAD）
      const cipher = typeof node.cipher === 'string' ? node.cipher.toLowerCase() : '';
      if (cipher === 'aes-128-gcm' || cipher === 'chacha20-ietf-poly1305') {
        parts.push(`encrypt-method=${cipher}`);
      }
      parts.push(`vmess-aead=${readAlterId(node) === 0 ? 'true' : 'false'}`);
      appendWsParams(parts, node);
      appendTlsParams(parts, node, params);
      return joinProxy(head, parts, extras);
    }

    case 'trojan': {
      const parts = [`password=${node.password || ''}`];
      appendWsParams(parts, node);
      appendTlsParams(parts, node, params);
      return joinProxy(head, parts, extras);
    }

    case 'tuic': {
      const parts = [`uuid=${node.uuid || ''}`, `password=${node.password || ''}`];
      appendTlsParams(parts, node, params, { includeSni: true });
      return joinProxy(head.replace('= tuic,', '= tuic-v5,'), parts, extras);
    }

    case 'hysteria2': {
      const parts = [`password=${node.password || ''}`];
      const download = parseBandwidthMbps(node.down);
      if (download !== undefined) parts.push(`download-bandwidth=${download}`);
      // 官方：Salamander 混淆用 salamander-password（与 gecko-password 互斥）
      const obfsPassword = node['obfs-password'];
      if (String(node.obfs || '').toLowerCase() === 'salamander'
        && typeof obfsPassword === 'string' && obfsPassword) {
        parts.push(`salamander-password=${obfsPassword}`);
      }
      appendTlsParams(parts, node, params, { includeSni: true });
      return joinProxy(head, parts, extras);
    }

    case 'anytls': {
      const parts = [`password=${node.password || ''}`];
      appendTlsParams(parts, node, params, { includeSni: true });
      // anytls 不支持 udp-relay，去掉通用 UDP 参数
      return joinProxy(head, parts, extras.filter(item => item !== 'udp-relay=true'));
    }

    case 'ssh': {
      const parts: string[] = [];
      if (typeof node.username === 'string' && node.username) parts.push(`username=${node.username}`);
      if (typeof node.password === 'string' && node.password) parts.push(`password=${node.password}`);
      return joinProxy(head, parts, extras.filter(item => item !== 'udp-relay=true'));
    }

    case 'http':
    case 'https':
    case 'socks5': {
      // 官方语法：用户名与密码是位置参数
      const positional: string[] = [];
      if (typeof node.username === 'string' && node.username) {
        positional.push(POSITIONAL_PREFIX + node.username);
        positional.push(POSITIONAL_PREFIX + (typeof node.password === 'string' ? node.password : ''));
      }
      const parts: string[] = [];
      appendTlsParams(parts, node, params, { includeSni: type === 'socks5' });
      // 官方语法：用户名与密码是紧跟 port 的位置参数，必须排在 key=value 之前
      return joinProxy(head, [...positional, ...parts], extras);
    }
  }

  return null;
}

function supportsUdpRelay(type: string): boolean {
  // anytls / ssh 不支持 udp-relay
  return type !== 'anytls' && type !== 'ssh';
}

/** SS 的 obfs 参数：Surge 用 obfs=<mode> 与 obfs-host=<host> */
function ssObfs(node: ProxyNode): string[] {
  const plugin = typeof node.plugin === 'string' ? node.plugin.toLowerCase() : '';
  if (plugin !== 'obfs' && plugin !== 'simple-obfs') return [];
  const opts = asRecord(node['plugin-opts']);
  const mode = String(opts.mode || 'http');
  if (mode !== 'http' && mode !== 'tls') return [];
  const host = typeof opts.host === 'string' && opts.host ? opts.host : undefined;
  return host ? [`obfs=${mode}`, `obfs-host=${host}`] : [`obfs=${mode}`];
}

function appendTlsParams(
  parts: string[],
  node: ProxyNode,
  params: ConversionParams,
  options: { includeSni?: boolean } = {}
): void {
  const tls = node.tls === true || node.reality === true || Boolean(node['reality-opts']);
  if (tls) parts.push('tls=true');
  if (options.includeSni !== false) {
    const sni = typeof node.servername === 'string' && node.servername
      ? node.servername
      : (typeof node.sni === 'string' && node.sni ? node.sni : undefined);
    if (sni) parts.push(`sni=${sni}`);
  }
  appendAlpn(parts, node);
  if (params.scv === true || node['skip-cert-verify'] === true) parts.push('skip-cert-verify=true');
}

function appendAlpn(parts: string[], node: ProxyNode): void {
  const alpn = normalizeAlpn(node.alpn);
  if (alpn.length > 0) parts.push(`alpn=${alpn.join(',')}`);
}

function appendWsParams(parts: string[], node: ProxyNode): void {
  const network = typeof node.network === 'string' ? node.network.toLowerCase() : '';
  if (network !== 'ws') return;
  const opts = asRecord(node['ws-opts']);
  parts.push('ws=true');
  const path = typeof opts.path === 'string' ? opts.path : undefined;
  if (path) parts.push(`ws-path=${path}`);
  const headers = asRecord(opts.headers);
  const headerParts: string[] = [];
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || value === null) continue;
    headerParts.push(`${key}:${String(value)}`);
  }
  if (headerParts.length > 0) parts.push(`ws-headers=${headerParts.join('|')}`);
}

function normalizeAlpn(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => String(item)).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,;]/).map(item => item.trim()).filter(Boolean);
  return [];
}

/**
 * Surge 的 snell 版本。
 * 官方支持 v1-v6，且 obfs 可用取值随版本变化，因此必须保留源版本；
 * 缺失或非法时才回退到当前最通用的 v4。
 */
export function resolveSnellVersion(value: unknown): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 6) return parsed;
  return 4;
}

/** Clash 的 down 带宽（"100 Mbps" / 100）→ Surge 的 download-bandwidth（Mbps） */
export function parseBandwidthMbps(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value);
  if (typeof value !== 'string') return undefined;
  const match = value.trim().match(/^([\d.]+)\s*([a-zA-Z/]*)$/);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const unit = match[2].toLowerCase();
  if (unit.startsWith('k')) return Math.max(1, Math.round(amount / 1024));
  if (unit.startsWith('g')) return Math.round(amount * 1024);
  return Math.round(amount);
}

/**
 * Surge 的策略名净化。
 *
 * Surge 的 INI 行以逗号切分字段，官方文档只承诺「双引号值内」支持 \" 与 \\ 转义，
 * 并未承诺策略名支持反斜杠转义；一旦名称含逗号，[Proxy Group] 的成员列表会被切碎。
 * 因此这里把逗号、等号与控制字符统一替换为下划线，保证三个段落里的名称一致可解析。
 * 需要保留原名时可用 rename 参数改写节点名。
 */
export function escapeSurgeName(name: string): string {
  const sanitized = sanitizeSurgeValue(name);
  return sanitized || 'node';
}

/** Clash 的 log-level → Surge 的 loglevel */
function normalizeLogLevel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  switch (value.toLowerCase()) {
    case 'silent': return 'notify';
    case 'error': return 'error';
    case 'warning': return 'warning';
    case 'info': return 'notify';
    case 'debug': return 'verbose';
    default: return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/**
 * 合并 [Proxy] 行的参数片段：同名参数只保留最后一次出现的值，
 * 避免 appendTlsParams 与 appendAlpn 各自追加 alpn 造成重复。
 * 形如 `Name = type, host, port` 的前三段与位置参数（无 =）原样保留。
 */
/**
 * 拼接一条 [Proxy] 行。
 * head 形如 `Name = type, host, port`；params 是逐个参数；
 * 同名参数只保留最后一次出现的值（appendTlsParams 与 appendAlpn 都可能加 alpn）。
 * positional 由调用方直接放进 params 前部（官方语法要求位置参数紧跟 port）。
 */
export function joinProxy(head: string, params: string[], extras: string[] = []): string {
  const tokens: string[] = [];
  const seen = new Map<string, number>();

  for (const raw of [...params, ...extras]) {
    const token = String(raw ?? '').trim();
    if (!token) continue;

    // 显式标记的位置参数（http/socks5 的用户名与密码）：
    // 即使取值里含 `=` 也必须原样作为裸值输出，不能当成参数名
    if (token.startsWith(POSITIONAL_PREFIX)) {
      const sanitized = sanitizeSurgeValue(token.slice(POSITIONAL_PREFIX.length));
      if (sanitized) tokens.push(sanitized);
      continue;
    }

    const eq = token.indexOf('=');
    if (eq === -1) {
      const sanitized = sanitizeSurgeValue(token);
      if (sanitized) tokens.push(sanitized);
      continue;
    }
    const key = token.slice(0, eq).trim().toLowerCase();
    const value = sanitizeSurgeValue(token.slice(eq + 1));
    const normalized = `${key}=${value}`;
    const existing = seen.get(key);
    if (existing !== undefined) {
      tokens[existing] = normalized;
      continue;
    }
    seen.set(key, tokens.length);
    tokens.push(normalized);
  }

  return [sanitizeHead(head), ...tokens].join(', ');
}

/**
 * 净化写入 [Proxy] 行的取值：逗号/等号会破坏字段切分，引号会触发引号语义，
 * 控制字符无法表达，统一替换为下划线或空格。
 */
export function sanitizeSurgeValue(value: string): string {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[,="]+/g, '_')
    .replace(/_{2,}/g, '_')
    .trim();
}

/** head 形如 `Name = type, host, port`：名称与 host 都要净化，类型名不动 */
function sanitizeHead(head: string): string {
  const eq = head.indexOf('=');
  if (eq === -1) return head;
  const name = head.slice(0, eq);
  const rest = head.slice(eq + 1);
  const parts = rest.split(',');
  const type = (parts[0] ?? '').trim();
  const host = sanitizeSurgeValue(parts[1] ?? '');
  const port = (parts[2] ?? '').trim();
  return `${name.trim()} = ${type}, ${host}, ${port}`;
}

/**
 * 收集规则里出现的目标策略名（用于补建缺失的策略组）。
 * 与 buildRules 使用同一套解析逻辑，保证判断口径一致。
 */
function collectRuleTargets(
  sourceConfig: ClashConfig,
  iniConfig: ParsedIniConfig,
  params: ConversionParams,
  ruleContents: Record<string, string[]>,
  nodeNameMap: Map<string, string>
): string[] {
  const rules = collectFinalRules(sourceConfig, iniConfig, params, ruleContents, { finalType: 'FINAL' });
  const targets: string[] = [];
  for (const rule of rules) {
    if (!rule || rule.startsWith('#')) continue;
    const parsed = parseSurgeRule(rule);
    if (!parsed) continue;
    targets.push(nodeNameMap.get(parsed.target) || parsed.target);
    if (parsed.type === 'MATCH' || parsed.type === 'FINAL') break;
  }
  return targets;
}

/** Clash 的 alterId（兼容 alterid / alter-id 写法）：0 表示 AEAD */
function readAlterId(node: ProxyNode): number {
  const value = node.alterId ?? node.alterid ?? node['alter-id'];
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}
