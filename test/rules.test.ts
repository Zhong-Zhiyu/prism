// ============================================================
// 规则装配与终止语义（三目标一致性）
//
// 覆盖「源订阅终止规则 × 外部配置规则集」的组合矩阵，
// 这是最容易出隐蔽问题的地方：源侧 MATCH 排在规则集之前时，
// 会把整批规则集规则裁掉，导致外部配置失效。
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';
import { generateClashConfig } from '../src/generators/clash';
import { generateSingboxConfig } from '../src/generators/singbox';
import { generateSurgeConfig } from '../src/generators/surge';
import { checkSurgeConfig } from '../src/generators/surge-check';
import { parseIniConfig } from '../src/parsers/ini-parser';
import { parseClashYaml } from '../src/parsers/yaml-parser';
import { collectFinalRules, isTerminalRule } from '../src/utils/rule-collector';
import type { ClashConfig, ConversionParams } from '../src/utils/types';
import { DEFAULT_PARAMS } from '../src/utils/types';

const SOURCE: ClashConfig = {
  proxies: [
    { name: 'n1', type: 'ss', server: 'a.example.com', port: 443, cipher: 'aes-128-gcm', password: 'pw' },
    { name: 'n2', type: 'trojan', server: 'b.example.com', port: 443, password: 'pw' },
  ],
  'proxy-groups': [{ name: 'G', type: 'select', proxies: ['n1', 'n2'] }],
  rules: [],
};

const CONFIG_INI = [
  '[custom]',
  'custom_proxy_group=🚀 节点选择`select`.*',
  'ruleset=🚀 节点选择,https://fixture.test/rules.list',
  'ruleset=🚀 节点选择,[]FINAL',
].join('\n');

const RULE_CONTENTS = {
  'https://fixture.test/rules.list': ['DOMAIN-SUFFIX,rule-list.test', 'IP-CIDR,10.0.0.0/8,no-resolve'],
};

function params(target: ConversionParams['target'], overrides: Partial<ConversionParams> = {}): ConversionParams {
  return { ...DEFAULT_PARAMS, target, url: '', config: 'https://fixture.test/config.ini', ...overrides };
}

function clashRules(source: ClashConfig, ini = CONFIG_INI, contents = RULE_CONTENTS): string[] {
  const output = generateClashConfig(source, parseIniConfig(ini), params('clash'), contents);
  return parseClashYaml(output).rules ?? [];
}

function singboxRoute(source: ClashConfig, ini = CONFIG_INI, contents = RULE_CONTENTS) {
  const config = JSON.parse(generateSingboxConfig(source, parseIniConfig(ini), params('singbox'), contents)) as {
    route?: { rules?: Record<string, unknown>[]; final?: string };
  };
  return config.route ?? {};
}

function surgeRules(source: ClashConfig, ini = CONFIG_INI, contents = RULE_CONTENTS): string[] {
  const output = generateSurgeConfig(source, parseIniConfig(ini), params('surge'), contents);
  const check = checkSurgeConfig(output);
  assert.deepEqual(check.errors, [], 'Surge 结构校验应通过');
  const section = output.split('[Rule]')[1] ?? '';
  return section.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('['));
}

// ============================================================
// 终止规则让位
// ============================================================

test('规则装配：源订阅的 MATCH 必须让位给外部配置的规则集', () => {
  const source: ClashConfig = { ...SOURCE, rules: ['DOMAIN-SUFFIX,source.test,G', 'MATCH,G'] };

  // Clash
  const clash = clashRules(source);
  assert.ok(clash.includes('DOMAIN-SUFFIX,source.test,G'), '源侧非终止规则应保留');
  assert.ok(clash.includes('DOMAIN-SUFFIX,rule-list.test,🚀 节点选择'), '规则集规则必须保留');
  assert.ok(clash.includes('IP-CIDR,10.0.0.0/8,🚀 节点选择,no-resolve'));
  assert.ok(clash.includes('MATCH,🚀 节点选择'), '终止规则应来自外部配置');
  assert.equal(clash.filter(rule => rule.startsWith('MATCH')).length, 1);
  assert.equal(clash.includes('MATCH,G'), false, '源侧 MATCH 不应输出');

  // sing-box
  const route = singboxRoute(source);
  const targets = (route.rules ?? []).map(rule => rule.outbound);
  assert.ok(targets.includes('🚀 节点选择'), 'sing-box 规则集规则必须保留');
  assert.equal(route.final, '🚀 节点选择');

  // Surge
  const surge = surgeRules(source);
  assert.ok(surge.includes('DOMAIN-SUFFIX,rule-list.test,🚀 节点选择'));
  assert.ok(surge.includes('FINAL,🚀 节点选择'));
  assert.equal(surge.filter(line => line.startsWith('FINAL,')).length, 1);
});

test('规则装配：源订阅的 FINAL 同样让位', () => {
  const source: ClashConfig = { ...SOURCE, rules: ['DOMAIN-SUFFIX,source.test,G', 'FINAL,G'] };
  assert.ok(clashRules(source).includes('DOMAIN-SUFFIX,rule-list.test,🚀 节点选择'));
  assert.equal(singboxRoute(source).final, '🚀 节点选择');
  assert.ok(surgeRules(source).includes('FINAL,🚀 节点选择'));
});

test('规则装配：overwrite_original_rules=true 时完全丢弃源规则', () => {
  const ini = [
    '[custom]',
    'overwrite_original_rules=true',
    'custom_proxy_group=🚀 节点选择`select`.*',
    'ruleset=🚀 节点选择,https://fixture.test/rules.list',
    'ruleset=🚀 节点选择,[]FINAL',
  ].join('\n');
  const source: ClashConfig = { ...SOURCE, rules: ['DOMAIN-SUFFIX,source.test,G', 'MATCH,G'] };

  const clash = clashRules(source, ini);
  assert.equal(clash.includes('DOMAIN-SUFFIX,source.test,G'), false);
  assert.ok(clash.includes('DOMAIN-SUFFIX,rule-list.test,🚀 节点选择'));

  const surge = surgeRules(source, ini);
  assert.equal(surge.some(line => line.includes('source.test')), false);
});

test('规则装配：无 ruleset 条目时沿用源规则（含终止规则）', () => {
  const ini = '[custom]\ncustom_proxy_group=🚀 节点选择`select`.*';
  const source: ClashConfig = { ...SOURCE, rules: ['DOMAIN-SUFFIX,a.test,G', 'MATCH,G'] };

  const clash = clashRules(source, ini, {});
  assert.deepEqual(clash, ['DOMAIN-SUFFIX,a.test,G', 'MATCH,G']);

  const route = singboxRoute(source, ini, {});
  assert.deepEqual((route.rules ?? []).map(rule => rule.outbound), ['G']);
  assert.equal(route.final, 'G');

  const surge = surgeRules(source, ini, {});
  assert.deepEqual(surge, ['DOMAIN-SUFFIX,a.test,G', 'FINAL,G']);
});

test('规则装配：规则集缺失内容时占位注释不阻断后续规则', () => {
  const source: ClashConfig = { ...SOURCE, rules: ['DOMAIN-SUFFIX,source.test,G', 'MATCH,G'] };
  const clash = clashRules(source, CONFIG_INI, {});
  // 规则集内容缺失 → 不产生规则集规则，但源侧非终止规则与配置的 MATCH 仍要保留
  assert.ok(clash.includes('DOMAIN-SUFFIX,source.test,G'));
  assert.ok(clash.includes('MATCH,🚀 节点选择'));
  assert.equal(clash.some(rule => rule.includes('rule-list.test')), false);
});

test('规则装配：源规则里的重复与覆盖仍按语义裁剪', () => {
  const source: ClashConfig = {
    ...SOURCE,
    rules: [
      'DOMAIN-SUFFIX,abc.test,G',
      'DOMAIN-SUFFIX,sub.abc.test,G',
      'DOMAIN,sub.abc.test,G',
      'IP-CIDR,10.0.0.0/8,G,no-resolve',
      'IP-CIDR,10.1.0.0/16,G,no-resolve',
      'MATCH,G',
    ],
  };
  const clash = clashRules(source, '[custom]\ncustom_proxy_group=🚀 节点选择`select`.*', {});
  assert.deepEqual(clash, ['DOMAIN-SUFFIX,abc.test,G', 'IP-CIDR,10.0.0.0/8,G,no-resolve', 'MATCH,G']);
});

// ============================================================
// collectFinalRules 单元语义
// ============================================================

test('isTerminalRule 识别 MATCH / FINAL 且忽略大小写', () => {
  assert.equal(isTerminalRule('MATCH,G'), true);
  assert.equal(isTerminalRule('match,G'), true);
  assert.equal(isTerminalRule('FINAL,G'), true);
  assert.equal(isTerminalRule('final,DIRECT'), true);
  assert.equal(isTerminalRule('DOMAIN,a.test,G'), false);
  assert.equal(isTerminalRule('# MATCH,G'), false);
});

test('collectFinalRules 在合并场景不做终止截断', () => {
  // 模拟多订阅合并：前一份的 MATCH 不应截断后一份的规则
  const source: ClashConfig = {
    ...SOURCE,
    rules: ['DOMAIN-SUFFIX,first.test,G', 'MATCH,G', 'DOMAIN-SUFFIX,second.test,G'],
  };
  const rules = collectFinalRules(source, parseIniConfig('[custom]'), { dedup: true }, {}, { finalType: 'MATCH' });
  assert.deepEqual(rules, ['DOMAIN-SUFFIX,first.test,G', 'MATCH,G', 'DOMAIN-SUFFIX,second.test,G']);
});

test('collectFinalRules 的 dedup=false 保留全部条目', () => {
  const source: ClashConfig = {
    ...SOURCE,
    rules: ['DOMAIN-SUFFIX,a.test,G', 'DOMAIN-SUFFIX,a.test,G'],
  };
  const rules = collectFinalRules(source, parseIniConfig('[custom]'), { dedup: false }, {}, { finalType: 'MATCH' });
  assert.equal(rules.length, 2);
});

// ============================================================
// 三目标规则语义一致性
// ============================================================

test('三目标对同一规则序列的判定结果一致', () => {
  const cases: ClashConfig[] = [
    { ...SOURCE, rules: ['DOMAIN-SUFFIX,a.test,G', 'MATCH,G'] },
    { ...SOURCE, rules: ['IP-CIDR,192.168.0.0/16,G,no-resolve', 'MATCH,G'] },
    { ...SOURCE, rules: ['GEOIP,CN,DIRECT', 'MATCH,G'] },
    { ...SOURCE, rules: [] },
  ];

  for (const [index, source] of cases.entries()) {
    const clash = clashRules(source);
    const route = singboxRoute(source);
    const surge = surgeRules(source);

    // 三边都必须有终止兜底，且目标一致
    const clashTerminal = clash.filter(rule => rule.startsWith('MATCH') || rule.startsWith('FINAL'));
    assert.equal(clashTerminal.length, 1, `case ${index}: Clash 应有唯一终止规则`);
    assert.equal(surge.filter(line => line.startsWith('FINAL,')).length, 1, `case ${index}: Surge 应有唯一 FINAL`);
    assert.ok(route.final, `case ${index}: sing-box 应有 route.final`);

    const clashTarget = clashTerminal[0].split(',').slice(1).join(',');
    const surgeTarget = surge.find(line => line.startsWith('FINAL,'))?.slice('FINAL,'.length);
    assert.equal(clashTarget, route.final, `case ${index}: Clash 与 sing-box 终止目标不一致`);
    assert.equal(surgeTarget, route.final, `case ${index}: Surge 与 sing-box 终止目标不一致`);
  }
});
