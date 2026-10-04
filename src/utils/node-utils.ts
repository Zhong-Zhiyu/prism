import type { ConversionParams, ProxyNode } from './types';

export interface PreparedNodes {
  nodes: ProxyNode[];
  displayNames: Map<string, string>;
  allNames: string[];
}

export function prepareNodes(nodes: ProxyNode[], params: ConversionParams): PreparedNodes {
  let filtered = [...nodes];
  if (params.include) {
    const regex = new RegExp(params.include);
    filtered = filtered.filter(node => regex.test(node.name));
  }
  if (params.exclude) {
    const regex = new RegExp(params.exclude);
    filtered = filtered.filter(node => !regex.test(node.name));
  }
  if (params.sort) filtered.sort((a, b) => a.name.localeCompare(b.name));

  const renameRules = parseRenameRules(params.rename);
  const displayNames = new Map<string, string>();
  const renamed: ProxyNode[] = [];
  const seen = new Set<string>();
  // rename / emoji / append_type 都可能让两个不同节点得到同一个 display 名。
  // 重名会让 sing-box 报 "duplicate outbound tag"、mihomo 报策略组成员重复，
  // 因此这里统一加数字后缀保证唯一。
  const usedDisplayNames = new Set<string>();

  for (const original of filtered) {
    if (seen.has(original.name)) continue;
    seen.add(original.name);
    let name = original.name;
    for (const rule of renameRules) {
      name = name.replace(rule.pattern, rule.replacement);
    }
    const renamedNode = name === original.name ? original : { ...original, name };
    let displayName = getDisplayName(renamedNode, params);
    if (usedDisplayNames.has(displayName)) {
      const base = displayName;
      let suffix = 2;
      while (usedDisplayNames.has(`${base}-${suffix}`)) suffix++;
      displayName = `${base}-${suffix}`;
    }
    usedDisplayNames.add(displayName);
    displayNames.set(original.name, displayName);
    renamed.push({ ...renamedNode, name: displayName });
  }

  return { nodes: renamed, displayNames, allNames: [...displayNames.values()] };
}

/**
 * emoji 剥离用的字符集。
 *
 * 旧实现只覆盖 U+1F000-U+1FFFF，会漏掉：
 *   - BMP 区的 emoji 符号（☺ U+263A、❤ U+2764、✅ U+2705、⭐ U+2B50、⚡ U+26A1 等）
 *   - 变体选择符 U+FE0F、零宽连接符 U+200D、键帽组合符 U+20E3
 *   - 肤色修饰符 U+1F3FB-U+1F3FF
 * 这里用 Unicode 属性转义覆盖完整范围。
 */
const EMOJI_PATTERN = /[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u200D\u20E3\u{1F3FB}-\u{1F3FF}]/gu;

/** 去掉 emoji 后的名称；若结果为空则回退到原名，保证 display 名永远非空 */
export function stripEmoji(name: string): string {
  const stripped = name.replace(EMOJI_PATTERN, '').replace(/\s{2,}/g, ' ').trim();
  return stripped || name.trim();
}

export function getDisplayName(node: ProxyNode, params: ConversionParams): string {
  let name = params.emoji === false ? stripEmoji(node.name) : node.name;
  if (params.append_type) name = `[${node.type.toUpperCase()}] ${name}`;
  return name;
}

/**
 * 把「原始节点名」映射为输出用的 display 名。
 * 注意：必须用 has() 判断而不是 `|| name`——display 名理论上可能被外部改写成空串，
 * 那时 `||` 会错误地回退成原始名，导致引用悬空。
 */
export function mapNodeReference(name: string, displayNames: Map<string, string>): string {
  return displayNames.has(name) ? (displayNames.get(name) as string) : name;
}

export interface ParsedRule {
  type: string;
  value: string;
  target: string;
  noResolve: boolean;
}

export function parseClashRule(rule: string): ParsedRule | null {
  const parts = rule.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const type = parts[0].toUpperCase();
  const noResolve = parts[parts.length - 1].toLowerCase() === 'no-resolve';
  const body = noResolve ? parts.slice(0, -1) : parts;
  // MATCH / FINAL 没有匹配值，第二个字段即策略组
  if (type === 'MATCH' || type === 'FINAL') {
    return { type, value: '', target: body[body.length - 1] || 'DIRECT', noResolve };
  }
  const hasTarget = body.length >= 3;
  const target = hasTarget ? body[body.length - 1] : 'DIRECT';
  const valueParts = hasTarget ? body.slice(1, -1) : body.slice(1);
  return { type, value: valueParts.join(',').trim(), target, noResolve };
}

/**
 * 解析 rename 规则：`pattern@replacement`，多条规则用换行分隔（兼容旧版 `|` 分隔）。
 *
 * 分隔符有歧义：正则里本来就常用 `|` 表示「或」（如 `^(a|b)$@x`），
 * 若按 `|` 切分会把正则切碎、规则静默失效。因此：
 *   1. 含换行时一律按换行切分；
 *   2. 单行时先整体当作一条规则；只有当整体解析不出 `@` 且按 `|` 切分后
 *      每段都是合法规则时，才回退到 `|` 分隔。
 */
function parseRenameRules(value?: string): Array<{ pattern: RegExp; replacement: string }> {
  if (!value) return [];

  const parseOne = (rule: string): { pattern: RegExp; replacement: string } | null => {
    const index = rule.lastIndexOf('@');
    if (index <= 0) return null;
    const patternText = rule.slice(0, index);
    // @ 不是正则元字符：pattern 里出现 @ 说明这里其实混进了多条规则
    // （例如 a-one@X|a-two@Y 会被 lastIndexOf 解析成 pattern=a-one@X|a-two）
    if (patternText.includes('@')) return null;
    try {
      return { pattern: new RegExp(patternText), replacement: rule.slice(index + 1) };
    } catch {
      return null;
    }
  };

  const byLine = value.split(/\r?\n/).map(rule => rule.trim()).filter(Boolean);
  if (byLine.length > 1) {
    return byLine.flatMap(rule => parseOne(rule) ?? []);
  }

  const single = value.trim();
  const whole = parseOne(single);
  if (whole) return [whole];

  // 整体不是合法规则，尝试旧版 `|` 分隔；只有每段都能解析成规则时才采用
  const segments = single.split('|').map(rule => rule.trim()).filter(Boolean);
  const parsed = segments.map(parseOne);
  if (segments.length > 1 && parsed.every(item => item !== null)) {
    return parsed as Array<{ pattern: RegExp; replacement: string }>;
  }
  return [];
}

/**
 * 节点字段是否足以生成一份可被内核加载的配置。
 * 上游订阅或 API 传入的畸形配置里常见：server 为空、端口非整数或越界、名称为空。
 * 这类节点一旦原样输出，内核会拒绝整份配置，因此生成前统一过滤。
 */
export function isValidProxyNode(node: ProxyNode): boolean {
  if (!node || typeof node !== 'object') return false;
  if (typeof node.name !== 'string' || node.name.trim() === '') return false;
  if (typeof node.server !== 'string' || node.server.trim() === '') return false;
  if (!Number.isInteger(node.port) || node.port < 1 || node.port > 65535) return false;
  if (typeof node.type !== 'string' || node.type.trim() === '') return false;
  // 主机名必须是单段无空白字符串：含逗号/引号/空白的「主机名」在
  // Surge 的逗号分隔语法里无法表达，强行输出会产生字段错位
  if (/[\s,"'=]/.test(node.server)) return false;
  return true;
}

/**
 * 过滤掉字段不完整的节点，并按类型统计跳过数量。
 */
export function filterValidNodes(nodes: ProxyNode[]): { nodes: ProxyNode[]; dropped: Map<string, number> } {
  const kept: ProxyNode[] = [];
  const dropped = new Map<string, number>();
  for (const node of nodes) {
    if (isValidProxyNode(node)) {
      kept.push(node);
      continue;
    }
    const type = node && typeof node.type === 'string' && node.type ? node.type : '(未知)';
    dropped.set(type, (dropped.get(type) ?? 0) + 1);
  }
  return { nodes: kept, dropped };
}
