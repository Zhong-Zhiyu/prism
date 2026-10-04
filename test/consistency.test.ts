// ============================================================
// 跨生成器语义一致性
//
// 同一份输入 + 同一组参数下，三种目标必须给出：
//   - 相同的策略组顺序
//   - 相同的组成员（在各自支持的范围内）
//   - 全部指向已定义策略的规则目标
// 节点集合允许差异，但只允许「目标格式本身不支持的节点类型」缺失。
//
// 这组测试的目的是防止「只修一处」——历史上已经出现过两次
// （终止规则让位、策略组顺序）。
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';
import { generateClashConfig } from '../src/generators/clash';
import { generateSingboxConfig } from '../src/generators/singbox';
import { generateSurgeConfig } from '../src/generators/surge';
import { parseIniConfig } from '../src/parsers/ini-parser';
import type { ClashConfig, ConversionParams, ProxyNode } from '../src/utils/types';
import { DEFAULT_PARAMS } from '../src/utils/types';

/** 各目标明确不支持的节点类型 */
const UNSUPPORTED: Record<'clash' | 'singbox' | 'surge', string[]> = {
  clash: [],
  singbox: ['ssr', 'mieru', 'wireguard', 'juicity', 'ssh', 'naive'],
  surge: ['ssr', 'vless', 'hysteria', 'mieru', 'wireguard', 'juicity', 'naive', 'tuic'],
};

const NODES: ProxyNode[] = [
  { name: '🇭🇰 HK-01', type: 'ss', server: 'a.example.com', port: 443, cipher: 'aes-128-gcm', password: 'pw' },
  { name: 'JP-02', type: 'trojan', server: 'b.example.com', port: 443, password: 'pw' },
  { name: 'SG-03', type: 'anytls', server: 'c.example.com', port: 8443, password: 'pw', sni: 'c.example.com' },
  { name: 'US-04', type: 'vmess', server: 'd.example.com', port: 443, uuid: '11111111-2222-3333-4444-555555555555', alterId: 0 },
  { name: 'SSR-05', type: 'ssr', server: 'e.example.com', port: 8443, cipher: 'aes-256-cfb', password: 'pw', protocol: 'auth_aes128_md5', obfs: 'tls1.2_ticket_auth' },
  { name: 'FR-06', type: 'hysteria2', server: 'f.example.com', port: 8443, password: 'pw', sni: 'f.example.com' },
];

const SOURCE: ClashConfig = {
  proxies: NODES,
  'proxy-groups': [
    { name: 'AUTO', type: 'url-test', url: 'http://x/generate_204', interval: 300, proxies: ['🇭🇰 HK-01', 'JP-02'] },
    { name: 'SEL', type: 'select', proxies: ['AUTO', ...NODES.map(node => node.name), 'DIRECT'] },
  ],
  rules: ['DOMAIN-SUFFIX,a.test,SEL', 'MATCH,SEL'],
};

interface Extracted {
  proxies: string[];
  groups: string[];
  members: Map<string, string[]>;
  rules: string[];
}

function fromClash(text: string): Extracted {
  const proxies: string[] = [];
  const groups: string[] = [];
  const members = new Map<string, string[]>();
  const rules: string[] = [];
  let section = '';
  for (const line of text.split('\n')) {
    if (/^proxies:/.test(line)) { section = 'proxies'; continue; }
    if (/^proxy-groups:/.test(line)) { section = 'groups'; continue; }
    if (/^rules:/.test(line)) { section = 'rules'; continue; }
    if (/^[a-z-]+:/.test(line) && !/^\s/.test(line)) { section = ''; continue; }
    if (section === 'proxies') {
      const match = line.match(/^\s*-\s*\{\s*name:\s*"((?:[^"\\]|\\.)*)"/);
      if (match) proxies.push(match[1].replace(/\\"/g, '"'));
    } else if (section === 'groups') {
      const match = line.match(/^\s*-\s*\{\s*name:\s*"((?:[^"\\]|\\.)*)"/);
      if (match) {
        const name = match[1].replace(/\\"/g, '"');
        groups.push(name);
        const list = line.match(/proxies:\s*\[([^\]]*)\]/);
        members.set(name, list ? list[1].split(',').map(item => item.trim().replace(/^"|"$/g, '')).filter(Boolean) : []);
      }
    } else if (section === 'rules') {
      const match = line.match(/^\s*-\s*(.+)$/);
      if (!match) continue;
      const parts = match[1].trim().replace(/^"|"$/g, '').split(',');
      const last = parts[parts.length - 1].trim();
      rules.push(last.toLowerCase() === 'no-resolve' ? parts[parts.length - 2].trim() : last);
    }
  }
  return { proxies, groups, members, rules };
}

function fromSingbox(text: string): Extracted {
  const config = JSON.parse(text) as {
    outbounds?: Record<string, unknown>[];
    route?: { rules?: Record<string, unknown>[]; final?: string };
  };
  const proxies: string[] = [];
  const groups: string[] = [];
  const members = new Map<string, string[]>();
  const rules: string[] = [];
  for (const outbound of config.outbounds ?? []) {
    const type = String(outbound.type);
    const tag = String(outbound.tag);
    if (type === 'direct' || type === 'block') continue;
    if (type === 'selector' || type === 'urltest') {
      groups.push(tag);
      members.set(tag, (outbound.outbounds as string[] | undefined) ?? []);
    } else {
      proxies.push(tag);
    }
  }
  for (const rule of config.route?.rules ?? []) {
    if (rule.outbound) rules.push(String(rule.outbound));
  }
  if (config.route?.final) rules.push(String(config.route.final));
  return { proxies, groups, members, rules };
}

function fromSurge(text: string): Extracted {
  const proxies: string[] = [];
  const groups: string[] = [];
  const members = new Map<string, string[]>();
  const rules: string[] = [];
  let section = '';
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (/^\[.+\]$/.test(line)) { section = line.slice(1, -1); continue; }
    if (!line || line.startsWith('#')) continue;
    if (section === 'Proxy' && line.includes('=')) {
      proxies.push(line.split('=')[0].trim());
    } else if (section === 'Proxy Group' && line.includes('=')) {
      const name = line.split('=')[0].trim();
      const rest = line.split('=').slice(1).join('=');
      groups.push(name);
      members.set(name, rest.split(',').slice(1).map(item => item.trim()).filter(item => item && !item.includes('=')));
    } else if (section === 'Rule') {
      const parts = line.split(',');
      const last = parts[parts.length - 1].trim();
      rules.push(last.toLowerCase() === 'no-resolve' ? parts[parts.length - 2].trim() : last);
    }
  }
  return { proxies, groups, members, rules };
}

function buildAll(overrides: Partial<ConversionParams> = {}): Record<'clash' | 'singbox' | 'surge', Extracted> {
  const ini = parseIniConfig('[custom]\ncustom_proxy_group=🚀 节点选择`select`.*');
  const base: ConversionParams = { ...DEFAULT_PARAMS, url: '', config: 'https://x/config.ini', ...overrides };
  return {
    clash: fromClash(generateClashConfig(SOURCE, ini, { ...base, target: 'clash' }, {})),
    singbox: fromSingbox(generateSingboxConfig(SOURCE, ini, { ...base, target: 'singbox' }, {})),
    surge: fromSurge(generateSurgeConfig(SOURCE, ini, { ...base, target: 'surge' }, {})),
  };
}

/** 判断某个 display 名对应的源节点类型 */
function sourceTypeOf(display: string): string {
  const bracket = display.match(/^\[([A-Z0-9]+)\]/);
  if (bracket) return bracket[1].toLowerCase();
  const node = NODES.find(item => item.name === display || display.startsWith(item.name) || display.endsWith(item.name));
  return node ? String(node.type).toLowerCase() : '';
}

const PARAM_MATRIX: Array<[string, Partial<ConversionParams>]> = [
  ['默认参数', {}],
  ['emoji=false', { emoji: false }],
  ['append_type=true', { append_type: true }],
  ['emoji=false + append_type', { emoji: false, append_type: true }],
  ['rename', { rename: 'HK@HongKong' }],
  ['sort=true', { sort: true }],
  ['include', { include: '^(JP|SG|FR)' }],
  ['exclude', { exclude: 'SSR' }],
  ['include + append_type', { include: 'HK', append_type: true }],
  ['rename + emoji=false + sort', { rename: 'HK@HK2', emoji: false, sort: true }],
];

test('跨生成器：策略组顺序与节点集合在参数矩阵下保持一致', () => {
  for (const [label, overrides] of PARAM_MATRIX) {
    const { clash, singbox, surge } = buildAll(overrides);

    // 策略组顺序必须完全一致
    assert.deepEqual(singbox.groups, clash.groups, `${label}: sing-box 策略组顺序不一致`);
    assert.deepEqual(surge.groups, clash.groups, `${label}: Surge 策略组顺序不一致`);

    // 不允许任何目标多出节点
    for (const [name, extracted] of [['sing-box', singbox], ['Surge', surge]] as const) {
      const extra = extracted.proxies.filter(node => !clash.proxies.includes(node));
      assert.deepEqual(extra, [], `${label}: ${name} 多出节点`);
    }

    // 缺失的节点必须全部属于该目标明确不支持的类型
    for (const [name, extracted] of [['sing-box', singbox], ['Surge', surge]] as const) {
      const missing = clash.proxies.filter(node => !extracted.proxies.includes(node));
      const unexpected = missing.filter(node => !UNSUPPORTED[name === 'sing-box' ? 'singbox' : 'surge'].includes(sourceTypeOf(node)));
      assert.deepEqual(unexpected, [], `${label}: ${name} 意外缺失节点`);
    }
  }
});

test('跨生成器：策略组成员在各自支持的范围内一致', () => {
  for (const [label, overrides] of PARAM_MATRIX) {
    const { clash, singbox, surge } = buildAll(overrides);

    for (const group of clash.groups) {
      const clashMembers = clash.members.get(group) ?? [];
      // 只比较三个目标都支持的成员
      const common = clashMembers.filter(member =>
        member === 'DIRECT' || member === 'REJECT'
        || (singbox.proxies.includes(member) || singbox.groups.includes(member))
        && (surge.proxies.includes(member) || surge.groups.includes(member)));

      const singboxMembers = (singbox.members.get(group) ?? []).filter(member => common.includes(member));
      const surgeMembers = (surge.members.get(group) ?? []).filter(member => common.includes(member));

      assert.deepEqual(singboxMembers, common, `${label}: 组 ${group} 的 sing-box 成员不一致`);
      assert.deepEqual(surgeMembers, common, `${label}: 组 ${group} 的 Surge 成员不一致`);
    }
  }
});

test('跨生成器：所有规则目标都已定义', () => {
  for (const [label, overrides] of PARAM_MATRIX) {
    const { clash, singbox, surge } = buildAll(overrides);
    const sets: Array<[string, Extracted]> = [['Clash', clash], ['sing-box', singbox], ['Surge', surge]];

    for (const [name, extracted] of sets) {
      const known = new Set([...extracted.proxies, ...extracted.groups, 'DIRECT', 'REJECT', 'REJECT-TLS', 'REJECT-DROP']);
      for (const target of extracted.rules) {
        assert.ok(known.has(target), `${label}: ${name} 规则目标未定义 ${target}`);
      }
    }
  }
});

test('跨生成器：三目标的终止兜底目标一致', () => {
  for (const [label, overrides] of PARAM_MATRIX) {
    const { clash, singbox, surge } = buildAll(overrides);
    const clashFinal = clash.rules[clash.rules.length - 1];
    const surgeFinal = surge.rules[surge.rules.length - 1];
    const singboxFinal = singbox.rules[singbox.rules.length - 1];
    assert.equal(surgeFinal, clashFinal, `${label}: Surge 与 Clash 终止目标不一致`);
    assert.equal(singboxFinal, clashFinal, `${label}: sing-box 与 Clash 终止目标不一致`);
  }
});
