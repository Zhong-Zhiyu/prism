// ============================================================
// sing-box 配置生成器（目标版本 1.14+）
//
// 设计要点：
//   - DNS 段必须用 1.12+ 的新服务端格式，见 singbox-dns.ts
//   - 路由段必须避免 geoip/geosite 直方字段（1.12 已移除），见 singbox-rules.ts
//   - 所有策略组都会生成为 selector/urltest 出站，规则目标一律做引用校验，
//     避免出现「悬空 outbound 引用」这类内核不报错但流量失控的配置
//   - 节点逐协议转换，传输层（ws / grpc / h2 / reality / utls）完整保留
// ============================================================

import type { ClashConfig, ProxyNode, ParsedIniConfig, ConversionParams, ProxyGroup } from '../utils/types';
import { expandPlaceholderProxies } from '../parsers/ini-parser';
import { filterValidNodes, mapNodeReference, prepareNodes } from '../utils/node-utils';
import { collectFinalRules } from '../utils/rule-collector';
import { convertClashDnsToSingbox } from './singbox-dns';
import {
  RULE_SET_HTTP_CLIENT,
  convertClashRuleProviders,
  convertRulesToSingbox,
  parseRuleForSingbox,
} from './singbox-rules';

// ============================================================
// 出站类型映射
// ============================================================

/**
 * Clash 节点类型 → sing-box outbound 类型。
 * 注意：sing-box 1.6 起移除了 shadowsocksr，因此 ssr 不能映射；
 * snell 仅支持 version 4。
 */
const SINGBOX_TYPE_MAP: Record<string, string> = {
  ss: 'shadowsocks',
  vmess: 'vmess',
  vless: 'vless',
  trojan: 'trojan',
  hysteria: 'hysteria',
  hysteria2: 'hysteria2',
  tuic: 'tuic',
  snell: 'snell',
  http: 'http',
  https: 'http',
  socks5: 'socks',
  socks: 'socks',
  anytls: 'anytls',
};

/** sing-box 完全不支持（或被上游移除）的 Clash 节点类型 */
const UNSUPPORTED_TYPES = new Set(['ssr', 'mieru', 'wireguard', 'juicity', 'ssh', 'naive']);

const DEFAULT_MIXED_PORT = 2080;

interface OutboundGroup {
  tag: string;
  type: 'selector' | 'urltest';
  members: string[];
  url?: string;
  interval?: number;
  tolerance?: number;
  defaultTag?: string;
}

/**
 * 生成 sing-box 格式的 JSON 配置
 */
export function generateSingboxConfig(
  sourceConfig: ClashConfig,
  iniConfig: ParsedIniConfig,
  params: ConversionParams,
  ruleContents: Record<string, string[]>
): string {
  const warnings: string[] = [];
  // 先剔除字段不完整的节点，避免内核因单个畸形节点拒绝整份配置
  const { nodes: validProxies, dropped: droppedNodes } = filterValidNodes(sourceConfig.proxies || []);
  const prepared = prepareNodes(validProxies, params);
  const allNodes = prepared.nodes;
  const allNodeNames = prepared.allNames;

  // ---- 出站：节点 ----
  const outbounds: Record<string, unknown>[] = [
    { type: 'direct', tag: 'DIRECT' },
    { type: 'block', tag: 'REJECT' },
  ];

  const skipped = new Map<string, number>(droppedNodes);
  const nodeTags = new Set<string>();
  for (const node of allNodes) {
    const outbound = convertNodeToSingboxOutbound(node);
    if (!outbound) {
      skipped.set(node.type, (skipped.get(node.type) ?? 0) + 1);
      continue;
    }
    const tag = String(outbound.tag);
    if (nodeTags.has(tag)) continue; // prepareNodes 已去重，这里只做最后保险
    nodeTags.add(tag);
    outbounds.push(outbound);
  }

  // ---- 出站：策略组 ----
  const groupSpecs = planGroups(sourceConfig['proxy-groups'], iniConfig, params, allNodeNames, prepared.displayNames);
  const groupTags = new Set(groupSpecs.map(spec => spec.tag));
  const availableTags = new Set<string>([...nodeTags, ...groupTags, 'DIRECT', 'REJECT']);

  // ---- 路由（先解析规则：规则引用的策略组若不存在，需要按全集补建出站） ----
  // collectRules 内部已完成装配与裁剪（含终止规则让位），这里不再重复裁剪
  const rules = collectRules(sourceConfig, iniConfig, params, ruleContents, warnings);
  const preselectedFallback = pickFallbackTag(groupSpecs, availableTags);
  const providerPlan = convertClashRuleProviders(
    sourceConfig['rule-providers'] as Record<string, never> | undefined
  );
  const routeResult = convertRulesToSingbox(rules, {
    nodeNameMap: prepared.displayNames,
    availableTags,
    fallbackTag: preselectedFallback,
    ruleProviderTags: providerPlan.tags,
    geoRules: params.geo_rules === 'skip' ? 'skip' : 'remote',
  });
  warnings.push(...routeResult.warnings);

  // ---- 出站：策略组（含为缺失目标合成的组，必须排在规则引用之前） ----
  const emittedGroups = new Set<string>();
  const groupOutbounds: Record<string, unknown>[] = [];

  const appendGroup = (tag: string, type: 'selector' | 'urltest', candidates: string[],
    url?: string, interval?: number, tolerance?: number): void => {
    if (emittedGroups.has(tag)) return;
    let members = dedupe(candidates).filter(member =>
      (availableTags.has(member) || member === 'DIRECT' || member === 'REJECT') && member !== tag);
    if (members.length === 0) {
      // 回退到全部节点，保证规则与 route.final 的引用始终有效
      members = [...allNodeNames].filter(name => name !== tag && availableTags.has(name));
      if (members.length === 0) members = ['DIRECT'];
      warnings.push(`策略组「${tag}」的成员均不可用，已回退为全部节点`);
    }
    const outbound: Record<string, unknown> = { type, tag };
    if (type === 'urltest') {
      outbound.outbounds = members;
      outbound.url = url || 'http://www.gstatic.com/generate_204';
      // 实测内核约束：urltest 的 interval 必须 <= idle_timeout（默认 5m），
      // 因此把探测间隔钳到 3m 以内，并显式给出较长的 idle_timeout
      outbound.interval = `${clampInterval(interval)}s`;
      outbound.idle_timeout = '30m';
      if (tolerance && tolerance > 0) outbound.tolerance = tolerance;
    } else {
      outbound.outbounds = members.length > 1 ? members : [...members, 'DIRECT'];
      outbound.default = members[0];
    }
    emittedGroups.add(tag);
    groupOutbounds.push(outbound);
  };

  // 配置里的策略组先输出（与 Clash / Surge 的段内顺序保持一致）
  for (const spec of groupSpecs) {
    appendGroup(spec.tag, spec.type, spec.members, spec.url, spec.interval, spec.tolerance);
  }
  // 规则引用了不存在的策略组：用全部节点合成一个 select，保住规则语义；
  // 没有任何可用节点时回退到 DIRECT，保证引用始终有效
  for (const tag of routeResult.missingGroups) {
    appendGroup(tag, 'selector', allNodeNames.length > 0 ? [...allNodeNames] : ['DIRECT']);
  }
  const emittedGroupTags = new Set(groupOutbounds.map(outbound => String(outbound.tag)));
  outbounds.push(...groupOutbounds);

  // ---- DNS ----
  const effectiveFallback = groupOutbounds.length > 0
    ? emittedGroupTags.has(String(routeResult.final)) ? String(routeResult.final) : String(groupOutbounds[0].tag)
    : undefined;
  const dnsResult = convertClashDnsToSingbox(sourceConfig.dns, { proxyDetour: effectiveFallback });
  warnings.push(...dnsResult.warnings);

  // ---- 组装 ----
  const config: Record<string, unknown> = {
    log: { level: typeof sourceConfig['log-level'] === 'string' ? sourceConfig['log-level'] : 'info' },
  };

  if (dnsResult.dns) config.dns = dnsResult.dns;

  config.inbounds = buildInbounds(sourceConfig, params);

  config.outbounds = outbounds;

  const route: Record<string, unknown> = {};
  if (routeResult.rules.length > 0) route.rules = routeResult.rules;
  if (routeResult.final) route.final = routeResult.final;
  route.auto_detect_interface = true;
  if (dnsResult.domainResolverTag) {
    route.default_domain_resolver = { server: dnsResult.domainResolverTag };
  }
  const allRuleSets = [...routeResult.ruleSets, ...providerPlan.ruleSets];
  if (allRuleSets.length > 0) {
    route.rule_set = allRuleSets;
    // 显式声明规则集下载使用的 HTTP 客户端，避免内核走「隐式默认出站」的弃用路径。
    // 实测：
    //   - http_clients 是 1.14 的顶层字段，不在 experimental 下
    //   - detour 指向内置 direct 会被内核拒绝（"detour to an empty direct outbound makes no sense"），
    //     指向 select 组或具体节点则会因节点不可用导致启动失败，
    //     因此这里只声明 tag、不指定 detour，交由内核使用默认出站
    config.http_clients = [{ tag: RULE_SET_HTTP_CLIENT }];
  }
  config.route = route;

  if (params.geo_rules === 'skip' && routeResult.dropped.size > 0) {
    warnings.push('geo_rules=skip：已丢弃 GEOIP/GEOSITE 规则，配置不再需要运行时下载规则集');
  }

  if (providerPlan.skipped.length > 0) {
    warnings.push(`本地文件型 rule-provider 无法在转换时获取，已跳过: ${providerPlan.skipped.join('、')}`);
  }

  if (skipped.size > 0) {
    const detail = [...skipped.entries()].map(([type, count]) => `${type}×${count}`).join('、');
    const total = [...skipped.values()].reduce((sum, count) => sum + count, 0);
    console.warn(`[sing-box] 已跳过 ${total} 个不支持的节点: ${detail}`);
    warnings.push(`已跳过 sing-box 不支持的节点: ${detail}`);
  }
  if (routeResult.dropped.size > 0) {
    const detail = [...routeResult.dropped.entries()].map(([type, count]) => `${type}×${count}`).join('、');
    const total = [...routeResult.dropped.values()].reduce((sum, count) => sum + count, 0);
    console.warn(`[sing-box] 已跳过 ${total} 条无法转换的规则: ${detail}`);
    warnings.push(`已跳过无法转换的规则: ${detail}`);
  }

  return JSON.stringify(config, null, 2);
}

// ============================================================
// 策略组规划
// ============================================================

function planGroups(
  sourceGroups: ProxyGroup[] | undefined,
  iniConfig: ParsedIniConfig,
  params: ConversionParams,
  allNodeNames: string[],
  nodeNameMap: Map<string, string>
): OutboundGroup[] {
  const specs: OutboundGroup[] = [];

  // 源策略组里的成员写的是「原始节点名」，而 outbound tag 用的是 display 名
  // （rename / append_type / emoji 都会改变），必须做映射，否则成员全部失效
  const mapMembers = (members: string[]): string[] =>
    members.map(member => mapNodeReference(member, nodeNameMap));

  if (params.config && iniConfig.customProxyGroups.length > 0) {
    const expanded = expandPlaceholderProxies(iniConfig.customProxyGroups, allNodeNames);
    for (const group of expanded) {
      specs.push({
        tag: group.name,
        type: group.groupType === 'url-test' ? 'urltest' : 'selector',
        members: dedupe(mapMembers(group.proxies)),
        url: group.url,
        interval: group.interval,
      });
    }
  } else if (sourceGroups && sourceGroups.length > 0) {
    for (const group of sourceGroups) {
      const type = (group.type || 'select').toLowerCase();
      specs.push({
        tag: group.name,
        type: type === 'url-test' || type === 'load-balance' ? 'urltest' : 'selector',
        members: dedupe(mapMembers(group.proxies || [])),
        url: group.url,
        interval: group.interval,
        tolerance: group.tolerance,
      });
    }
  }

  // 兜底：没有任何策略组时，用一个 select 包住所有节点
  if (specs.length === 0 && allNodeNames.length > 0) {
    specs.push({ tag: 'PROXY', type: 'selector', members: [...allNodeNames] });
  }

  return specs;
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/** 选择 route.final 的兜底出口：优先第一个 select 组，其次 DIRECT */
function pickFallbackTag(groups: OutboundGroup[], availableTags: Set<string>): string | undefined {
  const usable = groups.filter(group => availableTags.has(group.tag));
  const selector = usable.find(group => group.type === 'selector');
  if (selector) return selector.tag;
  if (usable.length > 0) return usable[0].tag;
  if (availableTags.has('DIRECT')) return 'DIRECT';
  for (const tag of availableTags) {
    if (tag !== 'REJECT') return tag;
  }
  return undefined;
}

// ============================================================
// 规则收集
// ============================================================

function collectRules(
  sourceConfig: ClashConfig,
  iniConfig: ParsedIniConfig,
  params: ConversionParams,
  ruleContents: Record<string, string[]>,
  warnings: string[]
): string[] {
  if (iniConfig.rulesetEntries.length === 0 && params.config) {
    warnings.push('外部配置未包含 ruleset 条目，已仅使用订阅自带规则');
  }
  return collectFinalRules(sourceConfig, iniConfig, params, ruleContents, {
    finalType: 'MATCH',
    onMissingContent: entry => `# 规则集下载失败: ${entry.groupName}`,
  });
}

/**
 * mixed 入站端口：优先 mixed-port，其次 port。
 * 源订阅没有声明任何端口时返回 undefined——此时只输出 TUN 入站，
 * 不再凭空造一个 localhost 代理端口。
 */
function resolveInboundPort(config: ClashConfig): number | undefined {
  const mixed = config['mixed-port'];
  if (typeof mixed === 'number' && mixed > 0 && mixed <= 65535) return mixed;
  const port = config.port;
  if (typeof port === 'number' && port > 0 && port <= 65535) return port;
  return undefined;
}

/** 入站监听地址：沿用源配置的 allow-lan / bind-address 语义 */
function resolveInboundListen(config: ClashConfig): string {
  if (config['allow-lan'] !== true) return '127.0.0.1';
  const bind = config['bind-address'];
  if (typeof bind === 'string' && bind && bind !== '*') return bind;
  return '0.0.0.0';
}

// ============================================================
// 节点转换
// ============================================================

/** 把 Clash 代理节点转换为 sing-box outbound；不支持的返回 null */
export function convertNodeToSingboxOutbound(node: ProxyNode): Record<string, unknown> | null {
  const type = String(node.type || '').toLowerCase();
  if (UNSUPPORTED_TYPES.has(type)) {
    console.warn(`[sing-box] 不支持的节点类型: ${type} (${node.name})，已跳过`);
    return null;
  }
  const singboxType = SINGBOX_TYPE_MAP[type];
  if (!singboxType) {
    console.warn(`[sing-box] 未映射的节点类型: ${type} (${node.name})，已跳过`);
    return null;
  }

  const outbound: Record<string, unknown> = {
    type: singboxType,
    tag: node.name,
    server: node.server,
    server_port: node.port,
  };

  switch (type) {
    case 'ss':
      outbound.method = node.cipher || 'aes-128-gcm';
      outbound.password = node.password || '';
      applyShadowsocksPlugin(outbound, node);
      break;
    case 'vmess':
      outbound.uuid = node.uuid || '';
      outbound.alter_id = readAlterId(node);
      if (typeof node.cipher === 'string' && node.cipher && node.cipher !== 'auto') {
        outbound.security = node.cipher;
      }
      break;
    case 'vless':
      outbound.uuid = node.uuid || '';
      if (typeof node.flow === 'string' && node.flow) outbound.flow = node.flow;
      break;
    case 'trojan':
      outbound.password = node.password || '';
      break;
    case 'hysteria':
    case 'hysteria2': {
      outbound.password = node.password || '';
      applyBandwidth(outbound, node);
      const obfs = node.obfs;
      if (type === 'hysteria2' && typeof obfs === 'string' && obfs === 'salamander') {
        const obfsPassword = node['obfs-password'];
        if (typeof obfsPassword === 'string' && obfsPassword) {
          outbound.obfs = { type: 'salamander', password: obfsPassword };
        }
      }
      break;
    }
    case 'tuic':
      if (typeof node.uuid === 'string' && node.uuid) outbound.uuid = node.uuid;
      outbound.password = node.password || '';
      if (typeof node['congestion-controller'] === 'string' && node['congestion-controller']) {
        outbound.congestion_control = node['congestion-controller'];
      }
      if (typeof node['udp-relay-mode'] === 'string' && node['udp-relay-mode']) {
        outbound.udp_relay_mode = node['udp-relay-mode'];
      }
      break;
    case 'snell':
      // sing-box 1.14 只接受 snell v4，且没有 obfs 字段（实测 obfs/obfs_opts 均被拒绝）
      outbound.version = 4;
      outbound.psk = String(node.psk ?? node.password ?? '');
      if (node['obfs-opts'] !== undefined) {
        console.warn(`[sing-box] snell 节点 ${node.name} 的 obfs 在 sing-box 中无对应字段，已忽略`);
      }
      break;
    case 'http':
    case 'https':
      if (typeof node.username === 'string' && node.username) outbound.username = node.username;
      if (typeof node.password === 'string' && node.password) outbound.password = node.password;
      break;
    case 'socks5':
    case 'socks':
      outbound.version = '5';
      if (typeof node.username === 'string' && node.username) outbound.username = node.username;
      if (typeof node.password === 'string' && node.password) outbound.password = node.password;
      break;
    case 'anytls':
      outbound.password = node.password || '';
      break;
  }

  applyTransport(outbound, node);
  applyTls(outbound, node, shouldEnableTls(type, node));

  // sing-box 没有 udp 布尔开关：节点显式关闭 UDP 时限制为 tcp
  if (node.udp === false && outbound.network === undefined) {
    outbound.network = 'tcp';
  }

  return outbound;
}

/** 需要 TLS 的协议类型（无论 Clash 是否显式写 tls: true） */
function shouldEnableTls(type: string, node: ProxyNode): boolean {
  switch (type) {
    case 'trojan':
    case 'hysteria':
    case 'hysteria2':
    case 'tuic':
    case 'anytls':
    case 'https':
      return true;
    case 'vmess':
    case 'vless':
      return node.tls === true || Boolean(node['reality-opts'])
        || Boolean(node.servername) || Boolean(node.sni) || Boolean(node.alpn);
    case 'http':
      return node.tls === true;
    default:
      return false;
  }
}

function applyTls(outbound: Record<string, unknown>, node: ProxyNode, enable: boolean): void {
  const realityOpts = asRecord(node['reality-opts']);
  const hasReality = Object.keys(realityOpts).length > 0;
  const sni = typeof node.servername === 'string' && node.servername
    ? node.servername
    : (typeof node.sni === 'string' && node.sni ? node.sni : undefined);

  const needsTls = enable || hasReality || Boolean(sni) || Boolean(node.alpn) || node['skip-cert-verify'] === true;
  if (!needsTls) return;

  const tls: Record<string, unknown> = { enabled: true };
  if (sni) tls.server_name = sni;
  if (node['skip-cert-verify'] === true) tls.insecure = true;

  const alpn = normalizeAlpn(node.alpn);
  if (alpn.length > 0) tls.alpn = alpn;

  const fingerprint = typeof node['client-fingerprint'] === 'string' && node['client-fingerprint']
    ? node['client-fingerprint']
    : undefined;

  if (hasReality) {
    // 内核约束：reality 客户端必须启用 uTLS，否则启动即
    // "uTLS is required by reality client"；未指定指纹时用 chrome
    tls.utls = { enabled: true, fingerprint: fingerprint || 'chrome' };
  } else if (fingerprint) {
    tls.utls = { enabled: true, fingerprint };
  }

  if (hasReality) {
    const publicKey = typeof realityOpts['public-key'] === 'string' ? realityOpts['public-key'] : '';
    if (publicKey) {
      const reality: Record<string, unknown> = { enabled: true, public_key: publicKey };
      if (typeof realityOpts['short-id'] === 'string' && realityOpts['short-id']) {
        reality.short_id = realityOpts['short-id'];
      }
      tls.reality = reality;
    }
  }

  outbound.tls = tls;
}

function normalizeAlpn(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => String(item)).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,;]/).map(item => item.trim()).filter(Boolean);
  return [];
}

function applyTransport(outbound: Record<string, unknown>, node: ProxyNode): void {
  const network = typeof node.network === 'string' ? node.network.toLowerCase() : '';
  if (!network || network === 'tcp') return;

  if (network === 'ws') {
    const opts = asRecord(node['ws-opts']);
    const transport: Record<string, unknown> = { type: 'ws' };
    if (typeof opts.path === 'string' && opts.path) transport.path = opts.path;
    const headers = normalizeHeaders(opts.headers);
    if (Object.keys(headers).length > 0) transport.headers = headers;
    if (typeof opts['max-early-data'] === 'number') transport.max_early_data = opts['max-early-data'];
    if (typeof opts['early-data-header-name'] === 'string' && opts['early-data-header-name']) {
      transport.early_data_header_name = opts['early-data-header-name'];
    }
    outbound.transport = transport;
    return;
  }

  if (network === 'grpc') {
    const opts = asRecord(node['grpc-opts']);
    const transport: Record<string, unknown> = { type: 'grpc' };
    if (typeof opts['grpc-service-name'] === 'string' && opts['grpc-service-name']) {
      transport.service_name = opts['grpc-service-name'];
    }
    outbound.transport = transport;
    return;
  }

  if (network === 'h2' || network === 'http') {
    const opts = asRecord(node['h2-opts'] ?? node['http-opts']);
    const transport: Record<string, unknown> = { type: 'http' };
    // 内核要求 host 为数组、path 为字符串（Clash 侧两者都可能是数组）
    const host = normalizeStringList(opts.host);
    if (host.length > 0) transport.host = host;
    const path = normalizeStringList(opts.path);
    if (path.length > 0) transport.path = path[0];
    const headers = normalizeHeaders(opts.headers);
    if (Object.keys(headers).length > 0) transport.headers = headers;
    outbound.transport = transport;
    return;
  }

  if (network === 'httpupgrade') {
    const opts = asRecord(node['httpupgrade-opts'] ?? node['ws-opts']);
    const transport: Record<string, unknown> = { type: 'httpupgrade' };
    if (typeof opts.host === 'string' && opts.host) transport.host = opts.host;
    // path 必须是字符串，Clash 侧可能写成数组
    const upgradePath = normalizeStringList(opts.path);
    if (upgradePath.length > 0) transport.path = upgradePath[0];
    outbound.transport = transport;
  }
  // kcp / quic 等 sing-box 已无对应实现，静默忽略传输层
}

function applyShadowsocksPlugin(outbound: Record<string, unknown>, node: ProxyNode): void {
  const plugin = typeof node.plugin === 'string' ? node.plugin.toLowerCase() : '';
  const opts = asRecord(node['plugin-opts']);
  if (plugin === 'obfs') {
    const mode = typeof opts.mode === 'string' && opts.mode ? opts.mode : 'http';
    const host = typeof opts.host === 'string' ? opts.host : '';
    outbound.plugin = 'obfs-local';
    outbound.plugin_opts = `obfs=${mode};obfs-host=${host}`;
    return;
  }
  if (plugin === 'v2ray-plugin') {
    const parts: string[] = [];
    parts.push(`mode=${typeof opts.mode === 'string' && opts.mode ? opts.mode : 'websocket'}`);
    if (typeof opts.host === 'string' && opts.host) parts.push(`host=${opts.host}`);
    if (typeof opts.path === 'string' && opts.path) parts.push(`path=${opts.path}`);
    if (opts.tls === true) parts.push('tls');
    outbound.plugin = 'v2ray-plugin';
    outbound.plugin_opts = parts.join(';');
  }
}

function applyBandwidth(outbound: Record<string, unknown>, node: ProxyNode): void {
  const up = parseBandwidth(node.up);
  const down = parseBandwidth(node.down);
  if (up !== undefined) outbound.up_mbps = up;
  if (down !== undefined) outbound.down_mbps = down;
}

/** 把 "100 Mbps" / "100" / 100 统一解析为 Mbps 整数 */
export function parseBandwidth(value: unknown): number | undefined {
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

function readAlterId(node: ProxyNode): number {
  const value = node.alterId ?? node.alterid ?? node['alter-id'];
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeHeaders(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const record = asRecord(value);
  for (const [key, headerValue] of Object.entries(record)) {
    if (Array.isArray(headerValue)) {
      if (headerValue.length > 0) out[key] = String(headerValue[0]);
    } else if (headerValue !== undefined && headerValue !== null) {
      out[key] = String(headerValue);
    }
  }
  return out;
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => String(item)).filter(Boolean);
  if (typeof value === 'string' && value) return [value];
  return [];
}

export { parseRuleForSingbox };

/** urltest 探测间隔：钳制到 (0, 180] 秒，满足内核 interval <= idle_timeout 的约束 */
export function clampInterval(value: number | undefined): number {
  if (!value || !Number.isFinite(value) || value <= 0) return 180;
  return Math.min(Math.round(value), 180);
}

// ============================================================
// 入站
// ============================================================

/**
 * TUN 接口的默认地址段。
 * 避开常见内网网段，且与 mihomo 的默认一致。
 */
const TUN_DEFAULT_ADDRESS = '172.19.0.1/30';

/**
 * sing-box 的 TUN 接口名。
 * 留空时由内核按平台决定（移动端由 NetworkExtension 分配），
 * 显式指定反而可能在移动端导致创建失败。
 */
function resolveTunInterfaceName(sourceConfig: ClashConfig): string | undefined {
  const tun = sourceConfig.tun;
  if (tun && typeof tun === 'object' && !Array.isArray(tun)) {
    const name = (tun as Record<string, unknown>).device;
    if (typeof name === 'string' && name.trim() && name !== 'utun') return name.trim();
  }
  return undefined;
}

/**
 * 生成入站列表。
 *
 * 默认输出 TUN 入站：移动端（Android / iOS）的 sing-box 必须以 TUN 方式运行，
 * 只给 mixed 入站时不会启动系统 VPN（Android 静默不启动，iOS 建立会话失败）。
 *
 * mixed 入站只在源订阅显式声明了端口时输出——它面向「本机其他程序走代理」的场景，
 * 不是为了替代 VPN。
 */
function buildInbounds(sourceConfig: ClashConfig, params: ConversionParams): Record<string, unknown>[] {
  const inbounds: Record<string, unknown>[] = [];

  if (params.tun !== false) {
    // 只输出 Apple 与 Android 都支持的字段：
    //   mtu / strict_route / gso 在 Apple 平台为「未实现」，会让 iOS 无法启动服务
    //   interface_name 由 Darwin 管理，仅在源配置显式指定时输出
    const tun: Record<string, unknown> = {
      type: 'tun',
      tag: 'tun-in',
      address: [TUN_DEFAULT_ADDRESS],
      stack: 'mixed',
      // 手机端需要它接管系统流量；Apple 平台由 NetworkExtension 接管，该字段被忽略
      auto_route: true,
    };
    if (typeof params.tun_mtu === 'number' && params.tun_mtu > 0) {
      tun.mtu = Math.floor(params.tun_mtu);
    }
    const interfaceName = resolveTunInterfaceName(sourceConfig);
    if (interfaceName) tun.interface_name = interfaceName;
    inbounds.push(tun);
  }

  const port = resolveInboundPort(sourceConfig);
  if (port !== undefined) {
    inbounds.push({
      type: 'mixed',
      tag: 'mixed-in',
      listen: resolveInboundListen(sourceConfig),
      listen_port: port,
    });
  }

  // 兜底：两个入站都被排除时至少给一个，避免产物无法使用
  if (inbounds.length === 0) {
    inbounds.push({
      type: 'mixed',
      tag: 'mixed-in',
      listen: '127.0.0.1',
      listen_port: DEFAULT_MIXED_PORT,
    });
  }

  return inbounds;
}
