// ============================================================
// Clash 规则 → sing-box 1.14 路由规则
//
// 关键差异（踩过的坑）：
//   - sing-box 1.12 起移除了内置 geoip/geosite 数据库，GEOIP / GEOSITE
//     必须改写为 rule_set，否则内核直接拒绝加载（check 与 run 都会 FATAL）
//   - sing-box 的 route.rules 没有等价于 MATCH 的条目，终止策略要写成 route.final
//   - 规则目标必须是真实存在的 outbound tag；悬空引用内核不报错但流量失控，
//     因此这里一律做引用校验：目标缺失时先登记为「待合成策略组」，
//     仍无法解释的才回退到 DIRECT
// ============================================================

/** 转换后的 sing-box 路由结果 */
export interface SingboxRouteResult {
  rules: Record<string, unknown>[];
  /** 未命中任何规则时的出口 */
  final?: string;
  /** 需要声明的远程 rule_set */
  ruleSets: Record<string, unknown>[];
  /** 规则引用了不存在的策略组，需要调用方补建对应的 selector 出站 */
  missingGroups: string[];
  /** 无法转换而被丢弃的规则类型 -> 条数 */
  dropped: Map<string, number>;
  warnings: string[];
}

// 规则集下载源：jsDelivr CDN 镜像 GitHub 仓库，实测比 raw.githubusercontent.com
// 更稳定（后者在部分网络下会在内核启动阶段直接 EOF，导致 sing-box 无法启动）。
// 需要直连 GitHub 时把下面的 base 换成：
//   https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set
const SINGBOX_GEOIP_RULE_SET_BASE = 'https://cdn.jsdelivr.net/gh/SagerNet/sing-geoip@rule-set';
const SINGBOX_GEOSITE_RULE_SET_BASE = 'https://cdn.jsdelivr.net/gh/SagerNet/sing-geosite@rule-set';

/** 内置 ip_is_private 覆盖的 GEOIP 目标 */
const PRIVATE_GEOIP = new Set(['LAN', 'PRIVATE']);

/** 可直接映射到 sing-box 内置出站的目标 */
const BUILTIN_TARGETS = new Set(['DIRECT', 'REJECT', 'REJECT-DROP', 'REJECT-TLS']);

export interface SingboxRouteOptions {
  /** 解析规则目标名的映射（原始名 → 显示名） */
  nodeNameMap: Map<string, string>;
  /** 所有可用的 outbound tag */
  availableTags: Set<string>;
  /** 作为最终兜底的 tag（通常是一个 select 策略组） */
  fallbackTag?: string;
  /** Clash rule-provider 名 → sing-box rule_set tag */
  ruleProviderTags?: Map<string, string>;
  /** geo 规则处理方式：remote（默认）输出远程 rule_set，skip 则丢弃 */
  geoRules?: 'remote' | 'skip';
}

export interface ParsedRule {
  type: string;
  value: string;
  target: string;
  noResolve: boolean;
}

/**
 * 解析单条 Clash 规则的字段。
 * 与 utils/node-utils.ts 的 parseClashRule 语义保持一致：
 * 最后一段是策略组，倒数第二段之前是匹配值，no-resolve 为可选尾标记。
 */
export function parseRuleForSingbox(rule: string): ParsedRule | null {
  const raw = rule.trim();
  if (!raw || raw.startsWith('#')) return null;
  const parts = raw.split(',').map(part => part.trim());
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
  const target = hasTarget ? parts[end - 1] : 'DIRECT';
  const valueParts = parts.slice(1, hasTarget ? end - 1 : end);
  return { type, value: valueParts.join(','), target, noResolve };
}

interface TargetResolution {
  tag: string;
  /** true 表示这个 target 需要在调用方补建策略组 */
  needsGroup: boolean;
}

function resolveTarget(
  target: string,
  options: SingboxRouteOptions,
  missingGroups: Set<string>
): TargetResolution | null {
  const mapped = options.nodeNameMap.get(target) || target;
  if (options.availableTags.has(mapped)) return { tag: mapped, needsGroup: false };
  // 目标名可能是未映射的原始节点名：尝试反查 display 名
  for (const [original, display] of options.nodeNameMap) {
    if (display === target && options.availableTags.has(original)) {
      return { tag: original, needsGroup: false };
    }
  }

  const upper = mapped.toUpperCase();
  if (upper === 'REJECT' || upper === 'REJECT-DROP' || upper === 'REJECT-TLS') {
    return { tag: 'REJECT', needsGroup: false };
  }
  if (BUILTIN_TARGETS.has(upper)) return { tag: 'DIRECT', needsGroup: false };

  // 目标不在已知出站里：登记为待合成策略组，由调用方用全部节点补一个 selector
  if (mapped && !missingGroups.has(mapped)) missingGroups.add(mapped);
  return mapped ? { tag: mapped, needsGroup: true } : null;
}

/**
 * 把一条 Clash 规则转换为 sing-box 路由规则。
 * 返回 null 表示该规则类型无法转换。
 */
export function convertRuleToSingbox(
  rule: string,
  options: SingboxRouteOptions,
  missingGroups: Set<string> = new Set()
): { rule: Record<string, unknown>; terminalTarget?: string; ruleSets: string[] } | null {
  const parsed = parseRuleForSingbox(rule);
  if (!parsed) return null;

  const target = resolveTarget(parsed.target, options, missingGroups);
  if (!target) return null;

  if (parsed.type === 'MATCH' || parsed.type === 'FINAL') {
    return { rule: {}, terminalTarget: target.tag, ruleSets: [] };
  }

  const value = parsed.value.trim();
  const negative = value.startsWith('!');
  const body = negative ? value.slice(1).trim() : value;
  const ruleSets: string[] = [];

  const build = (matcher: Record<string, unknown>): Record<string, unknown> => {
    const result: Record<string, unknown> = { ...matcher };
    if (negative) result.invert = true;
    result.action = 'route';
    result.outbound = target.tag;
    return result;
  };

  switch (parsed.type) {
    case 'DOMAIN':
      return { rule: build({ domain: splitDomainValues(body) }), ruleSets };
    case 'DOMAIN-SUFFIX':
      return { rule: build({ domain_suffix: splitDomainValues(body) }), ruleSets };
    case 'DOMAIN-KEYWORD':
      return { rule: build({ domain_keyword: splitDomainValues(body) }), ruleSets };
    case 'DOMAIN-REGEX':
      return { rule: build({ domain_regex: splitDomainValues(body) }), ruleSets };
    case 'IP-CIDR':
    case 'IP-CIDR6':
      // 注意：/ 是 CIDR 的一部分，不能按多值分隔符切分
      // sing-box 的 ip_cidr 自行区分 v4/v6；no-resolve 无对应语义
      return { rule: build({ ip_cidr: [body] }), ruleSets };
    case 'SRC-IP-CIDR':
      return { rule: build({ source_ip_cidr: [body] }), ruleSets };
    case 'PROCESS-NAME':
      return { rule: build({ process_name: [body] }), ruleSets };
    case 'PROCESS-PATH':
      return { rule: build({ process_path: [body] }), ruleSets };
    case 'PROCESS-PATH-REGEX':
      return { rule: build({ process_path_regex: body }), ruleSets };
    case 'PROCESS-NAME-REGEX':
      return { rule: build({ process_name: [body] }), ruleSets };
    case 'DST-PORT':
      return { rule: build({ port: parsePortList(body) }), ruleSets };
    case 'SRC-PORT':
      return { rule: build({ source_port: parsePortList(body) }), ruleSets };
    case 'NETWORK': {
      const networkValue = body.toLowerCase();
      if (networkValue !== 'tcp' && networkValue !== 'udp') return null;
      return { rule: build({ network: [networkValue] }), ruleSets };
    }
    case 'GEOIP': {
      // LAN / PRIVATE 始终用内置 ip_is_private，不需要下载规则集
      if (PRIVATE_GEOIP.has(body.toUpperCase())) {
        return { rule: build({ ip_is_private: true }), ruleSets };
      }
      if (options.geoRules === 'skip') return null;
      const code = body.toLowerCase();
      if (!/^[a-z]{2}$/.test(code)) return null;
      const tag = `geoip-${code}`;
      ruleSets.push(tag);
      return { rule: build({ rule_set: [tag] }), ruleSets };
    }
    case 'GEOSITE': {
      if (options.geoRules === 'skip') return null;
      const code = body.toLowerCase();
      if (!/^[a-z0-9-]+$/.test(code)) return null;
      const tag = `geosite-${code}`;
      ruleSets.push(tag);
      return { rule: build({ rule_set: [tag] }), ruleSets };
    }
    case 'RULE-SET': {
      // Clash 的 RULE-SET 引用 rule-providers，这里映射到已转换的 rule_set tag
      const providerName = body;
      const mapped = options.ruleProviderTags?.get(providerName);
      if (!mapped) return null;
      return { rule: build({ rule_set: [mapped] }), ruleSets: [] };
    }
    default:
      return null;
  }
}

/**
 * 域名类规则的多值分隔：Clash 允许用 / 分隔多个域名。
 * 仅域名类规则适用——CIDR 里的 / 是网段前缀，必须整体保留。
 */
function splitDomainValues(value: string): string[] {
  return value.split('/').map(item => item.trim()).filter(Boolean);
}

function parsePortList(value: string): (number | string)[] {
  return value.split('/').map(item => item.trim()).filter(Boolean).map(item => {
    if (/^\d+$/.test(item)) return Number(item);
    return item;
  });
}

/** 构造 GEOIP / GEOSITE 的远程 rule_set 定义 */
/** 规则集下载使用的显式 HTTP 客户端 tag，避免内核走「隐式默认出站」的弃用路径 */
export const RULE_SET_HTTP_CLIENT = 'rule-set-download';

export function buildRuleSetDefinition(tag: string): Record<string, unknown> | null {
  if (tag.startsWith('geoip-')) {
    return {
      type: 'remote',
      tag,
      format: 'binary',
      url: `${SINGBOX_GEOIP_RULE_SET_BASE}/${tag}.srs`,
      update_interval: '7d',
      http_client: RULE_SET_HTTP_CLIENT,
    };
  }
  if (tag.startsWith('geosite-')) {
    return {
      type: 'remote',
      tag,
      format: 'binary',
      url: `${SINGBOX_GEOSITE_RULE_SET_BASE}/${tag}.srs`,
      update_interval: '7d',
      http_client: RULE_SET_HTTP_CLIENT,
    };
  }
  return null;
}

/**
 * 批量转换规则序列。
 *
 * 终止规则（MATCH / FINAL）会被提取为 route.final，其后的规则不再输出，
 * 与 Clash 的求值语义一致。
 */
export function convertRulesToSingbox(rules: string[], options: SingboxRouteOptions): SingboxRouteResult {
  const out: Record<string, unknown>[] = [];
  const dropped = new Map<string, number>();
  const warnings: string[] = [];
  const usedRuleSets = new Set<string>();
  const missingGroups = new Set<string>();
  let final: string | undefined;

  for (const rule of rules) {
    if (!rule || rule.startsWith('#')) continue;

    const parsed = parseRuleForSingbox(rule);
    if (!parsed) {
      const type = rule.split(',')[0].trim().toUpperCase() || '(空)';
      dropped.set(type, (dropped.get(type) ?? 0) + 1);
      continue;
    }

    const converted = convertRuleToSingbox(rule, options, missingGroups);
    if (!converted) {
      dropped.set(parsed.type, (dropped.get(parsed.type) ?? 0) + 1);
      continue;
    }

    if (converted.terminalTarget) {
      final = converted.terminalTarget;
      break;
    }
    for (const tag of converted.ruleSets) usedRuleSets.add(tag);
    out.push(converted.rule);
  }

  if (!final) {
    final = options.fallbackTag || (options.availableTags.has('DIRECT') ? 'DIRECT' : undefined);
    if (final) warnings.push(`规则中缺少 MATCH/FINAL 兜底，已补 route.final = ${final}`);
  }

  if (missingGroups.size > 0) {
    warnings.push(`规则引用的策略组不存在，已按全部节点合成: ${[...missingGroups].join('、')}`);
  }

  const ruleSets: Record<string, unknown>[] = [];
  for (const tag of [...usedRuleSets].sort()) {
    const def = buildRuleSetDefinition(tag);
    if (def) ruleSets.push(def);
  }

  return { rules: out, final, ruleSets, missingGroups: [...missingGroups], dropped, warnings };
}

// ============================================================
// Clash rule-providers → sing-box rule_set
// ============================================================

export interface ClashRuleProvider {
  type?: string;
  behavior?: string;
  url?: string;
  path?: string;
  interval?: number;
  format?: string;
}

/**
 * 把 Clash 的 rule-providers 转成 sing-box 的 rule_set 定义。
 *
 * behavior 映射：
 *   domain   → 规则集内容为裸域名（sing-box 的 source 格式要求带类型前缀，
 *              因此这里改成 classical 语义，由调用方在规则里用 rule_set 引用）
 *   ipcidr   → 同上
 *   classical→ 直接可用
 * 由于 Clash 的 provider 文件是「裸值」列表，而 sing-box 的 source 格式要求
 * 每行是完整规则，因此统一按 classical 声明，并保留远程 URL。
 */
export function convertClashRuleProviders(
  providers: Record<string, ClashRuleProvider> | undefined
): { ruleSets: Record<string, unknown>[]; tags: Map<string, string>; skipped: string[] } {
  const ruleSets: Record<string, unknown>[] = [];
  const tags = new Map<string, string>();
  const skipped: string[] = [];
  if (!providers || typeof providers !== 'object') return { ruleSets, tags, skipped };

  for (const [name, provider] of Object.entries(providers)) {
    if (!provider || typeof provider !== 'object') continue;
    const url = typeof provider.url === 'string' ? provider.url : '';
    if (provider.type === 'file' || !url) {
      // 本地文件型 provider 无法在服务端转换时获取，跳过
      skipped.push(name);
      continue;
    }
    const tag = sanitizeRuleSetTag(name);
    const interval = typeof provider.interval === 'number' && provider.interval > 0
      ? `${provider.interval}s`
      : '24h';
    ruleSets.push({
      type: 'remote',
      tag,
      format: provider.format === 'text' ? 'source' : 'binary',
      url,
      update_interval: interval,
      http_client: RULE_SET_HTTP_CLIENT,
    });
    tags.set(name, tag);
  }

  return { ruleSets, tags, skipped };
}

/** rule_set tag 只保留字母数字与短横线，避免内核拒绝 */
export function sanitizeRuleSetTag(name: string): string {
  const cleaned = name.replace(/[^\p{L}\p{N}_-]/gu, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return cleaned || 'rule-set';
}
