// ============================================================
// Clash (Mihomo) 配置生成器
// ============================================================

import type { ClashConfig, ProxyNode, ParsedIniConfig, ConversionParams, RulesetEntry } from '../utils/types';
import { dedupeRulesetEntries, expandPlaceholderProxies } from '../parsers/ini-parser';
import { mapNodeReference, prepareNodes } from '../utils/node-utils';
import { expandRulesetEntries, isCidrLiteral, pruneRulesWithLog } from '../utils/rule-pruner';

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

  const prepared = prepareNodes(sourceConfig.proxies, params);
  const allNodes = prepared.nodes;
  const allNodeNames = prepared.allNames;
  const nodeNameMap = prepared.displayNames;

  // 按原始顺序迭代，遇到保留段直接内联输出
  const RESERVED_KEYS = new Set(['proxies', 'proxy-groups', 'rules', 'dns', 'hosts']);
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
    if (key === 'proxy-groups') {
      if (params.config) {
        lines.push('proxy-groups:');
        const groups = expandPlaceholderProxies(iniConfig.customProxyGroups, allNodeNames);
        for (const g of groups) {
          writeProxyGroup(lines, g.groupType || 'select', g.name, g.proxies, g.url, g.interval,
            allNodeNames, iniConfig.customProxyGroups.map(og => og.name), nodeNameMap);
        }
      } else if (Array.isArray(value) && value.length > 0) {
        lines.push('proxy-groups:');
        const groups = value as any[];
        for (const g of groups) {
          writeProxyGroup(lines, g.type || 'select', g.name, g.proxies, g.url, g.interval,
            allNodeNames, groups.map((og: any) => og.name), nodeNameMap);
        }
      }
      continue;
    }

    // --- rules ---
    if (key === 'rules') {
      const sourceRules = Array.isArray(value)
        ? (value as unknown[]).filter((rule): rule is string => typeof rule === 'string')
        : [];

      if (iniConfig.rulesetEntries.length > 0) {
        if (params.expand !== false) {
          // 展开模式：源订阅规则在前，规则集条目按序在后，裁剪后逐条输出
          const rawRules = [
            ...(iniConfig.overwriteOriginalRules ? [] : sourceRules),
            ...expandRulesetEntries(iniConfig, ruleContents, 'MATCH',
              entry => `# ⚠ 规则集下载失败: ${entry.groupName}`),
          ];
          const rules = params.dedup === false ? rawRules : pruneRulesWithLog(rawRules);
          lines.push('rules:');
          for (const rule of rules) {
            lines.push(rule.startsWith('#') ? `  ${rule}` : `  - ${formatRule(rule)}`);
          }
        } else {
          // 非展开模式：条目去重 + 首个 FINAL 之后截断，provider 名按 URL 唯一化
          const deduped = dedupeRulesetEntries(iniConfig.rulesetEntries);
          const entries = params.dedup === false ? deduped : truncateRulesetsAfterFinal(deduped);
          const { providers, names } = planRuleProviders(entries, ruleContents);

          lines.push('rule-providers:');
          for (const provider of providers) {
            lines.push(`  ${provider.name}:`);
            lines.push(`    type: http`);
            lines.push(`    behavior: ${provider.behavior}`);
            lines.push(`    url: "${esc(provider.url)}"`);
            lines.push(`    interval: 86400`);
          }
          lines.push('rules:');
          for (const entry of entries) {
            if (entry.isSpecial) {
              if (entry.specialType === 'GEOIP' && entry.specialValue) {
                lines.push(`  - GEOIP,${entry.specialValue},${entry.groupName}`);
              } else if (entry.specialType === 'FINAL') {
                lines.push(`  - MATCH,${entry.groupName}`);
              }
            } else if (entry.url) {
              lines.push(`  - RULE-SET,${names.get(entry.url)},${entry.groupName}`);
            }
          }
        }
      } else if (sourceRules.length > 0) {
        const rules = params.dedup === false ? sourceRules : pruneRulesWithLog(sourceRules);
        lines.push('rules:');
        for (const rule of rules) {
          lines.push(rule.startsWith('#') ? `  ${rule}` : `  - ${formatRule(rule)}`);
        }
      }
      continue;
    }

    // --- dns ---
    if (key === 'dns') {
      if (typeof value === 'object' && value !== null && Object.keys(value as object).length > 0) {
        lines.push('dns:');
        for (const [dk, dv] of Object.entries(value as Record<string, unknown>)) {
          emitYamlKeyValue(lines, dk, dv, 2);
        }
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

  return lines.join('\n');
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
    if (typeof v === 'boolean') kv.push(`${safeKey(k)}: ${v}`);
    else if (typeof v === 'number') kv.push(`${safeKey(k)}: ${v}`);
    else if (typeof v === 'string') kv.push(`${safeKey(k)}: "${esc(v)}"`);
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
  if (filtered.length === 0) filtered = ['DIRECT'];
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
