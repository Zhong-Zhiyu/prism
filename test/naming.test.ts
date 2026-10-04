// ============================================================
// 节点命名与策略组成员映射
//
// 覆盖三类容易出错的地方：
//   1. rename 规则解析（正则里的 | 与旧版 | 分隔符的歧义）
//   2. display 名唯一性（rename / emoji / append_type 都可能撞名）
//   3. 策略组成员必须映射为 display 名（三种目标一致）
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';
import { generateClashConfig } from '../src/generators/clash';
import { generateSingboxConfig } from '../src/generators/singbox';
import { generateSurgeConfig } from '../src/generators/surge';
import { checkSurgeConfig } from '../src/generators/surge-check';
import { parseIniConfig } from '../src/parsers/ini-parser';
import { parseClashYaml } from '../src/parsers/yaml-parser';
import { getDisplayName, prepareNodes, stripEmoji } from '../src/utils/node-utils';
import type { ClashConfig, ConversionParams, ProxyNode } from '../src/utils/types';
import { DEFAULT_PARAMS } from '../src/utils/types';

const NODES: ProxyNode[] = [
  { name: 'a-one', type: 'ss', server: 's1.example.com', port: 443, cipher: 'aes-128-gcm', password: 'pw' },
  { name: 'a-two', type: 'trojan', server: 's2.example.com', port: 443, password: 'pw' },
  { name: '🇭🇰 HK', type: 'anytls', server: 's3.example.com', port: 8443, password: 'pw' },
];

const SOURCE: ClashConfig = {
  proxies: NODES,
  'proxy-groups': [{ name: 'G', type: 'select', proxies: [...NODES.map(node => node.name), 'DIRECT'] }],
  rules: ['DOMAIN-SUFFIX,a.test,G', 'MATCH,G'],
};

function params(overrides: Partial<ConversionParams> = {}): ConversionParams {
  return { ...DEFAULT_PARAMS, url: '', target: 'clash', ...overrides };
}

function names(overrides: Partial<ConversionParams> = {}): string[] {
  return prepareNodes(NODES, params(overrides)).allNames;
}

// ============================================================
// rename 解析
// ============================================================

test('rename：正则里的 | 不会被当成规则分隔符', () => {
  // ^(a-one|a-two)$@SAME —— 若按 | 切分会得到两条非法规则，导致 rename 静默失效
  const result = names({ rename: '^(a-one|a-two)$@SAME' });
  assert.deepEqual(result, ['SAME', 'SAME-2', '🇭🇰 HK']);
});

test('rename：单条规则正常工作', () => {
  assert.deepEqual(names({ rename: 'a-one@A1' }), ['A1', 'a-two', '🇭🇰 HK']);
  assert.deepEqual(names({ rename: 'one@ONE' }), ['a-ONE', 'a-two', '🇭🇰 HK']);
});

test('rename：多条规则可用换行分隔', () => {
  const result = names({ rename: 'a-one@X\na-two@Y' });
  assert.deepEqual(result, ['X', 'Y', '🇭🇰 HK']);
});

test('rename：旧版 | 分隔仍然兼容（每段都是合法规则时）', () => {
  const result = names({ rename: 'a-one@X|a-two@Y' });
  assert.deepEqual(result, ['X', 'Y', '🇭🇰 HK']);
});

test('rename：含 | 的多条规则用换行分隔', () => {
  const result = names({ rename: '^(a-one|a-two)$@Z\nHK@HK2' });
  assert.deepEqual(result, ['Z', 'Z-2', '🇭🇰 HK2']);
});

test('rename：非法规则被忽略而不是抛异常', () => {
  assert.deepEqual(names({ rename: 'no-at-sign' }), ['a-one', 'a-two', '🇭🇰 HK']);
  assert.deepEqual(names({ rename: '[invalid(@X' }), ['a-one', 'a-two', '🇭🇰 HK']);
  assert.deepEqual(names({ rename: '' }), ['a-one', 'a-two', '🇭🇰 HK']);
});

// ============================================================
// display 名唯一性
// ============================================================

test('命名：rename 撞名时自动加后缀保证唯一', () => {
  const result = names({ rename: '^(a-one|a-two)$@SAME' });
  assert.equal(new Set(result).size, result.length, 'display 名必须唯一');
  assert.deepEqual(result.slice(0, 2), ['SAME', 'SAME-2']);
});

test('命名：emoji 去除后撞名时也保证唯一', () => {
  const nodes: ProxyNode[] = [
    { name: '🇭🇰 HK', type: 'ss', server: 's1.example.com', port: 443, cipher: 'aes-128-gcm', password: 'pw' },
    { name: '🇯🇵 HK', type: 'trojan', server: 's2.example.com', port: 443, password: 'pw' },
  ];
  const result = prepareNodes(nodes, params({ emoji: false })).allNames;
  assert.deepEqual(result, ['HK', 'HK-2']);
  assert.equal(new Set(result).size, result.length);
});

test('命名：append_type 下同名节点也能区分', () => {
  const nodes: ProxyNode[] = [
    { name: 'X', type: 'ss', server: 's1.example.com', port: 443, cipher: 'aes-128-gcm', password: 'pw' },
    { name: 'X', type: 'trojan', server: 's2.example.com', port: 443, password: 'pw' },
  ];
  // 同名原始节点会被 prepareNodes 去重（保留第一个）
  const result = prepareNodes(nodes, params({ append_type: true })).allNames;
  assert.equal(result.length, 1);
  assert.deepEqual(result, ['[SS] X']);
});

test('命名：默认参数下名称保持不变', () => {
  assert.deepEqual(names(), ['a-one', 'a-two', '🇭🇰 HK']);
});

// ============================================================
// 策略组成员映射（三目标）
// ============================================================

function clashGroupMembers(overrides: Partial<ConversionParams>): string[] {
  const output = generateClashConfig(SOURCE, parseIniConfig('[custom]'), params(overrides), {});
  const parsed = parseClashYaml(output);
  return (parsed['proxy-groups'] ?? [])[0]?.proxies ?? [];
}

function singboxGroupMembers(overrides: Partial<ConversionParams>): string[] {
  const config = JSON.parse(generateSingboxConfig(SOURCE, parseIniConfig('[custom]'),
    params({ ...overrides, target: 'singbox' }), {})) as { outbounds?: Record<string, unknown>[] };
  const group = (config.outbounds ?? []).find(item => item.tag === 'G');
  return (group?.outbounds as string[] | undefined) ?? [];
}

function surgeGroupMembers(overrides: Partial<ConversionParams>): string[] {
  const output = generateSurgeConfig(SOURCE, parseIniConfig('[custom]'),
    params({ ...overrides, target: 'surge' }), {});
  const check = checkSurgeConfig(output);
  assert.deepEqual(check.errors, [], 'Surge 结构校验应通过');
  const line = output.split('\n').find(row => row.startsWith('G = ')) ?? '';
  return line.split(',').slice(1).map(item => item.trim()).filter(item => item && !item.includes('='));
}

const MEMBER_CASES: Array<[string, Partial<ConversionParams>]> = [
  ['默认参数', {}],
  ['append_type=true', { append_type: true }],
  ['emoji=false', { emoji: false }],
  ['rename', { rename: 'a-one@A1' }],
  ['append_type + rename', { append_type: true, rename: 'one@ONE' }],
];

test('策略组成员：三目标都映射为 display 名', () => {
  for (const [label, overrides] of MEMBER_CASES) {
    const display = names(overrides);
    const expected = [...display, 'DIRECT'];

    const clash = clashGroupMembers(overrides);
    const singbox = singboxGroupMembers(overrides);
    const surge = surgeGroupMembers(overrides);

    assert.deepEqual(clash, expected, `${label}: Clash 组成员`);
    assert.deepEqual(singbox, expected, `${label}: sing-box 组成员`);
    assert.deepEqual(surge, expected, `${label}: Surge 组成员`);
  }
});

test('策略组成员：成员必须都是已输出的节点名', () => {
  for (const [label, overrides] of MEMBER_CASES) {
    const display = new Set(names(overrides));
    for (const [name, members] of [
      ['Clash', clashGroupMembers(overrides)],
      ['sing-box', singboxGroupMembers(overrides)],
      ['Surge', surgeGroupMembers(overrides)],
    ] as const) {
      for (const member of members) {
        if (member === 'DIRECT' || member === 'REJECT') continue;
        assert.ok(display.has(member), `${label}: ${name} 组成员 ${member} 不是已输出的节点`);
      }
    }
  }
});

// ============================================================
// emoji 剥离与空名防护
// ============================================================

test('emoji 剥离：覆盖完整范围（旧实现只覆盖 U+1F000-U+1FFFF）', () => {
  const cases: Array<[string, string]> = [
    ['🇭🇰 HK-01', 'HK-01'],          // 区域指示符
    ['😀 node', 'node'],              // 1F600 区
    ['☺️ node', 'node'],              // BMP + 变体选择符
    ['❤️ node', 'node'],              // BMP + 变体选择符
    ['✅ node', 'node'],              // BMP 符号
    ['⭐ node', 'node'],              // BMP 符号
    ['⚡ node', 'node'],              // BMP 符号
    ['✈️ node', 'node'],              // BMP + 变体选择符
    ['🏳️‍🌈 node', 'node'],            // ZWJ 序列
    ['👍🏻 node', 'node'],            // 肤色修饰符
    ['© node', 'node'],               // 版权符号
    ['™ node', 'node'],               // 商标符号
  ];
  for (const [input, expected] of cases) {
    assert.equal(stripEmoji(input), expected, `${JSON.stringify(input)} 应剥离为 ${JSON.stringify(expected)}`);
  }
});

test('emoji 剥离：不得破坏正常字符', () => {
  for (const input of ['中文名称', '[SS] node', 'a-b_c.d', 'HK-01', 'US 04', 'node(1)']) {
    assert.equal(stripEmoji(input), input, `${JSON.stringify(input)} 不应被改动`);
  }
});

test('emoji 剥离：剥离后为空时回退到原名，保证非空', () => {
  for (const input of ['🇭🇰', '😀', '🇯🇵', '⭐']) {
    const result = stripEmoji(input);
    assert.notEqual(result, '', `${JSON.stringify(input)} 不应变成空串`);
    assert.equal(result, input, '应回退到原名');
  }
});

test('命名：emoji 剥离后为空不会导致策略组引用悬空', () => {
  const nodes: ProxyNode[] = [
    { name: '🇭🇰', type: 'ss', server: 's1.example.com', port: 443, cipher: 'aes-128-gcm', password: 'pw' },
    { name: 'normal', type: 'trojan', server: 's2.example.com', port: 443, password: 'pw' },
  ];
  const source: ClashConfig = {
    proxies: nodes,
    'proxy-groups': [{ name: 'G', type: 'select', proxies: ['🇭🇰', 'normal', 'DIRECT'] }],
    rules: ['DOMAIN-SUFFIX,a.test,G', 'MATCH,G'],
  };
  const overrides: Partial<ConversionParams> = { emoji: false };

  const display = prepareNodes(nodes, params(overrides)).allNames;
  assert.equal(display.every(name => name.length > 0), true, 'display 名必须非空');
  assert.deepEqual(display, ['🇭🇰', 'normal']);

  // Clash：节点与组成员都要包含该节点
  const clashOutput = generateClashConfig(source, parseIniConfig('[custom]'), params(overrides), {});
  const clashParsed = parseClashYaml(clashOutput);
  const clashNames = new Set(clashParsed.proxies.map(node => node.name));
  assert.equal(clashNames.has('🇭🇰'), true, 'Clash 节点应保留');
  for (const member of (clashParsed['proxy-groups'] ?? [])[0]?.proxies ?? []) {
    if (member === 'DIRECT' || member === 'REJECT') continue;
    assert.ok(clashNames.has(member), `Clash 组成员 ${JSON.stringify(member)} 必须是已定义节点`);
  }

  // sing-box：tag 非空且组成员有效
  const singboxConfig = JSON.parse(generateSingboxConfig(source, parseIniConfig('[custom]'),
    params({ ...overrides, target: 'singbox' }), {})) as { outbounds?: Record<string, unknown>[] };
  const tags = (singboxConfig.outbounds ?? []).map(item => String(item.tag));
  assert.equal(tags.includes(''), false, 'sing-box 不应出现空 tag');
  const group = (singboxConfig.outbounds ?? []).find(item => item.tag === 'G');
  for (const member of (group?.outbounds as string[] | undefined) ?? []) {
    assert.ok(tags.includes(member), `sing-box 组成员 ${member} 必须是已定义出站`);
  }

  // Surge：结构校验通过
  const surgeOutput = generateSurgeConfig(source, parseIniConfig('[custom]'),
    params({ ...overrides, target: 'surge' }), {});
  assert.deepEqual(checkSurgeConfig(surgeOutput).errors, []);
});

test('getDisplayName：append_type 与 emoji 组合下的输出', () => {
  const node: ProxyNode = { name: '🇭🇰 HK', type: 'ss', server: 'a.example.com', port: 443 };
  assert.equal(getDisplayName(node, params()), '🇭🇰 HK');
  assert.equal(getDisplayName(node, params({ emoji: false })), 'HK');
  assert.equal(getDisplayName(node, params({ append_type: true })), '[SS] 🇭🇰 HK');
  assert.equal(getDisplayName(node, params({ emoji: false, append_type: true })), '[SS] HK');
});
