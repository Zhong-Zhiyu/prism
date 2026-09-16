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

  for (const original of filtered) {
    if (seen.has(original.name)) continue;
    seen.add(original.name);
    let name = original.name;
    for (const rule of renameRules) {
      name = name.replace(rule.pattern, rule.replacement);
    }
    const renamedNode = name === original.name ? original : { ...original, name };
    const displayName = getDisplayName(renamedNode, params);
    displayNames.set(original.name, displayName);
    renamed.push({ ...renamedNode, name: displayName });
  }

  return { nodes: renamed, displayNames, allNames: [...displayNames.values()] };
}

export function getDisplayName(node: ProxyNode, params: ConversionParams): string {
  let name = node.name;
  if (params.emoji === false) name = name.replace(/[\u{1F000}-\u{1FFFF}]/gu, '').trim();
  if (params.append_type) name = `[${node.type.toUpperCase()}] ${name}`;
  return name;
}

export function mapNodeReference(name: string, displayNames: Map<string, string>): string {
  return displayNames.get(name) || name;
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

function parseRenameRules(value?: string): Array<{ pattern: RegExp; replacement: string }> {
  if (!value) return [];
  const rawRules = value.split(/\r?\n/).map(rule => rule.trim()).filter(Boolean);
  const rules = rawRules.length > 1 ? rawRules : value.split('|').map(rule => rule.trim()).filter(Boolean);
  return rules.flatMap(rule => {
    const index = rule.lastIndexOf('@');
    if (index <= 0) return [];
    try {
      return [{ pattern: new RegExp(rule.slice(0, index)), replacement: rule.slice(index + 1) }];
    } catch {
      return [];
    }
  });
}
