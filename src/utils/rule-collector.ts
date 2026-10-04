// ============================================================
// 规则序列装配（三种目标共用）
//
// 关键语义：当存在外部配置的 ruleset 条目时，源订阅自带的终止规则
// （MATCH / FINAL）必须让位——它排在规则集规则之前时，会把整批规则集
// 规则裁掉，导致外部配置几乎失效。
// ============================================================

import type { ClashConfig, ParsedIniConfig } from './types';
import { expandRulesetEntries, pruneRulesWithLog } from './rule-pruner';

/** 判断一条规则是否为终止规则（MATCH / FINAL） */
export function isTerminalRule(rule: string): boolean {
  const type = rule.split(',')[0].trim().toUpperCase();
  return type === 'MATCH' || type === 'FINAL';
}

/** 从订阅配置里取出可用规则（去掉空行与注释行） */
export function toRuleArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((rule): rule is string =>
    typeof rule === 'string' && rule.trim() !== '' && !rule.startsWith('#'));
}

export interface FinalRulesOptions {
  /** 展开 ruleset 时使用的终止规则类型：Clash/sing-box 用 MATCH，Surge 用 FINAL */
  finalType: 'MATCH' | 'FINAL';
  /** 规则集内容缺失时的占位注释生成器 */
  onMissingContent?: (entry: { groupName: string }) => string | void;
}

/**
 * 装配最终规则序列（Clash / sing-box / Surge 共用）。
 *
 * - 有 ruleset 条目：源订阅的非终止规则在前，展开后的规则集规则在后；
 *   源侧的 MATCH/FINAL 被剔除，终止语义交给规则集末尾的 FINAL 条目。
 * - 无 ruleset 条目：直接用源订阅规则。
 * - 裁剪时关闭「终止后截断」，因为规则集末尾的 FINAL 本来就在最后。
 */
export function collectFinalRules(
  sourceConfig: ClashConfig,
  iniConfig: ParsedIniConfig,
  params: { dedup?: boolean },
  ruleContents: Record<string, string[]>,
  options: FinalRulesOptions
): string[] {
  const sourceRules = toRuleArray(sourceConfig.rules);

  if (iniConfig.rulesetEntries.length === 0) {
    return params.dedup === false
      ? sourceRules
      : pruneRulesWithLog(sourceRules, { stopAtTerminal: false });
  }

  const sourceNonTerminal = iniConfig.overwriteOriginalRules
    ? []
    : sourceRules.filter(rule => !isTerminalRule(rule));

  const rawRules = [
    ...sourceNonTerminal,
    ...expandRulesetEntries(iniConfig, ruleContents, options.finalType, options.onMissingContent),
  ];

  return params.dedup === false ? rawRules : pruneRulesWithLog(rawRules, { stopAtTerminal: false });
}
