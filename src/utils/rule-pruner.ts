// ============================================================
// 规则序列裁剪与规范化
// 在生成各目标格式前，对最终规则序列做稳定单遍裁剪：
//   1. 完全重复（同类型 + 同值，忽略策略组）只保留第一条
//   2. 被前序域名规则覆盖的域名条目删除
//   3. 被前序 IP 网段包含的 IP 条目删除（区分 no-resolve 语义）
//   4. FINAL / MATCH 之后的条目全部删除
// ============================================================

import type { ParsedIniConfig, RulesetEntry } from './types';

/** 裁剪统计信息 */
export interface RulePruneStats {
  /** 输入条目数（含注释占位） */
  input: number;
  /** 保留条目数（含注释占位） */
  kept: number;
  /** 被删除条目数 */
  removed: number;
  /** 完全重复 */
  duplicate: number;
  /** 被前序域名后缀 / 精确域名覆盖 */
  domainCovered: number;
  /** 被前序域名关键字覆盖 */
  keywordCovered: number;
  /** 被前序 IP 网段包含 */
  cidrCovered: number;
  /** 位于 FINAL / MATCH 之后 */
  afterTerminal: number;
}

export interface RulePruneResult {
  rules: string[];
  stats: RulePruneStats;
}

interface Cidr4 {
  net: number;
  prefix: number;
}

interface Cidr6 {
  net: bigint;
  prefix: number;
}

type Cidr = Cidr4 | Cidr6;

/** 网段索引：前缀长度 -> 已保留网段的网络地址集合（IPv4 用 number，IPv6 用 bigint） */
type CidrIndex = Map<number, Set<number | bigint>>;

interface PruneState {
  seen: Set<string>;
  suffix: Set<string>;
  keywords: string[];
  ipv4Any: CidrIndex;
  ipv4Resolve: CidrIndex;
  ipv6Any: CidrIndex;
  ipv6Resolve: CidrIndex;
}

const IP_TYPES = new Set(['IP-CIDR', 'IP-CIDR6']);
const TERMINAL_TYPES = new Set(['MATCH', 'FINAL']);

// ============================================================
// 规则序列组装
// ============================================================

/**
 * 为规则集内容补上策略组，并保留原有的 no-resolve 标记位置
 * 例：IP-CIDR,10.0.0.0/8,no-resolve + 直连 → IP-CIDR,10.0.0.0/8,直连,no-resolve
 */
export function appendRuleTarget(rule: string, groupName: string): string {
  const parts = rule.split(',');
  const last = parts[parts.length - 1]?.trim();
  if (last === 'no-resolve' && parts.length >= 3) {
    return `${parts.slice(0, -1).join(',')},${groupName},no-resolve`;
  }
  return `${rule},${groupName}`;
}

/**
 * 按顺序展开 .ini 中的 ruleset 条目，得到规范化（Clash 语法）的规则序列。
 * @param finalType 特殊 FINAL 条目转换成的终止规则类型（Clash/sing-box 用 MATCH，Surge 用 FINAL）
 * @param onMissingContent 规则集内容缺失时的回调，返回非空字符串则作为注释占位插入原位
 */
export function expandRulesetEntries(
  iniConfig: ParsedIniConfig,
  ruleContents: Record<string, string[]>,
  finalType: 'MATCH' | 'FINAL',
  onMissingContent?: (entry: RulesetEntry) => string | void
): string[] {
  const rules: string[] = [];

  for (const entry of iniConfig.rulesetEntries) {
    if (entry.isSpecial) {
      if (entry.specialType === 'GEOIP' && entry.specialValue) {
        rules.push(`GEOIP,${entry.specialValue},${entry.groupName}`);
      } else if (entry.specialType === 'FINAL') {
        rules.push(`${finalType},${entry.groupName}`);
      }
      continue;
    }

    const content = ruleContents[entry.url];
    if (!content || content.length === 0) {
      const note = onMissingContent?.(entry);
      if (note) rules.push(note);
      continue;
    }

    for (const rule of content) {
      if (!rule || rule.startsWith('#')) continue;
      rules.push(appendRuleTarget(rule, entry.groupName));
    }
  }

  return rules;
}

// ============================================================
// 裁剪主流程
// ============================================================

/**
 * 裁剪规则序列：顺序敏感，只删除后出现的冗余条目，保留首条原文。
 * 以 `#` 开头的条目视为注释，原样保留且不参与判定。
 */
export function pruneRules(rules: string[]): RulePruneResult {
  const stats: RulePruneStats = {
    input: rules.length,
    kept: 0,
    removed: 0,
    duplicate: 0,
    domainCovered: 0,
    keywordCovered: 0,
    cidrCovered: 0,
    afterTerminal: 0,
  };

  const state: PruneState = {
    seen: new Set<string>(),
    suffix: new Set<string>(),
    keywords: [],
    ipv4Any: new Map<number, Set<number | bigint>>(),
    ipv4Resolve: new Map<number, Set<number | bigint>>(),
    ipv6Any: new Map<number, Set<number | bigint>>(),
    ipv6Resolve: new Map<number, Set<number | bigint>>(),
  };

  const kept: string[] = [];
  let terminalReached = false;

  for (const rule of rules) {
    if (terminalReached) {
      stats.afterTerminal++;
      continue;
    }

    if (!rule || rule.startsWith('#')) {
      kept.push(rule);
      continue;
    }

    const parsed = parseRuleCandidate(rule);
    if (!parsed) {
      kept.push(rule);
      continue;
    }

    if (TERMINAL_TYPES.has(parsed.type)) {
      kept.push(rule);
      terminalReached = true;
      continue;
    }

    const value = parsed.value.trim();
    const lower = value.toLowerCase();

    // --- IP 类规则：完全重复 + 网段包含 ---
    if (IP_TYPES.has(parsed.type)) {
      const family = parsed.type === 'IP-CIDR' ? 4 : 6;
      const key = `${parsed.type}|${parsed.noResolve ? 'nr' : 'r'}|${lower}`;
      if (state.seen.has(key)) {
        stats.duplicate++;
        continue;
      }

      const cidr = family === 4 ? parseCidr4(value) : parseCidr6(value);
      if (cidr) {
        // 不带 no-resolve 的规则会触发解析，可覆盖后序任意 IP 规则；
        // 带 no-resolve 的规则只能覆盖后序同样带 no-resolve 的规则。
        const index = parsed.noResolve
          ? (family === 4 ? state.ipv4Any : state.ipv6Any)
          : (family === 4 ? state.ipv4Resolve : state.ipv6Resolve);
        if (isCoveredByCidr(index, family, cidr)) {
          stats.cidrCovered++;
          continue;
        }
      }

      state.seen.add(key);
      if (cidr) {
        addCidr(family === 4 ? state.ipv4Any : state.ipv6Any, cidr);
        if (!parsed.noResolve) addCidr(family === 4 ? state.ipv4Resolve : state.ipv6Resolve, cidr);
      }
      kept.push(rule);
      continue;
    }

    // --- 域名类规则：完全重复 + 域名覆盖 ---
    if (parsed.type === 'DOMAIN' || parsed.type === 'DOMAIN-SUFFIX') {
      const key = `${parsed.type}|${lower}`;
      if (state.seen.has(key)) {
        stats.duplicate++;
        continue;
      }
      const covered = findDomainCover(state, lower);
      if (covered === 'suffix') {
        stats.domainCovered++;
        continue;
      }
      if (covered === 'keyword') {
        stats.keywordCovered++;
        continue;
      }
      state.seen.add(key);
      if (parsed.type === 'DOMAIN-SUFFIX' && lower) state.suffix.add(lower);
      kept.push(rule);
      continue;
    }

    if (parsed.type === 'DOMAIN-KEYWORD') {
      const key = `DOMAIN-KEYWORD|${lower}`;
      if (state.seen.has(key)) {
        stats.duplicate++;
        continue;
      }
      if (lower && state.keywords.some(keyword => keyword.length <= lower.length && lower.includes(keyword))) {
        stats.keywordCovered++;
        continue;
      }
      state.seen.add(key);
      if (lower) state.keywords.push(lower);
      kept.push(rule);
      continue;
    }

    // --- 其它类型：仅做完全重复去重 ---
    const key = `${parsed.type}|${lower}`;
    if (state.seen.has(key)) {
      stats.duplicate++;
      continue;
    }
    state.seen.add(key);
    kept.push(rule);
  }

  stats.kept = kept.length;
  stats.removed = stats.input - stats.kept;
  return { rules: kept, stats };
}

/**
 * 裁剪规则序列并输出统计日志（仅在真正发生删除时打印）
 */
export function pruneRulesWithLog(rules: string[]): string[] {
  const { rules: kept, stats } = pruneRules(rules);
  if (stats.removed > 0) {
    console.log(
      `[Prism] 规则裁剪: 输入 ${stats.input} 条 → 保留 ${stats.kept} 条` +
      `（重复 ${stats.duplicate}、域名覆盖 ${stats.domainCovered}、关键字覆盖 ${stats.keywordCovered}、` +
      `网段包含 ${stats.cidrCovered}、FINAL 之后 ${stats.afterTerminal}）`
    );
  }
  return kept;
}

// ============================================================
// 覆盖判定
// ============================================================

interface RuleCandidate {
  type: string;
  value: string;
  noResolve: boolean;
}

/**
 * 轻量解析规则（与 parseClashRule 语义一致，但只取裁剪需要的信息，避免多余分配）
 */
function parseRuleCandidate(rule: string): RuleCandidate | null {
  const parts = rule.split(',');
  if (parts.length < 2) return null;

  const type = parts[0].trim().toUpperCase();
  let end = parts.length;
  let noResolve = false;
  if (parts[parts.length - 1].trim().toLowerCase() === 'no-resolve') {
    noResolve = true;
    end -= 1;
  }
  if (end < 2) return null;

  // MATCH / FINAL 没有匹配值
  if (type === 'MATCH' || type === 'FINAL') return { type, value: '', noResolve };

  // 三段及以上时，最后一段是策略组，中间是匹配值
  const hasTarget = end >= 3;
  const valueParts = parts.slice(1, hasTarget ? end - 1 : end);
  return { type, value: valueParts.map(part => part.trim()).join(','), noResolve };
}

/**
 * 判断域名是否被已保留的域名规则覆盖：
 * 逐级取域名后缀与已保留的 DOMAIN-SUFFIX 比对（标签边界），再尝试 DOMAIN-KEYWORD。
 */
function findDomainCover(state: PruneState, domain: string): 'suffix' | 'keyword' | null {
  let candidate = domain;
  while (candidate) {
    if (state.suffix.has(candidate)) return 'suffix';
    const dot = candidate.indexOf('.');
    if (dot === -1) break;
    candidate = candidate.slice(dot + 1);
  }
  if (domain && state.keywords.some(keyword => keyword.length <= domain.length && domain.includes(keyword))) {
    return 'keyword';
  }
  return null;
}

function addCidr(index: CidrIndex, cidr: Cidr): void {
  let set = index.get(cidr.prefix);
  if (!set) {
    set = new Set<number | bigint>();
    index.set(cidr.prefix, set);
  }
  set.add(cidr.net);
}

/**
 * 判断网段是否已被索引中的某个网段包含。
 * 包含关系等价于「候选网段的某个祖先前缀已在索引中」，因此只需回查自身的前缀链。
 */
function isCoveredByCidr(index: CidrIndex, family: 4 | 6, cidr: Cidr): boolean {
  for (let prefix = 0; prefix <= cidr.prefix; prefix++) {
    const set = index.get(prefix);
    if (!set) continue;
    const masked = family === 4
      ? maskIpv4(cidr.net as number, prefix)
      : maskIpv6(cidr.net as bigint, prefix);
    if (set.has(masked)) return true;
  }
  return false;
}

// ============================================================
// 地址解析（解析失败一律跳过判定，规则保留）
// ============================================================

/** 是否为裸网段字面量（用于推断 rule-provider 的 behavior） */
export function isCidrLiteral(value: string): boolean {
  const text = value.trim();
  return parseCidr4(text) !== null || parseCidr6(text) !== null;
}

function parseCidr4(value: string): Cidr4 | null {
  const slash = value.lastIndexOf('/');
  if (slash <= 0) return null;
  const ipPart = value.slice(0, slash);
  const prefixPart = value.slice(slash + 1);
  const prefix = parseDecimal(prefixPart, 3);
  if (prefix === null) return null;
  if (prefix > 32 || ipPart.includes(':')) return null;

  const octets = ipPart.split('.');
  if (octets.length !== 4) return null;
  let net = 0;
  for (const octet of octets) {
    const part = parseDecimal(octet, 3);
    if (part === null || part > 255) return null;
    net = (net * 256) + part;
  }
  net = net >>> 0;
  return { net: maskIpv4(net, prefix), prefix };
}

function parseCidr6(value: string): Cidr6 | null {
  const slash = value.lastIndexOf('/');
  if (slash <= 0) return null;
  const ipPart = value.slice(0, slash);
  const prefixPart = value.slice(slash + 1);
  const prefix = parseDecimal(prefixPart, 3);
  if (prefix === null) return null;
  if (prefix > 128) return null;

  const net = parseIpv6(ipPart);
  if (net === null) return null;
  return { net: maskIpv6(net, prefix), prefix };
}

/** 解析十进制无符号整数（仅数字，长度受限），失败返回 null */
function parseDecimal(text: string, maxDigits: number): number | null {
  if (text.length === 0 || text.length > maxDigits) return null;
  let value = 0;
  for (let i = 0; i < text.length; i++) {
    const digit = text.charCodeAt(i) - 48;
    if (digit < 0 || digit > 9) return null;
    value = value * 10 + digit;
  }
  return value;
}

function parseIpv6(text: string): bigint | null {
  // 含 zone（fe80::1%eth0）或 IPv4-mapped（::ffff:1.2.3.4）一律不支持
  if (!text.includes(':') || text.includes('%') || text.includes('.')) return null;

  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : [];

  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    groups = [...head, ...new Array<string>(missing).fill('0'), ...tail];
  } else {
    if (head.length !== 8) return null;
    groups = head;
  }

  let net = 0n;
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    net = (net << 16n) | BigInt(parseInt(group, 16));
  }
  return net;
}

function maskIpv4(net: number, prefix: number): number {
  if (prefix <= 0) return 0;
  if (prefix >= 32) return net >>> 0;
  const shift = 32 - prefix;
  return ((net >>> shift) << shift) >>> 0;
}

function maskIpv6(net: bigint, prefix: number): bigint {
  if (prefix <= 0) return 0n;
  if (prefix >= 128) return net;
  const shift = BigInt(128 - prefix);
  return (net >> shift) << shift;
}
