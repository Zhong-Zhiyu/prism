// ============================================================
// 目标客户端能力表
// 下列集合均在本机 verge-mihomo v1.19.29 上逐条实测确认：
//   - 不在 MIHOMO_PROXY_TYPES 中的节点类型会被内核以
//     "unsupport proxy type: xxx" 拒绝，导致整份配置无法加载
//   - 不在 MIHOMO_RULE_TYPES 中的规则类型会被内核以
//     "unsupported rule type: xxx" 拒绝，同样会导致配置校验失败
// ============================================================

/** mihomo 支持的代理节点类型 */
export const MIHOMO_PROXY_TYPES = new Set([
  'ss',
  'ssr',
  'vmess',
  'vless',
  'trojan',
  'hysteria',
  'hysteria2',
  'tuic',
  'snell',
  'http',
  'socks5',
  'anytls',
  'ssh',
  'wireguard',
  'mieru',
]);

/**
 * mihomo 支持的规则类型。
 * 实测不支持：URL-REGEX、USER-AGENT、IPSET、SCRIPT；
 * FINAL 不是 mihomo 的类型（须改写成 MATCH）。
 */
export const MIHOMO_RULE_TYPES = new Set([
  'DOMAIN',
  'DOMAIN-SUFFIX',
  'DOMAIN-KEYWORD',
  'DOMAIN-REGEX',
  'GEOSITE',
  'GEOIP',
  'SRC-GEOIP',
  'IP-CIDR',
  'IP-CIDR6',
  'IP-SUFFIX',
  'SRC-IP-CIDR',
  'SRC-IP-SUFFIX',
  'IP-ASN',
  'PROCESS-NAME',
  'PROCESS-PATH',
  'PROCESS-NAME-REGEX',
  'PROCESS-PATH-REGEX',
  'DST-PORT',
  'SRC-PORT',
  'IN-PORT',
  'IN-TYPE',
  'IN-USER',
  'IN-NAME',
  'NETWORK',
  'DSCP',
  'AND',
  'OR',
  'NOT',
  'SUB-RULE',
  'RULE-SET',
  'MATCH',
]);

export interface FilteredRules {
  /** 过滤后的规则（原顺序，注释行原样保留） */
  rules: string[];
  /** 被丢弃的类型 -> 条数 */
  dropped: Map<string, number>;
}

/**
 * Clash 目标专用归一化：FINAL 是 Clash Premium 的终止规则写法，
 * mihomo 只接受 MATCH，直接输出会导致 "format invalid"。
 */
export function normalizeRulesForClash(rules: string[]): string[] {
  return rules.map(rule =>
    /^FINAL\s*,/i.test(rule) ? rule.replace(/^FINAL\s*,/i, 'MATCH,') : rule
  );
}

/**
 * 丢弃目标内核不支持的规则类型；以 `#` 开头的注释行与空行原样保留，
 * 以便保留下载失败等占位信息。
 */
export function filterSupportedRules(rules: string[], supported: Set<string>): FilteredRules {
  const kept: string[] = [];
  const dropped = new Map<string, number>();

  for (const rule of rules) {
    if (!rule || rule.startsWith('#')) {
      kept.push(rule);
      continue;
    }
    const type = rule.split(',')[0].trim().toUpperCase();
    if (supported.has(type)) {
      kept.push(rule);
      continue;
    }
    const label = type || '(空类型)';
    dropped.set(label, (dropped.get(label) ?? 0) + 1);
  }

  return { rules: kept, dropped };
}

/** 被丢弃规则的总条数 */
export function totalDroppedRules(dropped: Map<string, number>): number {
  let total = 0;
  for (const count of dropped.values()) total += count;
  return total;
}

/** 将「类型 -> 条数」渲染为可读文本，如 `URL-REGEX×7、USER-AGENT×2` */
export function describeDroppedTypes(dropped: Map<string, number>): string {
  return [...dropped.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${type}×${count}`)
    .join('、');
}
