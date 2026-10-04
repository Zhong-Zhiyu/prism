// ============================================================
// 模糊测试：随机 + 边界输入下，三种目标的产物必须始终「可解析且自洽」。
//
// 断言口径（与内核无关，纯结构）：
//   - 生成过程不抛异常
//   - Clash 产物：可被 YAML 解析，且规则/策略组引用全部已定义
//   - sing-box 产物：可被 JSON 解析，route 目标与策略组成员全部已定义
//   - Surge 产物：结构校验通过（checkSurgeConfig 无 error）
// ============================================================

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { generateClashConfig } from '../src/generators/clash';
import { generateSingboxConfig } from '../src/generators/singbox';
import { generateSurgeConfig } from '../src/generators/surge';
import { checkSurgeConfig } from '../src/generators/surge-check';
import { parseIniConfig } from '../src/parsers/ini-parser';
import { parseClashYaml } from '../src/parsers/yaml-parser';
import type { ClashConfig, ConversionParams, ParsedIniConfig, ProxyNode } from '../src/utils/types';
import { DEFAULT_PARAMS } from '../src/utils/types';

/** 确定性伪随机数（避免测试不稳定） */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const NODE_TYPES = ['ss', 'vmess', 'vless', 'trojan', 'hysteria2', 'tuic', 'snell', 'anytls', 'http', 'socks5', 'ssr'];

/** 会出现在真实订阅里的刁钻字符 */
const TRICKY_CHARS = [
  '', ' ', '  leading', 'trailing  ', 'a,b', 'a=b', 'a"b', "a'b", 'a\\b', 'a\nb', 'a\tb',
  '中文名称', '🇭🇰 香港 01', 'emoji😀node', '[SS] node', '{x}', 'a:b', 'a#b', '- dash', '*star',
  '剩余流量：200 GB', '距离下次重置剩余：10 天', 'A'.repeat(120), 'null', 'true', '123',
];

function randomString(random: () => number, tricky: boolean): string {
  if (tricky) return TRICKY_CHARS[Math.floor(random() * TRICKY_CHARS.length)];
  const length = 1 + Math.floor(random() * 12);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += String.fromCharCode(97 + Math.floor(random() * 26));
  }
  return out;
}

function randomNode(random: () => number, index: number, tricky: boolean): ProxyNode {
  const type = NODE_TYPES[Math.floor(random() * NODE_TYPES.length)];
  const node: ProxyNode = {
    name: `${randomString(random, tricky)}-${index}`,
    type,
    server: tricky ? randomString(random, true) : `s${index}.example.com`,
    port: 1 + Math.floor(random() * 65535),
  };

  if (type === 'ss') {
    node.cipher = ['aes-128-gcm', 'aes-256-gcm', 'chacha20-ietf-poly1305', ''][Math.floor(random() * 4)];
    node.password = randomString(random, tricky);
    if (random() < 0.3) {
      node.plugin = 'obfs';
      node['plugin-opts'] = { mode: random() < 0.5 ? 'tls' : 'http', host: randomString(random, tricky) };
    }
  } else if (type === 'vmess' || type === 'vless') {
    node.uuid = random() < 0.5 ? '11111111-2222-3333-4444-555555555555' : randomString(random, tricky);
    if (type === 'vmess') node.alterId = Math.floor(random() * 5);
    if (random() < 0.4) {
      node.network = 'ws';
      node['ws-opts'] = { path: '/ws', headers: { Host: randomString(random, tricky) } };
    } else if (random() < 0.2) {
      node.network = 'grpc';
      node['grpc-opts'] = { 'grpc-service-name': 'svc' };
    }
    if (random() < 0.4) {
      node.tls = true;
      node.servername = 'cdn.example.com';
      node['client-fingerprint'] = 'chrome';
    }
    if (type === 'vless' && random() < 0.3) node.flow = 'xtls-rprx-vision';
  } else if (type === 'trojan') {
    node.password = randomString(random, tricky);
    if (random() < 0.5) node.sni = 'cdn.example.com';
  } else if (type === 'hysteria2') {
    node.password = randomString(random, tricky);
    node.up = ['100 Mbps', '1 Gbps', '0', 'abc', 100][Math.floor(random() * 5)];
    node.down = ['500 Mbps', '2 Gbps', '', 50][Math.floor(random() * 4)];
  } else if (type === 'tuic') {
    node.uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    node.password = randomString(random, tricky);
    if (random() < 0.5) node.alpn = ['h3'];
  } else if (type === 'snell') {
    node.psk = randomString(random, tricky);
    node.version = [3, 4, 5, 99][Math.floor(random() * 4)];
    if (random() < 0.4) node['obfs-opts'] = { mode: 'tls', host: 'bing.com' };
  } else if (type === 'anytls') {
    node.password = randomString(random, tricky);
    if (random() < 0.5) node.alpn = ['h2', 'http/1.1'];
  } else if (type === 'http' || type === 'socks5') {
    if (random() < 0.6) {
      node.username = randomString(random, tricky);
      node.password = randomString(random, tricky);
    }
  } else if (type === 'ssr') {
    node.cipher = 'aes-256-cfb';
    node.password = randomString(random, tricky);
    node.protocol = 'auth_aes128_md5';
    node.obfs = 'tls1.2_ticket_auth';
  }

  if (random() < 0.3) node.udp = true;
  if (random() < 0.2) node['skip-cert-verify'] = true;
  if (random() < 0.2) node.alpn = ['h2'];
  return node;
}

const RULE_TEMPLATES = [
  'DOMAIN-SUFFIX,{v},{t}',
  'DOMAIN,{v},{t}',
  'DOMAIN-KEYWORD,{v},{t}',
  'IP-CIDR,10.0.0.0/8,{t},no-resolve',
  'IP-CIDR6,fc00::/7,{t}',
  'GEOIP,CN,{t}',
  'GEOSITE,openai,{t}',
  'PROCESS-NAME,curl,{t}',
  'URL-REGEX,^https?://ads\\.example\\.com/,{t}',
  'DST-PORT,443,{t}',
  'MATCH,{t}',
];

function randomRules(random: () => number, targets: string[], count: number): string[] {
  const rules: string[] = [];
  for (let i = 0; i < count; i++) {
    const template = RULE_TEMPLATES[Math.floor(random() * RULE_TEMPLATES.length)];
    const target = targets[Math.floor(random() * targets.length)];
    rules.push(template.replace('{v}', `v${i}.example.com`).replace('{t}', target));
  }
  return rules;
}

function checkClashOutput(output: string, allowEmpty = false): void {
  let parsed: ClashConfig;
  try {
    parsed = parseClashYaml(output);
  } catch (error) {
    // 源节点全部字段不完整时，产物里没有任何有效节点是正确行为
    if (allowEmpty && /未找到有效代理节点/.test((error as Error).message)) return;
    throw error;
  }
  const defined = new Set<string>([
    ...parsed.proxies.map(node => node.name),
    ...(parsed['proxy-groups'] ?? []).map(group => group.name),
    'DIRECT', 'REJECT', 'REJECT-DROP', 'REJECT-TLS', 'PASS', 'COMPATIBLE', 'GLOBAL',
  ]);
  for (const group of parsed['proxy-groups'] ?? []) {
    for (const member of group.proxies) {
      assert.ok(defined.has(member), `Clash 策略组 ${group.name} 引用未定义成员 ${member}`);
    }
  }
  for (const rule of parsed.rules ?? []) {
    const parts = rule.split(',').map(part => part.trim());
    const target = parts[parts.length - 1].toLowerCase() === 'no-resolve' ? parts[parts.length - 2] : parts[parts.length - 1];
    assert.ok(defined.has(target), `Clash 规则引用未定义策略 ${target}（规则: ${rule}）`);
  }
}

function checkSingboxOutput(output: string, allowEmpty = false): void {
  const config = JSON.parse(output) as {
    outbounds?: Record<string, unknown>[];
    route?: { rules?: Record<string, unknown>[]; final?: string; rule_set?: Record<string, unknown>[] };
    dns?: { servers?: Record<string, unknown>[] };
  };
  const outbounds = config.outbounds ?? [];
  const tags = new Set(outbounds.map(item => String(item.tag)));

  // tag 必须唯一（内核会因重复 tag 拒绝加载）
  assert.equal(tags.size, outbounds.length, 'sing-box 出现重复 outbound tag');

  for (const outbound of outbounds) {
    for (const member of (outbound.outbounds as string[] | undefined) ?? []) {
      assert.ok(tags.has(member), `sing-box 策略组 ${String(outbound.tag)} 引用未定义成员 ${member}`);
    }
    if (outbound.default !== undefined) {
      assert.ok(tags.has(String(outbound.default)), `sing-box ${String(outbound.tag)} 的 default 不存在`);
    }
  }
  for (const rule of config.route?.rules ?? []) {
    const target = rule.outbound;
    if (target === undefined) continue;
    // 源节点全部无效时，规则目标会被回退为内置出站，属正确行为
    if (allowEmpty && !tags.has(String(target)) && ['DIRECT', 'REJECT'].includes(String(target))) continue;
    assert.ok(tags.has(String(target)), `sing-box 规则引用未定义出站 ${String(target)}`);
  }
  if (config.route?.final !== undefined) {
    assert.ok(tags.has(config.route.final), `sing-box route.final 不存在: ${config.route.final}`);
  }
  for (const server of config.dns?.servers ?? []) {
    assert.ok(typeof server.type === 'string', 'sing-box DNS 服务端缺少 type');
    assert.equal('address' in server, false, 'sing-box DNS 服务端使用了已移除的 address 字段');
  }
}

function checkSurgeOutput(output: string): void {
  const result = checkSurgeConfig(output);
  assert.deepEqual(result.errors, [], `Surge 结构校验失败:\n${result.errors.slice(0, 5).join('\n')}`);
}

const INI_VARIANTS = [
  '[custom]',
  '[custom]\ncustom_proxy_group=🚀 节点选择`select`.*\ncustom_proxy_group=♻️ 自动选择`url-test`.*`http://x/generate_204`300',
  '[custom]\noverwrite_original_rules=true\ncustom_proxy_group=P`select`.*\nruleset=P,[]FINAL',
  '[custom]\ncustom_proxy_group=空组`select`不存在的节点\ncustom_proxy_group=自引用`select`自引用',
];

test('模糊测试：随机节点与规则下三种目标产物始终自洽', () => {
  const random = makeRandom(20261003);
  const failures: string[] = [];

  for (let round = 0; round < 150; round++) {
    const tricky = round % 3 === 0;
    const nodeCount = 1 + Math.floor(random() * 8);
    const nodes: ProxyNode[] = [];
    for (let i = 0; i < nodeCount; i++) nodes.push(randomNode(random, i, tricky));

    // 随机制造重名节点（真实订阅里常见）
    if (round % 5 === 0 && nodes.length > 1) nodes[1].name = nodes[0].name;

    const groupNames = ['G1', 'G2', '幽灵组'];
    const targets = [...nodes.map(node => node.name), ...groupNames, 'DIRECT', 'REJECT'];
    const source: ClashConfig = {
      proxies: nodes,
      'proxy-groups': [
        { name: 'G1', type: 'select', proxies: [...nodes.map(node => node.name), 'DIRECT'] },
        { name: 'G2', type: 'url-test', url: 'http://x/generate_204', interval: 300, proxies: nodes.map(node => node.name) },
      ],
      rules: randomRules(random, targets, 1 + Math.floor(random() * 8)),
    };

    const iniText = INI_VARIANTS[Math.floor(random() * INI_VARIANTS.length)];
    const ini: ParsedIniConfig = parseIniConfig(iniText);
    const params: ConversionParams = {
      ...DEFAULT_PARAMS,
      url: '',
      config: random() < 0.5 ? 'https://x/config.ini' : undefined,
      emoji: random() < 0.5,
      append_type: random() < 0.3,
      udp: random() < 0.5,
      tfo: random() < 0.3,
      scv: random() < 0.3,
      sort: random() < 0.3,
      dedup: random() < 0.5,
      expand: random() < 0.5,
      rename: random() < 0.2 ? 'node@renamed' : undefined,
      include: random() < 0.2 ? '^[a-z]' : undefined,
    };

    for (const target of ['clash', 'singbox', 'surge'] as const) {
      try {
        const targetParams = { ...params, target };
        if (target === 'clash') {
          checkClashOutput(generateClashConfig(source, ini, targetParams, {}), true);
        } else if (target === 'singbox') {
          checkSingboxOutput(generateSingboxConfig(source, ini, targetParams, {}), true);
        } else {
          checkSurgeOutput(generateSurgeConfig(source, ini, targetParams, {}));
        }
      } catch (error) {
        const message = `round ${round} target ${target} (tricky=${tricky}): ${(error as Error).message}`;
        failures.push(message);
        // 落盘每个失败样本，便于离线逐个定位（.tmp-tests 已在 .gitignore 中）
        try {
          const dir = `.tmp-tests/fuzz-failure/r${round}-${target}`;
          mkdirSync(dir, { recursive: true });
          writeFileSync(`${dir}/input.json`, JSON.stringify({ round, tricky, source, iniText, params }, null, 2));
          const output = target === 'clash'
            ? generateClashConfig(source, ini, { ...params, target }, {})
            : target === 'singbox'
              ? generateSingboxConfig(source, ini, { ...params, target }, {})
              : generateSurgeConfig(source, ini, { ...params, target }, {});
          writeFileSync(`${dir}/output.txt`, output);
          writeFileSync(`${dir}/error.txt`, message);
        } catch { /* 落盘失败不影响断言 */ }
      }
    }
    if (failures.length > 6) break;
  }

  assert.deepEqual(failures, [], `模糊测试发现 ${failures.length} 处问题`);
});

test('模糊测试：畸形输入不得让生成器抛异常', () => {
  const malformed: ClashConfig[] = [
    { proxies: [], rules: [] },
    { proxies: [{ name: '', type: 'ss', server: '', port: 0 }], rules: [''] },
    { proxies: [{ name: 'x', type: 'unknown', server: 'a', port: 1 }], rules: ['DOMAIN'] },
    { proxies: [{ name: 'x', type: 'ss', server: 'a.example.com', port: 443 }], rules: ['MATCH'] },
    { proxies: [{ name: 'x', type: 'ss', server: 'a.example.com', port: 443, cipher: 'aes-128-gcm', password: 'p' }], rules: ['MATCH,不存在的策略'] },
    { proxies: [{ name: 'x', type: 'ss', server: 'a.example.com', port: 443, cipher: 'aes-128-gcm', password: 'p' }], 'proxy-groups': [{ name: 'G', type: 'select', proxies: [] }], rules: [] },
    { proxies: [{ name: 'x', type: 'ss', server: 'a.example.com', port: 443, cipher: 'aes-128-gcm', password: 'p' }], dns: { nameserver: ['裸域名'], 'fake-ip-range': '乱写' }, rules: [] },
    { proxies: [{ name: 'x', type: 'vless', server: 'a.example.com', port: 443, uuid: 'u', 'reality-opts': { 'public-key': '' } }], rules: [] },
  ];

  for (const [index, source] of malformed.entries()) {
    for (const target of ['clash', 'singbox', 'surge'] as const) {
      const params: ConversionParams = { ...DEFAULT_PARAMS, target, url: '', config: 'https://x/config.ini' };
      const ini = parseIniConfig('[custom]\ncustom_proxy_group=P`select`.*');
      try {
        if (target === 'clash') generateClashConfig(source, ini, params, {});
        else if (target === 'singbox') generateSingboxConfig(source, ini, params, {});
        else generateSurgeConfig(source, ini, params, {});
      } catch (error) {
        assert.fail(`畸形输入 #${index} 在 ${target} 上抛异常: ${(error as Error).message}`);
      }
    }
  }
});
