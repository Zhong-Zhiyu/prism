// ============================================================
// Clash (Mihomo) 配置生成器
// ============================================================

import type { ClashConfig, ProxyNode, ProxyGroup, ParsedIniConfig, ConversionParams, RulesetEntry } from '../utils/types';
import yaml from 'js-yaml';
import { dedupeRulesetEntries, expandPlaceholderProxies } from '../parsers/ini-parser';
import { filterValidNodes, mapNodeReference, parseClashRule, prepareNodes } from '../utils/node-utils';
import { expandRulesetEntries, isCidrLiteral, pruneRulesWithLog } from '../utils/rule-pruner';
import {
  MIHOMO_RULE_TYPES,
  describeDroppedTypes,
  filterSupportedRules,
  normalizeRulesForClash,
  totalDroppedRules,
} from '../utils/target-support';

/**
 * 生成 Clash 格式的 YAML 配置
 */
export function generateClashConfig(
  sourceConfig: ClashConfig,
  iniConfig: ParsedIniConfig,
  params: ConversionParams,
  ruleContents: Record<string, string[]>
): string {
  const lines: string[] = [];

  lines.push('# ====================================');
  lines.push('# Prism - 订阅转换工具');
  lines.push('# ====================================');
  lines.push('');

  // 先剔除字段不完整的节点，避免内核因单个畸形节点拒绝整份配置
  const { nodes: validProxies, dropped: droppedNodes } = filterValidNodes(sourceConfig.proxies || []);
  if (droppedNodes.size > 0) {
    const detail = [...droppedNodes.entries()].map(([type, count]) => `${type}×${count}`).join('、');
    console.warn(`[Prism] 已跳过 ${[...droppedNodes.values()].reduce((a, b) => a + b, 0)} 个字段不完整的节点: ${detail}`);
  }

  const prepared = prepareNodes(validProxies, params);
  const allNodes = prepared.nodes;
  const allNodeNames = prepared.allNames;
  const nodeNameMap = prepared.displayNames;

  // 新版 mihomo 已移除顶层 global-client-fingerprint：下放到每个节点，否则内核报 error
  const globalFingerprint = typeof sourceConfig['global-client-fingerprint'] === 'string'
    && sourceConfig['global-client-fingerprint']
    ? sourceConfig['global-client-fingerprint']
    : undefined;
  if (globalFingerprint) {
    for (const node of allNodes) {
      if (node['client-fingerprint'] === undefined) {
        (node as Record<string, unknown>)['client-fingerprint'] = globalFingerprint;
      }
    }
  }

  // 按原始顺序迭代，遇到保留段直接内联输出
  const RESERVED_KEYS = new Set(['proxies', 'proxy-groups', 'rules', 'dns', 'hosts', 'global-client-fingerprint']);
  for (const [key, value] of Object.entries(sourceConfig)) {
    if (value === undefined || value === null) continue;

    if (!RESERVED_KEYS.has(key)) {
      emitYamlKeyValue(lines, key, value, 0);
      continue;
    }

    // --- proxies ---
    if (key === 'proxies') {
      lines.push('proxies:');
      for (const node of allNodes) {
        lines.push(formatClashProxy(node, params));
      }
      lines.push(`# 共 ${allNodes.length} 个代理节点`);
      continue;
    }

    // --- proxy-groups ---
    // 策略组统一在主循环之后发射（见 emitProxyGroups）：
    // 源订阅可能完全没有 proxy-groups 键，此时外部配置定义的策略组不能被丢弃。
    if (key === 'proxy-groups') continue;

    // --- rules ---
    if (key === 'rules') {
      const sourceRules = Array.isArray(value)
        ? (value as unknown[]).filter((rule): rule is string => typeof rule === 'string')
        : [];

      if (iniConfig.rulesetEntries.length > 0) {
        if (params.expand !== false) {
          // 展开模式：源订阅规则在前，规则集条目按序在后，裁剪后逐条输出
          // 源订阅自带的终止规则（MATCH/FINAL）必须让位给外部配置的规则集：
          // 否则它排在规则集规则之前，会把整批规则集规则裁掉。
          const sourceNonTerminal = iniConfig.overwriteOriginalRules
            ? []
            : sourceRules.filter(rule => !isTerminalRule(rule));
          const rawRules = [
            ...sourceNonTerminal,
            ...expandRulesetEntries(iniConfig, ruleContents, 'MATCH',
              entry => `# ⚠ 规则集下载失败: ${entry.groupName}`),
          ];
          // 规则集末尾自带 FINAL，因此这里不做「终止后截断」
          const rules = params.dedup === false
            ? rawRules
            : pruneRulesWithLog(rawRules, { stopAtTerminal: false });
          writeClashRules(lines, rules, nodeNameMap);
        } else {
          // 非展开模式：条目去重 + 首个 FINAL 之后截断，provider 名按 URL 唯一化
          const deduped = dedupeRulesetEntries(iniConfig.rulesetEntries);
          const entries = params.dedup === false ? deduped : truncateRulesetsAfterFinal(deduped);
          const { providers, names } = planRuleProviders(entries, ruleContents);

          // 没有实际 provider 时不要输出空的 rule-providers 段头，否则 YAML 非法
          if (providers.length > 0) {
            lines.push('rule-providers:');
            for (const provider of providers) {
              lines.push(`  ${provider.name}:`);
              lines.push(`    type: http`);
              lines.push(`    behavior: ${provider.behavior}`);
              lines.push(`    url: "${esc(provider.url)}"`);
              lines.push(`    interval: 86400`);
            }
          }
          lines.push('rules:');
          for (const entry of entries) {
            const target = nodeNameMap.get(entry.groupName) || entry.groupName;
            if (entry.isSpecial) {
              if (entry.specialType === 'GEOIP' && entry.specialValue) {
                lines.push(`  - GEOIP,${entry.specialValue},${target}`);
              } else if (entry.specialType === 'FINAL') {
                lines.push(`  - MATCH,${target}`);
              }
            } else if (entry.url) {
              lines.push(`  - RULE-SET,${names.get(entry.url)},${target}`);
            }
          }
        }
      } else if (sourceRules.length > 0) {
        // 源规则可能来自多份订阅的合并，前一份的终止规则不应截断后一份
        const rules = params.dedup === false
          ? sourceRules
          : pruneRulesWithLog(sourceRules, { stopAtTerminal: false });
        writeClashRules(lines, rules, nodeNameMap);
      }
      continue;
    }

    // --- dns ---
    if (key === 'dns') {
      const dns = migrateClashDns(value);
      if (dns && Object.keys(dns).length > 0) {
        // 用 YAML 序列化器输出，避免手写嵌套结构（fallback-filter、nameserver-policy）出错
        lines.push('dns:');
        lines.push(indentYaml(yaml.dump(dns, { lineWidth: -1, noRefs: true }).replace(/\n$/, ''), 2));
      }
      continue;
    }

    // --- hosts ---
    if (key === 'hosts') {
      const hosts = value as Record<string, unknown>;
      if (hosts && Object.keys(hosts).length > 0) {
        lines.push('hosts:');
        for (const [domain, ip] of Object.entries(hosts)) {
          if (typeof ip === 'string') {
            lines.push(`  '${domain.replace(/'/g, "''")}': "${esc(ip)}"`);
          } else {
            emitYamlKeyValue(lines, `'${domain}'`, ip, 2);
          }
        }
      }
      continue;
    }
  }

  // ---- 策略组 ----
  emitProxyGroups(lines, sourceConfig, iniConfig, params, allNodeNames, nodeNameMap);

  // ---- 悬空策略组补建 ----
  // 规则引用的策略组若不在输出中（外部配置替换了策略组集合，或源订阅本身没有该组），
  // mihomo 会直接报 "proxy [X] not found" 并拒绝加载整份配置。
  // 这里统一按全部节点补建同名 select 组，保住规则语义。
  appendSyntheticGroups(lines, sourceConfig, iniConfig, params, ruleContents, allNodeNames, nodeNameMap);

  return lines.join('\n');
}

/** 收集已输出的策略组名 */
function collectDefinedGroupNames(lines: string[]): Set<string> {
  const names = new Set<string>();
  for (const line of lines) {
    const match = line.match(/^\s*-\s*\{\s*name:\s*"((?:[^"\\]|\\.)*)"\s*,\s*type:/);
    if (match) names.add(match[1].replace(/\\"/g, '"'));
  }
  return names;
}

/**
 * 为规则引用的、尚未定义的策略名补建 select 策略组（成员为全部节点）。
 * 只在确实存在悬空引用时插入 proxy-groups 段。
 */
function appendSyntheticGroups(
  lines: string[],
  sourceConfig: ClashConfig,
  iniConfig: ParsedIniConfig,
  params: ConversionParams,
  ruleContents: Record<string, string[]>,
  allNodeNames: string[],
  nodeNameMap: Map<string, string>
): void {
  if (allNodeNames.length === 0) return;

  const defined = collectDefinedGroupNames(lines);
  const builtin = new Set(['DIRECT', 'REJECT', 'REJECT-DROP', 'REJECT-TLS', 'PASS', 'COMPATIBLE', 'GLOBAL']);
  const nodeNames = new Set(allNodeNames);

  const missing: string[] = [];
  for (const target of collectRuleTargets(sourceConfig, iniConfig, params, ruleContents, nodeNameMap)) {
    if (!target || defined.has(target) || nodeNames.has(target) || builtin.has(target.toUpperCase())) continue;
    if (missing.includes(target)) continue;
    missing.push(target);
  }
  if (missing.length === 0) return;

  const rulesIndex = lines.findIndex(line => line.trimEnd() === 'rules:');
  const insertAt = rulesIndex === -1 ? lines.length : rulesIndex;
  const block: string[] = [];

  // 已有 proxy-groups 段时只补条目，否则要连段头一起补，避免条目落到 proxies 段里
  const hasGroupSection = lines.some(line => line.trimEnd() === 'proxy-groups:');
  if (!hasGroupSection) block.push('proxy-groups:');

  for (const name of missing) {
    block.push(`  - { name: "${esc(name)}", type: select, proxies: [${allNodeNames.map(n => `"${esc(n)}"`).join(', ')}] }`);
  }
  lines.splice(insertAt, 0, ...block);
}

// ---- helper functions ----

function getNodeDisplayName(node: ProxyNode, _params: ConversionParams): string {
  return node.name;
}

function formatClashProxy(node: ProxyNode, params: ConversionParams): string {
  const kv: string[] = [];
  const name = getNodeDisplayName(node, params);

  kv.push(`name: "${esc(name)}"`);
  kv.push(`type: ${node.type}`);
  kv.push(`server: "${esc(node.server)}"`);
  kv.push(`port: ${node.port}`);

  if (node.cipher) kv.push(`cipher: ${node.cipher}`);
  if (node.password) kv.push(`password: "${esc(node.password)}"`);
  if (node.uuid) kv.push(`uuid: "${esc(String(node.uuid))}"`);

  if (node.plugin) {
    kv.push(`plugin: ${node.plugin}`);
    if (node['plugin-opts']) {
        const opts = Object.entries(node['plugin-opts'] as Record<string, unknown>)
        .map(([k, v]) => `${safeKey(k)}: "${esc(String(v))}"`).join(', ');
      kv.push(`plugin-opts: {${opts}}`);
    }
  }

  if (node.udp) kv.push('udp: true');
  if (node.tfo || params.tfo) kv.push('tfo: true');
  if (params.udp && !node.udp) kv.push('udp: true');
  if (node['skip-cert-verify'] || params.scv) kv.push('skip-cert-verify: true');

  if (node.sni) kv.push(`sni: "${esc(node.sni)}"`);
  if (node.alpn) {
    const arr = Array.isArray(node.alpn) ? node.alpn : String(node.alpn).split(/[,;]/).map((s:string)=>s.trim()).filter(Boolean);
    kv.push(`alpn: [${arr.map((a:string)=>`"${esc(a)}"`).join(', ')}]`);
  }

  if (params.tls13) kv.push('client-fingerprint: chrome');

  const skip = new Set(['name','type','server','port','cipher','password','uuid','plugin','plugin-opts','udp','tfo','skip-cert-verify','sni','alpn']);
  if (params.tls13) skip.add('client-fingerprint');
  for (const [k, v] of Object.entries(node)) {
    if (skip.has(k)) continue;
    if (v === undefined || v === null) continue;
    if (typeof v === 'boolean') kv.push(`${safeKey(k)}: ${v}`);
    else if (typeof v === 'number') kv.push(`${safeKey(k)}: ${v}`);
    else if (typeof v === 'string') kv.push(`${safeKey(k)}: "${esc(v)}"`);
    // 数组 / 嵌套对象（ws-opts、reality-opts、grpc-opts 等）按 YAML 流式 JSON 输出，
    // 否则这些传输参数会被丢弃，导致 WS / Reality 节点导出后不可用
    else if (Array.isArray(v) || (typeof v === 'object')) kv.push(`${safeKey(k)}: ${JSON.stringify(v)}`);
  }

  return `  - { ${kv.join(', ')} }`;
}

function applyNodeFilters(nodes: ProxyNode[], params: ConversionParams): ProxyNode[] {
  let f = [...nodes];
  if (params.include) { try { const r=new RegExp(params.include); f=f.filter(n=>r.test(n.name)); } catch {} }
  if (params.exclude) { try { const r=new RegExp(params.exclude); f=f.filter(n=>!r.test(n.name)); } catch {} }
  if (params.sort) f.sort((a, b) => a.name.localeCompare(b.name));
  return f;
}

function applyRenames(nodes: ProxyNode[], renameStr: string): ProxyNode[] {
  const rules = renameStr.split('|').map(r => {
    const idx = r.lastIndexOf('@');
    if (idx === -1) return null;
    return { pattern: r.slice(0, idx), replacement: r.slice(idx + 1) };
  }).filter(Boolean) as { pattern: string; replacement: string }[];

  return nodes.map(node => {
    let name = node.name;
    for (const rule of rules) {
      try { name = name.replace(new RegExp(rule.pattern), rule.replacement); } catch {}
    }
    return name !== node.name ? { ...node, name } : node;
  });
}

function sanitizeProviderName(name: string): string {
  // 仅移除 YAML 有问题的字符，保留中文等 Unicode 字母
  return name.replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s+/g, '_') || 'provider';
}

interface ProviderPlan {
  name: string;
  url: string;
  behavior: string;
}

/**
 * 截断第一个 FINAL 特殊条目之后的所有 ruleset 条目（其规则永远不会被求值）
 */
function truncateRulesetsAfterFinal(entries: RulesetEntry[]): RulesetEntry[] {
  const index = entries.findIndex(entry => entry.isSpecial && entry.specialType === 'FINAL');
  return index === -1 ? entries : entries.slice(0, index + 1);
}

/**
 * 生成 rule-providers 定义：provider 名按 URL 唯一化（同名策略组的不同规则集追加 -2/-3），
 * 同一 URL 被多个策略组引用时只定义一次，behavior 按抓取到的内容推断。
 */
function planRuleProviders(
  entries: RulesetEntry[],
  ruleContents: Record<string, string[]>
): { providers: ProviderPlan[]; names: Map<string, string> } {
  const usedNames = new Set<string>();
  const names = new Map<string, string>();
  const providers: ProviderPlan[] = [];

  for (const entry of entries) {
    if (entry.isSpecial || !entry.url || names.has(entry.url)) continue;

    const base = sanitizeProviderName(entry.groupName);
    let name = base;
    let suffix = 2;
    while (usedNames.has(name)) name = `${base}-${suffix++}`;

    usedNames.add(name);
    names.set(entry.url, name);
    providers.push({ name, url: entry.url, behavior: inferProviderBehavior(ruleContents[entry.url]) });
  }

  return { providers, names };
}

/**
 * 按规则集内容推断 rule-provider 的 behavior：
 * 全部为裸网段 → ipcidr；全部为无逗号裸域名 → domain；其余（classical 规则或混合内容）→ classical
 */
export function inferProviderBehavior(lines: string[] | undefined): string {
  const content = normalizeRuleSetContent(lines);
  if (content.length === 0) {
    console.warn('[Prism] 规则集内容不可用，rule-provider behavior 回退为 classical');
    return 'classical';
  }
  if (content.every(line => !line.includes(',') && isCidrLiteral(line))) return 'ipcidr';
  if (content.every(line => !line.includes(',') && !/\s/.test(line))) return 'domain';
  return 'classical';
}

function normalizeRuleSetContent(lines: string[] | undefined): string[] {
  return (lines || [])
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && !line.startsWith(';') && !line.startsWith('//'));
}

function writeProxyGroup(
  lines: string[], groupType: string, name: string, proxies: string[],
  url: string | undefined, interval: number | undefined,
  allNodeNames: string[], groupNames: string[], nodeNameMap?: Map<string, string>
): void {
  let filtered = proxies.filter(p =>
    p === 'DIRECT' || p === 'REJECT' || p === 'REJECT-TLS' ||
    allNodeNames.includes(p) || groupNames.includes(p) ||
    (nodeNameMap && nodeNameMap.has(p))
  );
  // 成员全部不可用时回退：优先全部节点，其次 DIRECT，避免策略组引用悬空
  if (filtered.length === 0) filtered = allNodeNames.length > 0 ? [...allNodeNames] : ['DIRECT'];
  // 将原始名映射为显示名，保证与 proxies 段一致
  if (nodeNameMap) filtered = filtered.map(p => nodeNameMap.get(p) || p);

  const parts: string[] = [];
  parts.push(`name: "${esc(name)}"`);
  parts.push(`type: ${groupType}`);
  parts.push(`proxies: [${filtered.map(p => `"${esc(p)}"`).join(', ')}]`);
  if ((groupType === 'url-test' || groupType === 'fallback') && url) {
    parts.push(`url: "${esc(url)}"`);
    parts.push(`interval: ${interval || 300}`);
  }
  lines.push(`  - { ${parts.join(', ')} }`);
}

function esc(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/**
 * YAML 规则行安全化：包含冒号空格、" #" 或控制字符时加引号
 */
function formatRule(rule: string): string {
  if (/:\s|\s#|[\n\r\t]/.test(rule)) {
    return `"${esc(rule)}"`;
  }
  return rule;
}

/**
 * 输出 Clash / Mihomo 的 rules 段。
 * 先归一化 FINAL → MATCH，再丢弃内核不支持的规则类型（如 URL-REGEX），
 * 被丢弃时追加统计注释，避免整份配置因单条规则校验失败而无法启用。
 */
function writeClashRules(lines: string[], rules: string[], nodeNameMap?: Map<string, string>): void {
  const mapped = nodeNameMap ? rules.map(rule => mapRuleTarget(rule, nodeNameMap)) : rules;
  const normalized = normalizeRulesForClash(mapped);
  const { rules: supported, dropped } = filterSupportedRules(normalized, MIHOMO_RULE_TYPES);

  lines.push('rules:');
  for (const rule of supported) {
    lines.push(rule.startsWith('#') ? `  ${rule}` : `  - ${formatRule(rule)}`);
  }

  const droppedCount = totalDroppedRules(dropped);
  if (droppedCount > 0) {
    const detail = describeDroppedTypes(dropped);
    console.warn(`[Prism] 已跳过 ${droppedCount} 条 Clash/Mihomo 不支持的规则: ${detail}`);
    lines.push(`  # 已跳过 ${droppedCount} 条 Clash/Mihomo 不支持的规则（${detail}）`);
  }
}

/**
 * YAML 键名安全化：以保留字符（*&!{}[]等）开头或含特殊字符时加引号
 */
function safeKey(key: string): string {
  if (/^[*&!{}[\]>|%@`"'?#-]/.test(key) || /[:#\s]/.test(key)) {
    return `"${esc(key)}"`;
  }
  return key;
}

/**
 * 递归输出 YAML 键值对 — 正确处理嵌套序列和映射
 */
function emitYamlKeyValue(lines: string[], key: string, value: unknown, indent: number): void {
  const pad = ' '.repeat(indent);
  const safe = safeKey(key);

  if (typeof value === 'string') {
    lines.push(`${pad}${safe}: "${esc(value)}"`);
  } else if (typeof value === 'boolean') {
    lines.push(`${pad}${safe}: ${value}`);
  } else if (typeof value === 'number') {
    lines.push(`${pad}${safe}: ${value}`);
  } else if (Array.isArray(value)) {
    lines.push(`${pad}${safe}:`);
    for (const item of value) {
      if (typeof item === 'string') {
        lines.push(`${pad}  - "${esc(item)}"`);
      } else if (typeof item === 'object' && item !== null) {
        const entries = Object.entries(item as Record<string, unknown>);
        if (entries.length > 0) {
          const [fk, fv] = entries[0];
          emitYamlKeyValue(lines, `- ${safeKey(fk)}`, fv, indent);
          for (let i = 1; i < entries.length; i++) {
            const [k, v] = entries[i];
            emitYamlKeyValue(lines, `  ${safeKey(k)}`, v, indent);
          }
        }
      } else {
        lines.push(`${pad}  - ${item}`);
      }
    }
  } else if (typeof value === 'object' && value !== null) {
    lines.push(`${pad}${safe}:`);
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      emitYamlKeyValue(lines, k, v, indent + 2);
    }
  } else {
    // fallback
    lines.push(`${pad}${safe}: ${value}`);
  }
}


/**
 * Clash DNS 段迁移：
 *   - fallback-filter 已废弃（内核会告警并将于后续版本移除），
 *     其中的 geosite 语义迁移为 nameserver-policy
 *   - 其余字段原样保留，由 mihomo 自行校验
 */
export function migrateClashDns(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const dns = { ...(value as Record<string, unknown>) };
  if (dns['fallback-filter'] === undefined) return dns;

  const filter = dns['fallback-filter'];
  delete dns['fallback-filter'];
  if (!filter || typeof filter !== 'object' || Array.isArray(filter)) return dns;

  const { geosite, geoip, ipcidr, domain } = filter as Record<string, unknown>;
  const policy: Record<string, unknown> = { ...(dns['nameserver-policy'] as Record<string, unknown> | undefined) };
  const targets: string[] = [];
  if (typeof geosite === 'string' && geosite) targets.push(`geosite:${geosite}`);
  for (const item of toStringArray(domain)) targets.push(item);
  for (const item of toStringArray(ipcidr)) targets.push(item);
  if (typeof geoip === 'string' && geoip) targets.push(`geoip:${geoip}`);

  // fallback-filter 的本意是「这些目标走 fallback 解析」，这里用 nameserver-policy 表达
  const fallback = toStringArray(dns.fallback);
  if (targets.length > 0 && fallback.length > 0) {
    for (const target of targets) policy[target] = fallback;
    dns['nameserver-policy'] = policy;
  }
  return dns;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => String(item)).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

/** 给多行 YAML 片段统一加缩进 */
function indentYaml(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return text.split('\n').map(line => (line ? pad + line : line)).join('\n');
}

/**
 * 收集最终规则序列里出现的策略目标名（用于补建缺失的策略组）。
 * 与 rules 段的生成口径保持一致，避免判断结果与实际输出不符。
 */
function collectRuleTargets(
  sourceConfig: ClashConfig,
  iniConfig: ParsedIniConfig,
  params: ConversionParams,
  ruleContents: Record<string, string[]>,
  nodeNameMap: Map<string, string>
): string[] {
  const sourceRules = Array.isArray(sourceConfig.rules)
    ? (sourceConfig.rules as unknown[]).filter((rule): rule is string => typeof rule === 'string')
    : [];

  let rawRules: string[];
  if (iniConfig.rulesetEntries.length > 0) {
    if (params.expand !== false) {
      rawRules = [
        ...(iniConfig.overwriteOriginalRules ? [] : sourceRules),
        ...expandRulesetEntries(iniConfig, ruleContents, 'MATCH',
          entry => `# ⚠ 规则集下载失败: ${entry.groupName}`),
      ];
    } else {
      // 非展开模式：规则体来自 ruleset 条目（RULE-SET 行或 GEOIP/FINAL 特殊条目）
      const entries = dedupeRulesetEntries(iniConfig.rulesetEntries);
      const truncated = params.dedup === false ? entries : truncateRulesetsAfterFinal(entries);
      rawRules = truncated.map(entry => {
        if (entry.isSpecial) {
          if (entry.specialType === 'GEOIP' && entry.specialValue) {
            return `GEOIP,${entry.specialValue},${entry.groupName}`;
          }
          return `MATCH,${entry.groupName}`;
        }
        return `RULE-SET,${entry.url},${entry.groupName}`;
      });
    }
  } else {
    rawRules = sourceRules;
  }

  // 是否保留源订阅规则取决于 overwrite_original_rules
  const keepSourceRules = !iniConfig.overwriteOriginalRules && !(iniConfig.rulesetEntries.length > 0 && params.expand === false);
  const allRules = keepSourceRules ? [...sourceRules, ...rawRules] : rawRules;
  const targets: string[] = [];
  for (const rule of allRules) {
    if (!rule || rule.startsWith('#')) continue;
    const parsed = parseClashRule(rule);
    if (!parsed) continue;
    const mapped = nodeNameMap.get(parsed.target);
    targets.push(mapped || parsed.target);
  }
  return targets;
}

/**
 * 发射 proxy-groups 段。
 *   - 提供外部配置时：以外部配置的 custom_proxy_group 为准（源订阅的策略组被替换）
 *   - 否则：沿用源订阅的 proxy-groups
 * 插入位置在 rules 段之前，保证 YAML 结构稳定。
 */
function emitProxyGroups(
  lines: string[],
  sourceConfig: ClashConfig,
  iniConfig: ParsedIniConfig,
  params: ConversionParams,
  allNodeNames: string[],
  nodeNameMap: Map<string, string>
): void {
  const block: string[] = [];

  if (params.config && iniConfig.customProxyGroups.length > 0) {
    const groups = expandPlaceholderProxies(iniConfig.customProxyGroups, allNodeNames);
    block.push('proxy-groups:');
    for (const group of groups) {
      writeProxyGroup(block, group.groupType || 'select', group.name, group.proxies, group.url, group.interval,
        allNodeNames, groups.map(item => item.name), nodeNameMap);
    }
  } else {
    const sourceGroups = sourceConfig['proxy-groups'];
    if (!Array.isArray(sourceGroups) || sourceGroups.length === 0) return;
    block.push('proxy-groups:');
    for (const group of sourceGroups as ProxyGroup[]) {
      writeProxyGroup(block, group.type || 'select', group.name, group.proxies || [], group.url, group.interval,
        allNodeNames, (sourceGroups as ProxyGroup[]).map(item => item.name), nodeNameMap);
    }
  }

  if (block.length <= 1) return;
  const rulesIndex = lines.findIndex(line => line.trimEnd() === 'rules:');
  lines.splice(rulesIndex === -1 ? lines.length : rulesIndex, 0, ...block);
}

/**
 * 把一条 Clash 规则里的策略目标替换为 display 名。
 * 只替换最后一段（策略），不动匹配值；no-resolve 尾标记原样保留。
 */
export function mapRuleTarget(rule: string, nodeNameMap: Map<string, string>): string {
  if (!rule || rule.startsWith('#')) return rule;
  const parts = rule.split(',');
  if (parts.length < 2) return rule;

  let end = parts.length;
  let suffix = '';
  if (parts[parts.length - 1].trim().toLowerCase() === 'no-resolve') {
    end -= 1;
    suffix = ',no-resolve';
  }
  if (end < 2) return rule;

  const targetIndex = end - 1;
  const target = parts[targetIndex].trim();
  const mapped = nodeNameMap.get(target);
  if (!mapped) return rule;

  const body = parts.slice(0, targetIndex).join(',');
  return `${body},${mapped}${suffix}`;
}

/** 是否为终止规则（MATCH / FINAL） */
function isTerminalRule(rule: string): boolean {
  const type = rule.split(',')[0].trim().toUpperCase();
  return type === 'MATCH' || type === 'FINAL';
}
