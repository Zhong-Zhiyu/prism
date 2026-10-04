import assert from 'node:assert/strict';
import test from 'node:test';
import { parseClashYaml } from '../src/parsers/yaml-parser';
import { parseIniConfig } from '../src/parsers/ini-parser';
import { parseClashRule, prepareNodes } from '../src/utils/node-utils';
import { pruneRules } from '../src/utils/rule-pruner';
import { generateClashConfig, migrateClashDns } from '../src/generators/clash';
import { generateSurgeConfig } from '../src/generators/surge';
import { clampInterval, convertNodeToSingboxOutbound, generateSingboxConfig, parseBandwidth } from '../src/generators/singbox';
import { convertClashDnsToSingbox, normalizeFakeIpRange, parseDnsServerAddress } from '../src/generators/singbox-dns';
import { buildRuleSetDefinition, convertClashRuleProviders, parseRuleForSingbox, sanitizeRuleSetTag } from '../src/generators/singbox-rules';
import { parseVergeTagFromLocation } from '../src/worker';
import type { ClashConfig, ConversionParams, ParsedIniConfig } from '../src/utils/types';
import { DEFAULT_PARAMS } from '../src/utils/types';

test('parses block-style Clash proxies and groups', () => {
  const config = parseClashYaml(`
proxies:
  - name: node-a
    type: ss
    server: example.com
    port: 443
proxy-groups:
  - name: Auto
    type: select
    proxies:
      - node-a
`);
  assert.equal(config.proxies[0].server, 'example.com');
  assert.equal(config.proxies[0].port, 443);
  assert.deepEqual(config['proxy-groups']?.[0].proxies, ['node-a']);
});

test('parses mihomo-specific proxy types and drops unknown ones', () => {
  const config = parseClashYaml(`
proxies:
  - { name: traffic-info, type: anytls, server: example.com, port: 50201, password: pw, client-fingerprint: chrome, udp: true, alpn: [h2, http/1.1], sni: tls.example.com, skip-cert-verify: true }
  - { name: hysteria-node, type: hysteria, server: example.com, port: 8443, password: pw, up: 100, down: 100 }
  - { name: juicity-node, type: juicity, server: example.com, port: 443 }
  - { name: outdated-client-node, type: vmess, server: example.com, port: 5002, uuid: 11111111-1111-1111-1111-111111111111, alterId: 0, cipher: auto, udp: true }
`);
  assert.deepEqual(config.proxies.map(proxy => proxy.type), ['anytls', 'hysteria', 'vmess']);
  const anytls = config.proxies[0];
  assert.equal(anytls.password, 'pw');
  assert.equal(anytls.sni, 'tls.example.com');
  assert.deepEqual(anytls.alpn, ['h2', 'http/1.1']);
  assert.equal(anytls['skip-cert-verify'], true);
  assert.equal(anytls.udp, true);
  assert.equal(config.proxies.some(proxy => proxy.name === 'juicity-node'), false);
  assert.deepEqual(config.proxies.map(proxy => proxy.name), ['traffic-info', 'hysteria-node', 'outdated-client-node']);
});

test('keeps rule values separate from policy and no-resolve', () => {
  assert.deepEqual(parseClashRule('DOMAIN-SUFFIX,example.com,Proxy'), {
    type: 'DOMAIN-SUFFIX', value: 'example.com', target: 'Proxy', noResolve: false,
  });
  assert.deepEqual(parseClashRule('IP-CIDR,10.0.0.0/8,Proxy,no-resolve'), {
    type: 'IP-CIDR', value: '10.0.0.0/8', target: 'Proxy', noResolve: true,
  });
  assert.deepEqual(parseClashRule('DOMAIN,example.com'), {
    type: 'DOMAIN', value: 'example.com', target: 'DIRECT', noResolve: false,
  });
});

test('maps renamed and decorated node references', () => {
  const params: ConversionParams = {
    target: 'clash', url: '', rename: 'HK@Hong Kong', emoji: false,
    append_type: true, tfo: false, udp: false, sort: false, scv: false,
    expand: true, tls13: false,
  };
  const prepared = prepareNodes([{
    name: '🇭🇰 HK', type: 'ss', server: 'example.com', port: 443,
  }], params);
  assert.equal(prepared.allNames[0], '[SS] Hong Kong');
  assert.equal(prepared.displayNames.get('🇭🇰 HK'), '[SS] Hong Kong');
});

test('extracts Clash Verge tag from GitHub redirect location', () => {
  const base = 'https://github.com/clash-verge-rev/clash-verge-rev/releases/tag/';
  assert.equal(parseVergeTagFromLocation(`${base}v3.0.0`), 'v3.0.0');
  assert.equal(parseVergeTagFromLocation(`${base}v2.4.2`), 'v2.4.2');
  assert.equal(parseVergeTagFromLocation(`${base}v2.5.2`), 'v2.5.2');
});

test('rejects malformed Clash Verge redirect locations', () => {
  assert.equal(parseVergeTagFromLocation(''), null);
  assert.equal(parseVergeTagFromLocation('https://github.com/clash-verge-rev/clash-verge-rev/releases'), null);
  assert.equal(parseVergeTagFromLocation('https://github.com/clash-verge-rev/clash-verge-rev/releases/tag/'), null);
  assert.equal(parseVergeTagFromLocation('https://github.com/clash-verge-rev/clash-verge-rev/releases/tag/latest'), null);
  assert.equal(parseVergeTagFromLocation('https://github.com/clash-verge-rev/clash-verge-rev/releases/tag/v2.4.2-beta.1'), null);
  assert.equal(parseVergeTagFromLocation('https://evil.com/tag/v9.9.9\r\nInjected: 1'), null);
  assert.equal(parseVergeTagFromLocation('https://github.com/clash-verge-rev/clash-verge-rev/releases/tag/v2.4.2/extra'), null);
});

test('parses MATCH and FINAL rules with their policy target', () => {
  assert.deepEqual(parseClashRule('MATCH,Proxy'), {
    type: 'MATCH', value: '', target: 'Proxy', noResolve: false,
  });
  assert.deepEqual(parseClashRule('FINAL,DIRECT'), {
    type: 'FINAL', value: '', target: 'DIRECT', noResolve: false,
  });
});

// ============================================================
// 规则裁剪
// ============================================================

test('pruneRules keeps the first of exact duplicates ignoring target', () => {
  const { rules, stats } = pruneRules([
    'DOMAIN,example.com,ProxyA',
    'DOMAIN,example.com,ProxyB',
    'DOMAIN-SUFFIX,Example.COM,ProxyC',
    'DOMAIN-SUFFIX,example.com ,ProxyD',
  ]);
  assert.deepEqual(rules, ['DOMAIN,example.com,ProxyA', 'DOMAIN-SUFFIX,Example.COM,ProxyC']);
  assert.equal(stats.duplicate, 2);
});

test('pruneRules removes rules covered by an earlier domain suffix', () => {
  const { rules, stats } = pruneRules([
    'DOMAIN-SUFFIX,abc.com,Proxy',
    'DOMAIN-SUFFIX,abc.abc.com,Proxy',
    'DOMAIN,abc.abc.com,Proxy',
    'DOMAIN-SUFFIX,notabc.com,Proxy',
  ]);
  assert.deepEqual(rules, ['DOMAIN-SUFFIX,abc.com,Proxy', 'DOMAIN-SUFFIX,notabc.com,Proxy']);
  assert.equal(stats.domainCovered, 2);
});

test('pruneRules keeps a broader suffix that appears after a narrower one', () => {
  const { rules } = pruneRules([
    'DOMAIN,example.com,DIRECT',
    'DOMAIN-SUFFIX,example.com,DIRECT',
  ]);
  assert.deepEqual(rules, [
    'DOMAIN,example.com,DIRECT',
    'DOMAIN-SUFFIX,example.com,DIRECT',
  ]);
});

test('pruneRules applies keyword coverage in one direction only', () => {
  const forward = pruneRules([
    'DOMAIN-KEYWORD,goog,Proxy',
    'DOMAIN-KEYWORD,google,Proxy',
    'DOMAIN,google.com,Proxy',
  ]);
  assert.deepEqual(forward.rules, ['DOMAIN-KEYWORD,goog,Proxy']);
  assert.equal(forward.stats.keywordCovered, 2);

  const reversed = pruneRules([
    'DOMAIN-KEYWORD,google,Proxy',
    'DOMAIN-KEYWORD,goog,Proxy',
  ]);
  assert.deepEqual(reversed.rules, [
    'DOMAIN-KEYWORD,google,Proxy',
    'DOMAIN-KEYWORD,goog,Proxy',
  ]);
});

test('pruneRules removes rules contained in an earlier CIDR', () => {
  const { rules, stats } = pruneRules([
    'IP-CIDR,10.0.0.0/8,DIRECT,no-resolve',
    'IP-CIDR,10.1.0.0/16,DIRECT,no-resolve',
    'IP-CIDR,10.0.0.1/8,DIRECT,no-resolve',
    'IP-CIDR,11.0.0.0/8,DIRECT,no-resolve',
    'IP-CIDR6,fc00::/7,DIRECT,no-resolve',
    'IP-CIDR6,fd00::/8,DIRECT,no-resolve',
    'IP-CIDR,not-a-cidr,DIRECT,no-resolve',
  ]);
  assert.deepEqual(rules, [
    'IP-CIDR,10.0.0.0/8,DIRECT,no-resolve',
    'IP-CIDR,11.0.0.0/8,DIRECT,no-resolve',
    'IP-CIDR6,fc00::/7,DIRECT,no-resolve',
    'IP-CIDR,not-a-cidr,DIRECT,no-resolve',
  ]);
  assert.equal(stats.cidrCovered, 3);
});

test('pruneRules respects no-resolve semantics when comparing CIDRs', () => {
  const resolveLater = pruneRules([
    'IP-CIDR,10.0.0.0/8,DIRECT,no-resolve',
    'IP-CIDR,10.1.0.0/16,DIRECT',
  ]);
  assert.deepEqual(resolveLater.rules, [
    'IP-CIDR,10.0.0.0/8,DIRECT,no-resolve',
    'IP-CIDR,10.1.0.0/16,DIRECT',
  ]);

  const noResolveLater = pruneRules([
    'IP-CIDR,10.0.0.0/8,DIRECT',
    'IP-CIDR,10.1.0.0/16,DIRECT,no-resolve',
  ]);
  assert.deepEqual(noResolveLater.rules, ['IP-CIDR,10.0.0.0/8,DIRECT']);
});

test('pruneRules drops everything after MATCH or FINAL', () => {
  const clash = pruneRules([
    'DOMAIN,a.com,Proxy',
    'MATCH,DIRECT',
    'DOMAIN,b.com,Proxy',
  ]);
  assert.deepEqual(clash.rules, ['DOMAIN,a.com,Proxy', 'MATCH,DIRECT']);
  assert.equal(clash.stats.afterTerminal, 1);

  const surge = pruneRules(['FINAL,DIRECT', 'DOMAIN,b.com,Proxy']);
  assert.deepEqual(surge.rules, ['FINAL,DIRECT']);
  assert.equal(surge.stats.afterTerminal, 1);
});

test('pruneRules dedupes unknown types without building coverage', () => {
  const { rules, stats } = pruneRules([
    'PROCESS-NAME,curl,DIRECT',
    'PROCESS-NAME,curl,Proxy',
    'PROCESS-NAME,curl.exe,DIRECT',
  ]);
  assert.deepEqual(rules, ['PROCESS-NAME,curl,DIRECT', 'PROCESS-NAME,curl.exe,DIRECT']);
  assert.equal(stats.duplicate, 1);
});

// ============================================================
// 生成器集成
// ============================================================

function makeParams(overrides: Partial<ConversionParams> = {}): ConversionParams {
  return { ...DEFAULT_PARAMS, url: '', config: 'https://example.com/config.ini', ...overrides };
}

function makeIni(): ParsedIniConfig {
  return parseIniConfig([
    '[custom]',
    'ruleset=🚀 Proxy,https://example.com/proxy.list',
    'ruleset=🎯 Direct,[]GEOIP,CN',
    'ruleset=🚀 Proxy,[]FINAL',
  ].join('\n'));
}

const RULE_CONTENTS: Record<string, string[]> = {
  'https://example.com/proxy.list': [
    'DOMAIN-SUFFIX,example.com',
    'DOMAIN-SUFFIX,sub.example.com',
    'IP-CIDR,10.0.0.0/8,no-resolve',
    'IP-CIDR,10.1.0.0/16,no-resolve',
    'URL-REGEX,^https?://ads\\.example\\.com/',
  ],
};

function emptySource(): ClashConfig {
  return { proxies: [], rules: [] };
}

test('Clash expand output prunes redundant rules and drops mihomo-unsupported rules', () => {
  const output = generateClashConfig(emptySource(), makeIni(), makeParams(), RULE_CONTENTS);
  assert.ok(output.includes('  - DOMAIN-SUFFIX,example.com,🚀 Proxy'));
  assert.ok(!output.includes('sub.example.com'));
  assert.ok(output.includes('  - IP-CIDR,10.0.0.0/8,🚀 Proxy,no-resolve'));
  assert.ok(!output.includes('10.1.0.0/16'));
  assert.equal((output.match(/^ {2}- URL-REGEX/gm) || []).length, 0);
  assert.ok(output.includes('  # 已跳过 1 条 Clash/Mihomo 不支持的规则（URL-REGEX×1）'));
  assert.ok(output.includes('  - GEOIP,CN,🎯 Direct'));
  assert.ok(output.includes('  - MATCH,🚀 Proxy'));
});

test('Clash output rewrites FINAL to MATCH and drops unsupported rule types', () => {
  const source: ClashConfig = {
    proxies: [{ name: 'n1', type: 'ss', server: 'example.com', port: 443, cipher: 'aes-128-gcm', password: 'pw' }],
    rules: [
      'URL-REGEX,(Subject|HELO|SMTP),🎯 Direct',
      'USER-AGENT,curl,🎯 Direct',
      'IPSET,test,🎯 Direct',
      'SCRIPT,test,🎯 Direct',
      'DOMAIN,a.example.com,🎯 Direct',
      'FINAL,🚀 Proxy',
    ],
  };
  const output = generateClashConfig(source, parseIniConfig('[custom]'), makeParams({ dedup: false }), {});
  assert.ok(output.includes('  - DOMAIN,a.example.com,🎯 Direct'));
  assert.ok(output.includes('  - MATCH,🚀 Proxy'));
  assert.equal((output.match(/^ {2}- (URL-REGEX|USER-AGENT|IPSET|SCRIPT)/gm) || []).length, 0);
  assert.ok(output.includes('# 已跳过 4 条 Clash/Mihomo 不支持的规则'));
});

test('Clash output preserves nested transport options', () => {
  const source: ClashConfig = {
    proxies: [{
      name: 'WS Node', type: 'vmess', server: 'example.com', port: 443,
      uuid: '11111111-1111-1111-1111-111111111111', network: 'ws',
      'ws-opts': { path: '/path', headers: { Host: 'example.com' } },
      alpn: ['h2'],
    }],
    rules: [],
  };
  const output = generateClashConfig(source, parseIniConfig('[custom]'), makeParams(), {});
  assert.ok(output.includes('ws-opts: {"path":"/path","headers":{"Host":"example.com"}}'));
  assert.ok(output.includes('alpn: ["h2"]'));
  assert.ok(!output.includes('ws-opts: undefined'));
});

test('Clash expand output keeps every rule when dedup is disabled', () => {
  const output = generateClashConfig(emptySource(), makeIni(), makeParams({ dedup: false }), RULE_CONTENTS);
  assert.ok(output.includes('  - DOMAIN-SUFFIX,sub.example.com,🚀 Proxy'));
  assert.ok(output.includes('  - IP-CIDR,10.1.0.0/16,🚀 Proxy,no-resolve'));
});

test('Clash provider mode dedupes providers, infers behavior and truncates after FINAL', () => {
  const ini = parseIniConfig([
    '[custom]',
    'ruleset=🎯 Direct,https://example.com/domains.list',
    'ruleset=🎯 Direct,https://example.com/ips.list',
    'ruleset=🎯 Direct,https://example.com/domains.list',
    'ruleset=🚀 Proxy,[]FINAL',
    'ruleset=🚀 Proxy,https://example.com/dead.list',
  ].join('\n'));
  const contents: Record<string, string[]> = {
    'https://example.com/domains.list': ['example.com', '*.example.org'],
    'https://example.com/ips.list': ['10.0.0.0/8', '2001:db8::/32'],
    'https://example.com/dead.list': ['DOMAIN-SUFFIX,dead.com'],
  };

  const output = generateClashConfig(emptySource(), ini, makeParams({ expand: false }), contents);
  assert.equal((output.match(/^ {2}Direct:/gm) || []).length, 1);
  assert.equal((output.match(/^ {2}Direct-2:/gm) || []).length, 1);
  assert.ok(output.includes('behavior: domain'));
  assert.ok(output.includes('behavior: ipcidr'));
  assert.equal((output.match(/RULE-SET,Direct,/g) || []).length, 1);
  assert.equal((output.match(/RULE-SET,Direct-2,/g) || []).length, 1);
  assert.ok(!output.includes('dead.list'));
  assert.ok(output.includes('  - MATCH,🚀 Proxy'));
});

test('Surge output prunes rules, keeps no-resolve and passes URL-REGEX through', () => {
  const output = generateSurgeConfig(emptySource(), makeIni(), makeParams({ target: 'surge' }), RULE_CONTENTS);
  assert.ok(output.includes('DOMAIN-SUFFIX,example.com,🚀 Proxy'));
  assert.ok(!output.includes('sub.example.com'));
  assert.ok(output.includes('IP-CIDR,10.0.0.0/8,🚀 Proxy,no-resolve'));
  assert.ok(!output.includes('10.1.0.0/16'));
  // Surge 原生支持 URL-REGEX（mihomo 不支持），因此仅在 Surge 目标保留
  assert.ok(output.includes('URL-REGEX,^https?://ads\\.example\\.com/,🚀 Proxy'));
  assert.ok(output.includes('GEOIP,CN,🎯 Direct'));
  assert.ok(output.includes('FINAL,🚀 Proxy'));
  // 引用的策略组必须存在，否则 Surge 判定整份配置错误
  assert.ok(output.includes('🚀 Proxy = select,'));
  assert.ok(output.includes('🎯 Direct = select,'));
});

// ============================================================
// sing-box：路由与 DNS（内核语义回归）
// ============================================================

interface SingboxConfig {
  dns?: Record<string, unknown>;
  inbounds?: Record<string, unknown>[];
  outbounds?: Record<string, unknown>[];
  route?: Record<string, unknown>;
  http_clients?: Record<string, unknown>[];
}

function buildSingbox(source: ClashConfig, ini = parseIniConfig('[custom]'), params = makeParams({ target: 'singbox' }), contents: Record<string, string[]> = {}): SingboxConfig {
  return JSON.parse(generateSingboxConfig(source, ini, params, contents)) as SingboxConfig;
}

test('sing-box output prunes rules and drops URL-REGEX', () => {
  const config = buildSingbox(emptySource(), makeIni(), makeParams({ target: 'singbox' }), RULE_CONTENTS);
  const rules = (config.route?.rules ?? []) as Record<string, unknown>[];
  assert.deepEqual(rules[0], { domain_suffix: ['example.com'], action: 'route', outbound: '🚀 Proxy' });
  assert.equal(rules.some(rule => JSON.stringify(rule).includes('sub.example.com')), false);
  assert.equal(rules.some(rule => JSON.stringify(rule).includes('10.1.0.0/16')), false);
  assert.equal(rules.some(rule => 'domain_regex' in rule), false);
  // MATCH 转成 route.final，不再是 rules 里的空对象
  assert.equal(config.route?.final, '🚀 Proxy');
  assert.equal(rules.some(rule => Object.keys(rule).length === 0), false);
});

test('sing-box 的 GEOIP 规则改写为 rule_set（1.12 起内置 geoip 已移除）', () => {
  const source: ClashConfig = {
    proxies: [{ name: 'n1', type: 'ss', server: 'a.example.com', port: 443, cipher: 'aes-128-gcm', password: 'pw' }],
    rules: ['GEOIP,CN,DIRECT', 'GEOIP,LAN,DIRECT', 'GEOSITE,openai,REJECT', 'MATCH,DIRECT'],
  };
  const config = buildSingbox(source, parseIniConfig('[custom]'), makeParams({ target: 'singbox' }), {});
  const rules = (config.route?.rules ?? []) as Record<string, unknown>[];

  // GEOIP,CN → rule_set geoip-cn
  const cn = rules.find(rule => JSON.stringify(rule).includes('geoip-cn'));
  assert.ok(cn, 'GEOIP,CN 应改写为 rule_set');
  assert.deepEqual(cn?.rule_set, ['geoip-cn']);
  assert.equal('geoip' in (cn ?? {}), false);

  // GEOIP,LAN → 内置 ip_is_private，不需要下载规则集
  const lan = rules.find(rule => rule.ip_is_private === true);
  assert.ok(lan, 'GEOIP,LAN 应映射为 ip_is_private');
  assert.equal(JSON.stringify(lan).includes('geoip-lan'), false);

  // GEOSITE → geosite rule_set
  assert.deepEqual(rules.find(rule => JSON.stringify(rule).includes('geosite-openai'))?.rule_set, ['geosite-openai']);

  // rule_set 声明与 http_clients 必须存在
  const declared = (config.route?.rule_set ?? []) as Record<string, unknown>[];
  assert.deepEqual(declared.map(item => item.tag).sort(), ['geoip-cn', 'geosite-openai']);
  for (const item of declared) {
    assert.equal(item.type, 'remote');
    assert.equal(item.format, 'binary');
    assert.ok(String(item.url).startsWith('https://'));
    assert.equal(item.http_client, 'rule-set-download');
  }
  assert.deepEqual(config.http_clients, [{ tag: 'rule-set-download' }]);
});

test('sing-box 的路由兜底与引用一致性', () => {
  const source: ClashConfig = {
    proxies: [
      { name: 'n1', type: 'ss', server: 'a.example.com', port: 443, cipher: 'aes-128-gcm', password: 'pw' },
      { name: 'n2', type: 'trojan', server: 'b.example.com', port: 443, password: 'pw' },
    ],
    'proxy-groups': [{ name: 'G', type: 'select', proxies: ['n1', 'n2'] }],
    rules: ['DOMAIN-SUFFIX,a.com,G', 'DOMAIN-SUFFIX,b.com,不存在的组', 'MATCH,G'],
  };
  const config = buildSingbox(source, parseIniConfig('[custom]'), makeParams({ target: 'singbox' }), {});
  const tags = new Set((config.outbounds ?? []).map(item => String(item.tag)));
  const rules = (config.route?.rules ?? []) as Record<string, unknown>[];

  // 每个规则目标都必须是真实存在的 outbound
  for (const rule of rules) {
    assert.ok(tags.has(String(rule.outbound)), `规则目标 ${String(rule.outbound)} 不存在`);
  }
  // 缺失的策略组被自动合成
  assert.ok(tags.has('不存在的组'));
  const synthetic = (config.outbounds ?? []).find(item => item.tag === '不存在的组') as Record<string, unknown>;
  assert.equal(synthetic.type, 'selector');
  assert.deepEqual(synthetic.outbounds, ['n1', 'n2']);

  // route.final 必须存在且指向真实出站
  assert.equal(config.route?.final, 'G');
  assert.ok(tags.has('G'));
});

test('sing-box 的策略组始终生成，成员与规则引用全部有效', () => {
  const source: ClashConfig = {
    proxies: [{ name: 'n1', type: 'ss', server: 'a.example.com', port: 443, cipher: 'aes-128-gcm', password: 'pw' }],
    'proxy-groups': [
      { name: 'AUTO', type: 'url-test', url: 'http://x/generate_204', interval: 600, proxies: ['n1'] },
      { name: 'SEL', type: 'select', proxies: ['AUTO', 'n1', 'DIRECT'] },
    ],
    rules: ['MATCH,SEL'],
  };
  const config = buildSingbox(source, parseIniConfig('[custom]'), makeParams({ target: 'singbox' }), {});
  const outbounds = config.outbounds ?? [];
  const tags = new Set(outbounds.map(item => String(item.tag)));
  const auto = outbounds.find(item => item.tag === 'AUTO') as Record<string, unknown>;
  const sel = outbounds.find(item => item.tag === 'SEL') as Record<string, unknown>;

  assert.equal(auto.type, 'urltest');
  assert.equal(sel.type, 'selector');
  // 实测约束：interval 必须 <= idle_timeout
  assert.equal(auto.interval, '180s');
  assert.equal(auto.idle_timeout, '30m');
  for (const outbound of outbounds) {
    for (const member of (outbound.outbounds as string[] | undefined) ?? []) {
      assert.ok(tags.has(member), `成员 ${member} 不存在`);
    }
  }
});

test('sing-box 的 DNS 段使用 1.14 新格式，且不残留 Clash 字段', () => {
  const source: ClashConfig = {
    proxies: [{ name: 'n1', type: 'ss', server: 'a.example.com', port: 443, cipher: 'aes-128-gcm', password: 'pw' }],
    rules: [],
    dns: {
      enable: true,
      'enhanced-mode': 'fake-ip',
      'fake-ip-range': '198.18.0.1/16',
      'fake-ip-filter': ['*.lan', 'time.example.com'],
      'default-nameserver': ['223.5.5.5'],
      nameserver: ['https://doh.pub/dns-query', 'tls://dns.google'],
      fallback: ['https://1.1.1.1/dns-query'],
      'use-hosts': true,
      'cache-size': 4096,
    },
  };
  const config = buildSingbox(source, parseIniConfig('[custom]'), makeParams({ target: 'singbox' }), {});
  const dns = config.dns ?? {};
  const text = JSON.stringify(dns);

  // Clash 专有字段一律不得出现
  for (const banned of ['"enable"', 'enhanced-mode', 'fake-ip-range', 'fake-ip-filter', 'nameserver', 'use-hosts']) {
    assert.equal(text.includes(banned), false, `DNS 段不应包含 ${banned}`);
  }

  const servers = (dns.servers ?? []) as Record<string, unknown>[];
  // 每个服务端都必须是新格式：有 type，且不使用旧的 address 字段
  for (const server of servers) {
    assert.ok(typeof server.type === 'string', 'DNS 服务端缺少 type');
    assert.equal('address' in server, false, 'DNS 服务端不应使用旧的 address 字段');
  }
  // DoH 必须带 path，且声明 domain_resolver
  const doh = servers.find(server => server.type === 'https');
  assert.ok(doh);
  assert.equal(doh.path, '/dns-query');
  assert.ok(doh.domain_resolver, 'DoH 服务端需要 domain_resolver 才能解析自身域名');
  // fake-ip 必须是独立服务端
  assert.ok(servers.some(server => server.type === 'fakeip'));
  assert.equal('fakeip' in dns, false, '1.14 已移除顶层 dns.fakeip');
  // A/AAAA 才走 fakeip
  const rules = (dns.rules ?? []) as Record<string, unknown>[];
  const fakeRule = rules.find(rule => rule.server === 'fakeip');
  assert.deepEqual(fakeRule?.query_type, ['A', 'AAAA']);
  // 响应匹配类字段不能出现在 DNS 规则里（1.14 需要前置 evaluate）
  assert.equal(rules.some(rule => 'ip_is_private' in rule || 'ip_cidr' in rule), false);
});

test('sing-box 节点逐协议字段保真', () => {
  const nodes = [
    { name: 'ss1', type: 'ss', server: 'a.example.com', port: 443, cipher: 'aes-256-gcm', password: 'pw',
      plugin: 'obfs', 'plugin-opts': { mode: 'tls', host: 'bing.com' } },
    { name: 'vm1', type: 'vmess', server: 'b.example.com', port: 443, uuid: '11111111-1111-1111-1111-111111111111',
      alterId: 4, cipher: 'auto', network: 'ws', tls: true, servername: 'cdn.example.com',
      'ws-opts': { path: '/ws', headers: { Host: 'cdn.example.com' } }, 'client-fingerprint': 'chrome' },
    { name: 'vl1', type: 'vless', server: 'c.example.com', port: 443, uuid: '22222222-2222-2222-2222-222222222222',
      network: 'grpc', tls: true, flow: 'xtls-rprx-vision', servername: 'www.microsoft.com',
      'grpc-opts': { 'grpc-service-name': 'svc' },
      'reality-opts': { 'public-key': 'PUBKEY', 'short-id': 'abcd' } },
    { name: 'hy1', type: 'hysteria2', server: 'd.example.com', port: 443, password: 'pw',
      up: '100 Mbps', down: '1 Gbps', sni: 'd.example.com', 'skip-cert-verify': true, alpn: ['h3'] },
    { name: 'tu1', type: 'tuic', server: 'e.example.com', port: 443, uuid: '33333333-3333-3333-3333-333333333333',
      password: 'pw', 'congestion-controller': 'bbr', 'udp-relay-mode': 'native', sni: 'e.example.com' },
    { name: 'sn1', type: 'snell', server: 'f.example.com', port: 443, psk: 'psk-value', version: 3 },
    { name: 'so1', type: 'socks5', server: 'g.example.com', port: 1080, username: 'u', password: 'p' },
    { name: 'ht1', type: 'http', server: 'h.example.com', port: 8080, username: 'u', password: 'p' },
    { name: 'at1', type: 'anytls', server: 'i.example.com', port: 443, password: 'pw', sni: 'i.example.com',
      alpn: ['h2'], 'skip-cert-verify': true },
  ];
  const source: ClashConfig = { proxies: nodes as never, rules: [] };
  const config = buildSingbox(source, parseIniConfig('[custom]'), makeParams({ target: 'singbox' }), {});
  const byTag = new Map((config.outbounds ?? []).map(item => [String(item.tag), item]));

  // ss：plugin 必须转成 sing-box 的 plugin/plugin_opts
  const ss = byTag.get('ss1') as Record<string, unknown>;
  assert.equal(ss.type, 'shadowsocks');
  assert.equal(ss.method, 'aes-256-gcm');
  assert.equal(ss.plugin, 'obfs-local');
  assert.equal(ss.plugin_opts, 'obfs=tls;obfs-host=bing.com');

  // vmess：alter_id / transport / tls / utls 全部保留
  const vm = byTag.get('vm1') as Record<string, unknown>;
  assert.equal(vm.alter_id, 4);
  assert.deepEqual(vm.transport, { type: 'ws', path: '/ws', headers: { Host: 'cdn.example.com' } });
  const vmTls = vm.tls as Record<string, unknown>;
  assert.equal(vmTls.enabled, true);
  assert.equal(vmTls.server_name, 'cdn.example.com');
  assert.deepEqual(vmTls.utls, { enabled: true, fingerprint: 'chrome' });

  // vless：flow / grpc / reality 全部保留
  const vl = byTag.get('vl1') as Record<string, unknown>;
  assert.equal(vl.flow, 'xtls-rprx-vision');
  assert.deepEqual(vl.transport, { type: 'grpc', service_name: 'svc' });
  const vlTls = vl.tls as Record<string, unknown>;
  assert.deepEqual(vlTls.reality, { enabled: true, public_key: 'PUBKEY', short_id: 'abcd' });
  assert.equal(vlTls.server_name, 'www.microsoft.com');

  // hysteria2：带宽单位换算 + TLS
  const hy = byTag.get('hy1') as Record<string, unknown>;
  assert.equal(hy.up_mbps, 100);
  assert.equal(hy.down_mbps, 1024);
  assert.equal((hy.tls as Record<string, unknown>).enabled, true);
  assert.equal((hy.tls as Record<string, unknown>).insecure, true);
  assert.deepEqual((hy.tls as Record<string, unknown>).alpn, ['h3']);

  // tuic：拥塞控制与中继模式
  const tu = byTag.get('tu1') as Record<string, unknown>;
  assert.equal(tu.congestion_control, 'bbr');
  assert.equal(tu.udp_relay_mode, 'native');
  assert.equal((tu.tls as Record<string, unknown>).enabled, true);

  // snell：必须是 v4，且不得带 obfs（内核无此字段）
  const sn = byTag.get('sn1') as Record<string, unknown>;
  assert.equal(sn.version, 4);
  assert.equal(sn.psk, 'psk-value');
  assert.equal('obfs' in sn, false);

  // socks：必须带 version
  const so = byTag.get('so1') as Record<string, unknown>;
  assert.equal(so.type, 'socks');
  assert.equal(so.version, '5');
  assert.equal(so.username, 'u');

  // http：认证信息保留
  const ht = byTag.get('ht1') as Record<string, unknown>;
  assert.equal(ht.type, 'http');
  assert.equal(ht.username, 'u');
  assert.equal(ht.password, 'p');

  // anytls：TLS 必需
  const at = byTag.get('at1') as Record<string, unknown>;
  assert.equal(at.type, 'anytls');
  assert.equal(at.password, 'pw');
  assert.equal((at.tls as Record<string, unknown>).enabled, true);
});

test('sing-box 丢弃内核已移除的节点类型（ssr）', () => {
  const source: ClashConfig = {
    proxies: [
      { name: 'ssr1', type: 'ssr', server: 'a.example.com', port: 443, cipher: 'aes-256-cfb', password: 'pw' },
      { name: 'ss1', type: 'ss', server: 'b.example.com', port: 443, cipher: 'aes-128-gcm', password: 'pw' },
    ],
    rules: ['MATCH,ss1'],
  };
  const config = buildSingbox(source, parseIniConfig('[custom]'), makeParams({ target: 'singbox' }), {});
  const tags = (config.outbounds ?? []).map(item => String(item.tag));
  assert.equal(tags.includes('ssr1'), false);
  assert.ok(tags.includes('ss1'));
});

test('sing-box 默认输出 TUN 入站（移动端必需）', () => {
  const source: ClashConfig = {
    proxies: [{ name: 'n1', type: 'ss', server: 'a.example.com', port: 443, cipher: 'aes-128-gcm', password: 'pw' }],
    rules: [],
  };
  const config = buildSingbox(source, parseIniConfig('[custom]'), makeParams({ target: 'singbox' }), {});
  const inbounds = (config.inbounds ?? []) as Record<string, unknown>[];
  const tun = inbounds.find(item => item.type === 'tun');

  // 没有 TUN 入站时，Android 不会启动系统 VPN、iOS 建立会话会失败
  assert.ok(tun, '默认必须包含 tun 入站');
  assert.equal(tun.tag, 'tun-in');
  assert.equal(tun.auto_route, true);
  assert.deepEqual(tun.address, ['172.19.0.1/30']);
  assert.equal(tun.stack, 'mixed');

  // 以下字段在 Apple 平台被官方标记为「未实现」，会让 iOS 无法启动服务，
  // 因此不得出现在默认产物里
  for (const field of ['mtu', 'strict_route', 'gso', 'interface_name']) {
    assert.equal(field in tun, false, `${field} 在 Apple 平台未实现或由系统管理，不应默认输出`);
  }
  // 旧写法与放错位置的字段
  assert.equal('inet4_address' in tun, false, '旧写法已被内核移除');
  assert.equal('auto_detect_interface' in tun, false, 'auto_detect_interface 只能放在 route 下');
  assert.equal('auto_redirect' in tun, false, 'auto_redirect 不是跨平台字段');
  // 平台专属的包名/UID 过滤也不能默认输出
  for (const field of ['include_package', 'exclude_package', 'include_uid', 'exclude_uid',
    'include_interface', 'exclude_interface']) {
    assert.equal(field in tun, false, `${field} 是平台专属字段`);
  }
});

test('sing-box tun_mtu 参数可显式指定 MTU', () => {
  const source: ClashConfig = {
    proxies: [{ name: 'n1', type: 'ss', server: 'a.example.com', port: 443, cipher: 'aes-128-gcm', password: 'pw' }],
    rules: [],
  };
  const config = buildSingbox(source, parseIniConfig('[custom]'),
    makeParams({ target: 'singbox', tun_mtu: 1400 }), {});
  const tun = ((config.inbounds ?? []) as Record<string, unknown>[]).find(item => item.type === 'tun');
  assert.equal(tun?.mtu, 1400);

  // 非法值应被忽略
  for (const bad of [0, -1, Number.NaN]) {
    const cfg = buildSingbox(source, parseIniConfig('[custom]'),
      makeParams({ target: 'singbox', tun_mtu: bad }), {});
    const item = ((cfg.inbounds ?? []) as Record<string, unknown>[]).find(entry => entry.type === 'tun');
    assert.equal('mtu' in (item ?? {}), false, `tun_mtu=${bad} 应被忽略`);
  }
});

test('sing-box 入站：源订阅有端口时额外输出 mixed，无端口时只输出 TUN', () => {
  const base: ClashConfig = {
    proxies: [{ name: 'n1', type: 'ss', server: 'a.example.com', port: 443, cipher: 'aes-128-gcm', password: 'pw' }],
    rules: [],
  };

  const withPort = buildSingbox({ ...base, 'mixed-port': 7890, 'allow-lan': false } as ClashConfig,
    parseIniConfig('[custom]'), makeParams({ target: 'singbox' }), {});
  const mixed = ((withPort.inbounds ?? []) as Record<string, unknown>[]).find(item => item.type === 'mixed');
  assert.ok(mixed, '声明了端口时应输出 mixed 入站');
  assert.equal(mixed.listen_port, 7890);
  assert.equal(mixed.listen, '127.0.0.1');

  const noPort = buildSingbox(base, parseIniConfig('[custom]'), makeParams({ target: 'singbox' }), {});
  const inbounds = (noPort.inbounds ?? []) as Record<string, unknown>[];
  assert.equal(inbounds.some(item => item.type === 'mixed'), false,
    '源订阅没有声明端口时不应凭空造一个 localhost 代理端口');
  assert.equal(inbounds.filter(item => item.type === 'tun').length, 1);
});

test('sing-box tun=0 关闭 TUN，产物退化为本机代理', () => {
  const source: ClashConfig = {
    proxies: [{ name: 'n1', type: 'ss', server: 'a.example.com', port: 443, cipher: 'aes-128-gcm', password: 'pw' }],
    rules: [],
    'mixed-port': 7890,
  };
  const config = buildSingbox(source, parseIniConfig('[custom]'), makeParams({ target: 'singbox', tun: false }), {});
  const inbounds = (config.inbounds ?? []) as Record<string, unknown>[];
  assert.equal(inbounds.some(item => item.type === 'tun'), false);
  assert.equal(inbounds.length, 1);
  assert.equal(inbounds[0].type, 'mixed');

  // tun=0 且无端口时仍要给出一个可用入站，避免产物无法使用
  const bare = buildSingbox({ ...source, 'mixed-port': undefined } as ClashConfig,
    parseIniConfig('[custom]'), makeParams({ target: 'singbox', tun: false }), {});
  assert.equal(((bare.inbounds ?? []) as Record<string, unknown>[]).length, 1);
});

test('sing-box 入站的 allow-lan 语义沿用源配置', () => {
  const source: ClashConfig = {
    proxies: [{ name: 'n1', type: 'ss', server: 'a.example.com', port: 443, cipher: 'aes-128-gcm', password: 'pw' }],
    rules: [],
    'mixed-port': 7890,
  };
  const lan = buildSingbox({ ...source, 'allow-lan': true, 'bind-address': '*' } as ClashConfig,
    parseIniConfig('[custom]'), makeParams({ target: 'singbox' }), {});
  const mixed = ((lan.inbounds ?? []) as Record<string, unknown>[]).find(item => item.type === 'mixed');
  assert.equal(mixed?.listen, '0.0.0.0');
});

// ============================================================
// sing-box：DNS / 规则工具函数
// ============================================================

test('parseDnsServerAddress 覆盖 Clash 常见 DNS 写法', () => {
  assert.deepEqual(parseDnsServerAddress('223.5.5.5'), { type: 'udp', server: '223.5.5.5' });
  assert.deepEqual(parseDnsServerAddress('https://doh.pub/dns-query'),
    { type: 'https', server: 'doh.pub', path: '/dns-query' });
  assert.deepEqual(parseDnsServerAddress('https://dns.google'),
    { type: 'https', server: 'dns.google', path: '/dns-query' });
  assert.deepEqual(parseDnsServerAddress('tls://dns.google'), { type: 'tls', server: 'dns.google' });
  assert.deepEqual(parseDnsServerAddress('https://1.1.1.1:8443/dns-query'),
    { type: 'https', server: '1.1.1.1', server_port: 8443, path: '/dns-query' });
  assert.deepEqual(parseDnsServerAddress('local'), { type: 'local' });
  assert.deepEqual(parseDnsServerAddress('fakeip'), { type: 'fakeip' });
  assert.deepEqual(parseDnsServerAddress('dhcp://auto'), { type: 'dhcp' });
  // 裸域名在 sing-box 中无效
  assert.equal(parseDnsServerAddress('dns.google'), null);
  assert.equal(parseDnsServerAddress(''), null);
});

test('normalizeFakeIpRange 把单地址写成网段', () => {
  assert.equal(normalizeFakeIpRange('198.18.0.1/16'), '198.18.0.0/16');
  assert.equal(normalizeFakeIpRange('198.18.0.0/15'), '198.18.0.0/15');
  assert.equal(normalizeFakeIpRange('10.1.2.3/8'), '10.0.0.0/8');
  assert.equal(normalizeFakeIpRange('198.18.0.0/32'), '198.18.0.0/32');
  assert.equal(normalizeFakeIpRange('not-a-range'), 'not-a-range');
});

test('convertClashDnsToSingbox 在源无 DNS 时不输出 DNS 段', () => {
  const result = convertClashDnsToSingbox(undefined);
  assert.equal(result.dns, null);
  assert.deepEqual(result.bootstrapTags, []);
});

test('convertClashDnsToSingbox 把 nameserver-policy 转成 DNS 规则', () => {
  const result = convertClashDnsToSingbox({
    nameserver: ['223.5.5.5'],
    'nameserver-policy': { '+.example.com': 'https://doh.example.com/dns-query' },
  });
  const rules = (result.dns?.rules ?? []) as Record<string, unknown>[];
  const policy = rules.find(rule => JSON.stringify(rule).includes('example.com'));
  assert.ok(policy);
  assert.deepEqual(policy?.domain_suffix, ['example.com']);
  assert.equal(policy?.action, 'route');
  const servers = (result.dns?.servers ?? []) as Record<string, unknown>[];
  assert.ok(servers.some(server => server.type === 'https' && server.server === 'doh.example.com'));
});

test('parseRuleForSingbox 与 parseClashRule 语义一致', () => {
  for (const rule of [
    'DOMAIN-SUFFIX,example.com,Proxy',
    'IP-CIDR,10.0.0.0/8,Proxy,no-resolve',
    'DOMAIN,example.com',
    'MATCH,DIRECT',
    'FINAL,Proxy',
    'GEOIP,CN,DIRECT',
  ]) {
    const a = parseClashRule(rule);
    const b = parseRuleForSingbox(rule);
    assert.ok(a && b, rule);
    assert.equal(a.type, b.type, rule);
    assert.equal(a.value, b.value, rule);
    assert.equal(a.target, b.target, rule);
    assert.equal(a.noResolve, b.noResolve, rule);
  }
});

test('buildRuleSetDefinition 生成可用的远程规则集定义', () => {
  const geoip = buildRuleSetDefinition('geoip-cn');
  assert.equal(geoip?.type, 'remote');
  assert.equal(geoip?.format, 'binary');
  assert.equal(geoip?.url, 'https://cdn.jsdelivr.net/gh/SagerNet/sing-geoip@rule-set/geoip-cn.srs');
  const geosite = buildRuleSetDefinition('geosite-openai');
  assert.equal(geosite?.url, 'https://cdn.jsdelivr.net/gh/SagerNet/sing-geosite@rule-set/geosite-openai.srs');
  assert.equal(buildRuleSetDefinition('unknown-tag'), null);
});

test('convertClashRuleProviders 转换远程 provider 并跳过本地文件型', () => {
  const plan = convertClashRuleProviders({
    'remote-one': { type: 'http', behavior: 'classical', url: 'https://example.com/a.list', interval: 3600 },
    'local-one': { type: 'file', behavior: 'domain', path: './local.list' },
  });
  assert.equal(plan.ruleSets.length, 1);
  assert.equal(plan.ruleSets[0].tag, 'remote-one');
  assert.equal(plan.ruleSets[0].update_interval, '3600s');
  assert.equal(plan.ruleSets[0].http_client, 'rule-set-download');
  assert.deepEqual(plan.skipped, ['local-one']);
  assert.equal(plan.tags.get('remote-one'), 'remote-one');
});

test('sanitizeRuleSetTag 清理非法字符', () => {
  assert.equal(sanitizeRuleSetTag('my provider/1'), 'my-provider-1');
  assert.equal(sanitizeRuleSetTag('中文名字'), '中文名字');
  assert.equal(sanitizeRuleSetTag('***'), 'rule-set');
});

test('clampInterval 满足内核 interval <= idle_timeout 约束', () => {
  assert.equal(clampInterval(undefined), 180);
  assert.equal(clampInterval(0), 180);
  assert.equal(clampInterval(-5), 180);
  assert.equal(clampInterval(60), 60);
  assert.equal(clampInterval(600), 180);
});

test('parseBandwidth 统一带宽单位', () => {
  assert.equal(parseBandwidth(100), 100);
  assert.equal(parseBandwidth('100'), 100);
  assert.equal(parseBandwidth('100 Mbps'), 100);
  assert.equal(parseBandwidth('1 Gbps'), 1024);
  assert.equal(parseBandwidth('512 Kbps'), 1);
  assert.equal(parseBandwidth('0'), undefined);
  assert.equal(parseBandwidth('abc'), undefined);
  assert.equal(parseBandwidth(undefined), undefined);
});

test('convertNodeToSingboxOutbound 对未知类型返回 null', () => {
  assert.equal(convertNodeToSingboxOutbound({ name: 'x', type: 'unknown-proto', server: 'a.example.com', port: 1 }), null);
  assert.equal(convertNodeToSingboxOutbound({ name: 'x', type: 'ssr', server: 'a.example.com', port: 1 }), null);
  const ok = convertNodeToSingboxOutbound({ name: 'x', type: 'ss', server: 'a.example.com', port: 443, cipher: 'aes-128-gcm', password: 'pw' });
  assert.equal(ok?.type, 'shadowsocks');
  assert.equal(ok?.tag, 'x');
});

test('sing-box output maps anytls nodes with password and tls fields', () => {
  const source: ClashConfig = {
    proxies: [{
      name: 'AnyTLS', type: 'anytls', server: 'example.com', port: 443,
      password: 'pw', sni: 'x.example.com', alpn: ['h2'], 'skip-cert-verify': true,
    }],
    rules: [],
  };
  const config = buildSingbox(source, parseIniConfig('[custom]'), makeParams({ target: 'singbox' }), {});
  const outbound = (config.outbounds ?? []).find(item => item.tag === 'AnyTLS') as Record<string, unknown>;
  assert.ok(outbound);
  assert.equal(outbound.type, 'anytls');
  assert.equal(outbound.password, 'pw');
  assert.deepEqual(outbound.tls, {
    enabled: true,
    insecure: true,
    server_name: 'x.example.com',
    alpn: ['h2'],
  });
});

test('Surge 输出各协议节点（含官方语法要求的位置参数）', () => {
  const source: ClashConfig = {
    proxies: [
      { name: 'SS', type: 'ss', server: 'a.example.com', port: 443, cipher: 'aes-128-gcm', password: 'pw',
        plugin: 'obfs', 'plugin-opts': { mode: 'tls', host: 'bing.com' }, udp: true },
      { name: 'VM', type: 'vmess', server: 'b.example.com', port: 443, uuid: 'uuid-1', tls: true,
        servername: 'cdn.example.com', network: 'ws', 'ws-opts': { path: '/ws', headers: { Host: 'cdn.example.com' } } },
      { name: 'TR', type: 'trojan', server: 'c.example.com', port: 443, password: 'pw', sni: 'c.example.com' },
      { name: 'HY', type: 'hysteria2', server: 'd.example.com', port: 443, password: 'pw', down: '1 Gbps', sni: 'd.example.com' },
      { name: 'TU', type: 'tuic', server: 'e.example.com', port: 443, uuid: 'uuid-2', password: 'pw', alpn: ['h3'] },
      { name: 'SN', type: 'snell', server: 'f.example.com', port: 443, psk: 'psk-1', version: 3,
        'obfs-opts': { mode: 'tls', host: 'bing.com' } },
      { name: 'AT', type: 'anytls', server: 'g.example.com', port: 443, password: 'pw', sni: 'g.example.com', alpn: ['h2'], udp: true },
      { name: 'HT', type: 'http', server: 'h.example.com', port: 8080, username: 'user1', password: 'pass1' },
      { name: 'SO', type: 'socks5', server: 'i.example.com', port: 1080, username: 'user2', password: 'pass2' },
    ],
    rules: [],
  };
  const output = generateSurgeConfig(source, parseIniConfig('[custom]'), makeParams({ target: 'surge' }), {});
  const line = (name: string) => output.split('\n').find(row => row.startsWith(`${name} = `)) || '';

  // ss：encrypt-method + password，obfs 拆成两个参数
  assert.ok(line('SS').includes('encrypt-method=aes-128-gcm'));
  assert.ok(line('SS').includes('password=pw'));
  assert.ok(line('SS').includes('obfs=tls'));
  assert.ok(line('SS').includes('obfs-host=bing.com'));
  assert.ok(line('SS').includes('udp-relay=true'));

  // vmess：username=uuid + ws 参数 + tls
  assert.ok(line('VM').includes('username=uuid-1'));
  assert.ok(line('VM').includes('ws=true'));
  assert.ok(line('VM').includes('ws-path=/ws'));
  assert.ok(line('VM').includes('ws-headers=Host:cdn.example.com'));
  assert.ok(line('VM').includes('tls=true'));
  assert.ok(line('VM').includes('sni=cdn.example.com'));
  // 官方：vmess-aead 必须与服务端一致（Clash 的 alterId=0 即 AEAD）
  assert.ok(line('VM').includes('vmess-aead=true'));

  // trojan：password + sni
  assert.ok(line('TR').includes('password=pw'));
  assert.ok(line('TR').includes('sni=c.example.com'));

  // hysteria2：password + download-bandwidth（1 Gbps → 1024）
  assert.ok(line('HY').includes('download-bandwidth=1024'));

  // tuic：官方语法要求 uuid + password，且类型名是 tuic-v5
  assert.ok(line('TU').startsWith('TU = tuic-v5,'));
  assert.ok(line('TU').includes('uuid=uuid-2'));
  assert.ok(line('TU').includes('password=pw'));
  assert.ok(line('TU').includes('alpn=h3'));

  // snell：psk + version；夹具里 version=3，官方允许 v1-3 使用 obfs=tls
  assert.ok(line('SN').includes('psk=psk-1'));
  assert.ok(line('SN').includes('version=3'));
  assert.ok(line('SN').includes('obfs=tls'));
  assert.ok(line('SN').includes('obfs-host=bing.com'));

  // anytls：password，且不得带 udp-relay
  assert.ok(line('AT').startsWith('AT = anytls,'));
  assert.ok(line('AT').includes('password=pw'));
  assert.equal(line('AT').includes('udp-relay'), false);

  // http / socks5：用户名密码是位置参数，不能写成 username=
  assert.ok(line('HT').includes('h.example.com, 8080, user1, pass1'));
  assert.equal(line('HT').includes('username='), false);
  assert.ok(line('SO').includes('i.example.com, 1080, user2, pass2'));
  assert.equal(line('SO').includes('username='), false);
});

test('Surge 输出不得出现重复参数', () => {
  const source: ClashConfig = {
    proxies: [
      { name: 'AT', type: 'anytls', server: 'a.example.com', port: 443, password: 'pw', sni: 'a.example.com', alpn: ['h2', 'http/1.1'] },
      { name: 'TU', type: 'tuic', server: 'b.example.com', port: 443, uuid: 'u', password: 'pw', alpn: ['h3'] },
    ],
    rules: [],
  };
  const output = generateSurgeConfig(source, parseIniConfig('[custom]'), makeParams({ target: 'surge' }), {});
  for (const row of output.split('\n').filter(line => line.includes(' = '))) {
    const keys = row.split(',').slice(3)
      .map(token => token.split('=')[0].trim())
      .filter(token => token && !token.includes(' '));
    assert.equal(new Set(keys).size, keys.length, `参数重复: ${row.slice(0, 90)}`);
  }
});

test('Surge 跳过真正不支持的节点类型（ssr / vless / hysteria）', () => {
  const source: ClashConfig = {
    proxies: [
      { name: 'SSR', type: 'ssr', server: 'a.example.com', port: 443, cipher: 'aes-256-cfb', password: 'pw' },
      { name: 'VL', type: 'vless', server: 'b.example.com', port: 443, uuid: 'u' },
      { name: 'HY1', type: 'hysteria', server: 'c.example.com', port: 443, password: 'pw' },
      { name: 'SS', type: 'ss', server: 'd.example.com', port: 443, cipher: 'aes-128-gcm', password: 'pw' },
    ],
    rules: [],
  };
  const output = generateSurgeConfig(source, parseIniConfig('[custom]'), makeParams({ target: 'surge' }), {});
  assert.ok(output.includes('# 已跳过 3 个 Surge 不支持的节点'));
  assert.ok(output.includes('ssr×1'));
  assert.ok(output.includes('vless×1'));
  assert.ok(output.includes('hysteria×1'));
  assert.ok(!output.includes('SSR = '));
  assert.ok(output.includes('SS = ss, d.example.com, 443'));
});

test('Surge 策略组与规则引用保持一致（缺失策略组按节点合成）', () => {
  const source: ClashConfig = {
    proxies: [
      { name: 'n1', type: 'ss', server: 'a.example.com', port: 443, cipher: 'aes-128-gcm', password: 'pw' },
      { name: 'n2', type: 'trojan', server: 'b.example.com', port: 443, password: 'pw' },
    ],
    'proxy-groups': [{ name: 'G', type: 'select', proxies: ['n1', 'n2'] }],
    rules: ['DOMAIN-SUFFIX,a.com,G', 'DOMAIN-SUFFIX,b.com,幽灵组', 'MATCH,G'],
  };
  const output = generateSurgeConfig(source, parseIniConfig('[custom]'), makeParams({ target: 'surge' }), {});

  // 幽灵组必须被合成出来，否则该规则会被丢弃
  assert.ok(output.includes('幽灵组 = select, n1, n2'));
  assert.ok(output.includes('DOMAIN-SUFFIX,b.com,幽灵组'));
  assert.ok(output.includes('FINAL,G'));

  // 每个策略组成员都必须是已定义策略
  const proxies = new Set<string>();
  const groups = new Set<string>();
  for (const row of output.split('\n')) {
    const match = row.match(/^([^=\[\]]+?) = (ss|vmess|trojan|tuic-v5|hysteria2|snell|anytls|http|https|socks5|ssh|wireguard|external),/);
    if (match) proxies.add(match[1].trim());
    const group = row.match(/^([^=\[]+?) = (select|url-test|fallback|load-balance),/);
    if (group) groups.add(group[1].trim());
  }
  assert.ok(proxies.size >= 2 && groups.size >= 2);
  for (const row of output.split('\n')) {
    const group = row.match(/^([^=\[]+?) = (select|url-test|fallback|load-balance), (.+)$/);
    if (!group) continue;
    for (const member of group[3].split(',').map(item => item.trim())) {
      if (!member || member.includes('=')) continue;
      assert.ok(proxies.has(member) || groups.has(member) || ['DIRECT', 'REJECT'].includes(member),
        `策略组 ${group[1]} 引用了未定义策略 ${member}`);
    }
  }
});

test('Surge 输出的规则目标必须已定义且存在 FINAL', () => {
  const output = generateSurgeConfig(emptySource(), makeIni(), makeParams({ target: 'surge' }), RULE_CONTENTS);
  const ruleLines = output.split('\n').filter(line => /^[A-Z]/.test(line) && line.includes(','));
  assert.ok(ruleLines.length > 0);
  assert.equal(ruleLines.filter(line => line.startsWith('FINAL,')).length, 1);
  assert.ok(output.includes('FINAL,🚀 Proxy'));
  // 🚀 Proxy 必须真的被定义（缺失时按节点合成）
  assert.ok(output.includes('🚀 Proxy = select,'));
});

// ============================================================
// Clash：过时字段迁移
// ============================================================

test('Clash 把已移除的 global-client-fingerprint 下放到各节点', () => {
  const source: ClashConfig = {
    'global-client-fingerprint': 'chrome',
    proxies: [
      { name: 'a', type: 'ss', server: 'a.example.com', port: 443, cipher: 'aes-128-gcm', password: 'pw' },
      { name: 'b', type: 'trojan', server: 'b.example.com', port: 443, password: 'pw', 'client-fingerprint': 'firefox' },
    ],
    rules: [],
  };
  const output = generateClashConfig(source, parseIniConfig('[custom]'), makeParams(), {});

  // 顶层字段必须消失，否则新版内核直接报 error
  assert.equal(/^global-client-fingerprint:/m.test(output), false);
  // 未指定指纹的节点继承全局值，已指定的保持原样
  const lines = output.split('\n').filter(line => line.startsWith('  - {'));
  assert.ok(lines[0].includes('client-fingerprint: \"chrome\"'));
  assert.ok(lines[1].includes('client-fingerprint: \"firefox\"'));
  assert.ok(!lines[1].includes('chrome'));
});

test('migrateClashDns 把已废弃的 fallback-filter 迁移为 nameserver-policy', () => {
  const migrated = migrateClashDns({
    enable: true,
    nameserver: ['https://doh.pub/dns-query'],
    fallback: ['https://1.1.1.1/dns-query'],
    'fallback-filter': { geosite: 'gfw', geoip: true, ipcidr: ['240.0.0.0/4'] },
  });
  assert.ok(migrated);
  assert.equal('fallback-filter' in migrated, false);
  const policy = migrated['nameserver-policy'] as Record<string, unknown>;
  assert.ok(policy);
  assert.deepEqual(policy['geosite:gfw'], ['https://1.1.1.1/dns-query']);
  assert.deepEqual(policy['240.0.0.0/4'], ['https://1.1.1.1/dns-query']);
  // 其余字段原样保留
  assert.deepEqual(migrated.nameserver, ['https://doh.pub/dns-query']);
});

test('migrateClashDns 对无 fallback-filter 的配置不改动', () => {
  const dns = { enable: true, nameserver: ['223.5.5.5'] };
  assert.deepEqual(migrateClashDns(dns), dns);
  assert.equal(migrateClashDns(null), null);
  assert.equal(migrateClashDns([]), null);
});

test('Clash 输出的 DNS 段可被 YAML 解析（含嵌套结构）', () => {
  const source: ClashConfig = {
    proxies: [{ name: 'n1', type: 'ss', server: 'a.example.com', port: 443, cipher: 'aes-128-gcm', password: 'pw' }],
    rules: [],
    dns: {
      enable: true,
      'enhanced-mode': 'fake-ip',
      'fake-ip-filter': ['*.lan', '+.example.com'],
      nameserver: ['https://doh.pub/dns-query'],
      fallback: ['https://1.1.1.1/dns-query'],
      'fallback-filter': { geosite: 'gfw' },
      'nameserver-policy': { 'geosite:cn': ['223.5.5.5'] },
    },
  };
  const output = generateClashConfig(source, parseIniConfig('[custom]'), makeParams(), {});
  const parsed = parseClashYaml(output);
  const dns = parsed.dns as Record<string, unknown>;
  assert.ok(dns, 'DNS 段应能被解析');
  assert.equal(dns['enhanced-mode'], 'fake-ip');
  assert.deepEqual(dns['fake-ip-filter'], ['*.lan', '+.example.com']);
  assert.equal('fallback-filter' in dns, false);
  const policy = dns['nameserver-policy'] as Record<string, unknown>;
  assert.deepEqual(policy['geosite:cn'], ['223.5.5.5']);
  assert.deepEqual(policy['geosite:gfw'], ['https://1.1.1.1/dns-query']);
});

test('Clash 外部配置模式下，订阅自带规则引用的策略组会被补建', () => {
  // 外部配置只定义了 🚀 Proxy，但订阅自带规则引用了 SELECT；
  // 若不补建，mihomo 会报 "proxy [SELECT] not found" 并拒绝加载整份配置
  const source: ClashConfig = {
    proxies: [
      { name: 'n1', type: 'ss', server: 'a.example.com', port: 443, cipher: 'aes-128-gcm', password: 'pw' },
      { name: 'n2', type: 'trojan', server: 'b.example.com', port: 443, password: 'pw' },
    ],
    rules: ['DOMAIN-SUFFIX,example.com,SELECT', 'MATCH,SELECT'],
  };
  const ini = parseIniConfig([
    '[custom]',
    'overwrite_original_rules=false',
    'custom_proxy_group=🚀 Proxy`select`.*',
  ].join('\n'));

  const output = generateClashConfig(source, ini, makeParams({ dedup: false }), {});

  // SELECT 必须被补建，且包含全部节点
  assert.ok(output.includes('name: "SELECT"'));
  assert.ok(output.includes('proxies: ["n1", "n2"]'));
  // 规则仍然指向 SELECT
  assert.ok(output.includes('DOMAIN-SUFFIX,example.com,SELECT'));

  // 输出可被 YAML 解析，且每个规则目标都已定义
  const parsed = parseClashYaml(output);
  const defined = new Set<string>([
    ...(parsed['proxy-groups'] ?? []).map(group => group.name),
    ...parsed.proxies.map(node => node.name),
    'DIRECT', 'REJECT',
  ]);
  for (const rule of parsed.rules ?? []) {
    const parts = rule.split(',').map(part => part.trim());
    const target = parts[parts.length - 1].toLowerCase() === 'no-resolve'
      ? parts[parts.length - 2]
      : parts[parts.length - 1];
    assert.ok(defined.has(target), `规则目标 ${target} 未定义`);
  }
});

test('Clash 补建策略组时跳过内置策略与已有节点名', () => {
  const source: ClashConfig = {
    proxies: [{ name: 'DIRECT-NODE', type: 'ss', server: 'a.example.com', port: 443, cipher: 'aes-128-gcm', password: 'pw' }],
    rules: ['DOMAIN,a.com,DIRECT', 'DOMAIN,b.com,REJECT', 'DOMAIN,c.com,DIRECT-NODE', 'MATCH,DIRECT'],
  };
  const ini = parseIniConfig('[custom]\ncustom_proxy_group=🚀 Proxy`select`.*');
  const output = generateClashConfig(source, ini, makeParams({ dedup: false }), {});

  // 用解析后的策略组集合断言：内置策略与真实节点名都不应被当成缺失策略组补建
  const parsed = parseClashYaml(output);
  const groupNames = (parsed['proxy-groups'] ?? []).map(group => group.name);
  assert.deepEqual(groupNames, ['🚀 Proxy']);
  assert.equal(groupNames.includes('DIRECT'), false);
  assert.equal(groupNames.includes('REJECT'), false);
  assert.equal(groupNames.includes('DIRECT-NODE'), false);
  // 规则里的 DIRECT / REJECT / 节点名 都仍然有效
  assert.deepEqual(parsed.rules, [
    'DOMAIN,a.com,DIRECT',
    'DOMAIN,b.com,REJECT',
    'DOMAIN,c.com,DIRECT-NODE',
    'MATCH,DIRECT',
  ]);
});

test('Surge：snell 的 obfs 取值受版本约束（官方文档）', () => {
  const make = (version: number, mode: string): string => {
    const source: ClashConfig = {
      proxies: [{ name: 'SN', type: 'snell', server: 'a.example.com', port: 443, psk: 'psk', version,
        'obfs-opts': { mode, host: 'bing.com' } }],
      rules: [],
    };
    const output = generateSurgeConfig(source, parseIniConfig('[custom]'), makeParams({ target: 'surge' }), {});
    return output.split('\n').find(row => row.startsWith('SN = ')) || '';
  };

  // v1-3：http 与 tls 都允许
  assert.ok(make(3, 'tls').includes('obfs=tls'));
  assert.ok(make(3, 'http').includes('obfs=http'));
  // v4-5：仅 http
  assert.ok(make(4, 'http').includes('obfs=http'));
  assert.equal(make(4, 'tls').includes('obfs'), false, 'v4 不应输出 obfs=tls');
  assert.equal(make(5, 'tls').includes('obfs'), false, 'v5 不应输出 obfs=tls');
  // v6：不支持混淆
  assert.equal(make(6, 'http').includes('obfs'), false, 'v6 不应输出 obfs');
});

test('Surge：hysteria2 的 Salamander 混淆用 salamander-password', () => {
  const source: ClashConfig = {
    proxies: [
      { name: 'HY', type: 'hysteria2', server: 'a.example.com', port: 443, password: 'pw',
        obfs: 'salamander', 'obfs-password': 'obfs-pw', down: '500 Mbps' },
      { name: 'HY2', type: 'hysteria2', server: 'b.example.com', port: 443, password: 'pw' },
    ],
    rules: [],
  };
  const output = generateSurgeConfig(source, parseIniConfig('[custom]'), makeParams({ target: 'surge' }), {});
  const line = (name: string) => output.split('\n').find(row => row.startsWith(`${name} = `)) || '';
  assert.ok(line('HY').includes('salamander-password=obfs-pw'));
  assert.ok(line('HY').includes('download-bandwidth=500'));
  // 未声明混淆时不输出该参数
  assert.equal(line('HY2').includes('salamander-password'), false);
});

test('Surge：vmess 的 encrypt-method 与 vmess-aead 按官方取值输出', () => {
  const make = (extra: Record<string, unknown>): string => {
    const source: ClashConfig = {
      proxies: [{ name: 'VM', type: 'vmess', server: 'a.example.com', port: 443,
        uuid: '11111111-2222-3333-4444-555555555555', ...extra }],
      rules: [],
    };
    const output = generateSurgeConfig(source, parseIniConfig('[custom]'), makeParams({ target: 'surge' }), {});
    return output.split('\n').find(row => row.startsWith('VM = ')) || '';
  };

  // 官方只允许 aes-128-gcm / chacha20-ietf-poly1305
  assert.ok(make({ cipher: 'aes-128-gcm', alterId: 0 }).includes('encrypt-method=aes-128-gcm'));
  assert.ok(make({ cipher: 'chacha20-ietf-poly1305' }).includes('encrypt-method=chacha20-ietf-poly1305'));
  // cipher=auto 不输出 encrypt-method（保持服务端默认）
  assert.equal(make({ cipher: 'auto' }).includes('encrypt-method'), false);
  // alterId != 0 表示非 AEAD
  assert.ok(make({ alterId: 0 }).includes('vmess-aead=true'));
  assert.ok(make({ alterId: 4 }).includes('vmess-aead=false'));
});

test('sing-box：geo_rules=skip 产出零运行时下载的自包含配置', () => {
  const source: ClashConfig = {
    proxies: [{ name: 'n1', type: 'ss', server: 'a.example.com', port: 443, cipher: 'aes-128-gcm', password: 'pw' }],
    rules: ['GEOIP,LAN,DIRECT', 'GEOIP,CN,DIRECT', 'GEOSITE,openai,REJECT', 'DOMAIN-SUFFIX,a.test,DIRECT', 'MATCH,DIRECT'],
  };

  // 默认（remote）：输出远程 rule_set 与 http_clients
  const remote = buildSingbox(source, parseIniConfig('[custom]'), makeParams({ target: 'singbox' }), {});
  const remoteSets = (remote.route?.rule_set ?? []) as Record<string, unknown>[];
  assert.ok(remoteSets.length >= 2, 'remote 模式应输出远程 rule_set');
  assert.ok(Array.isArray(remote.http_clients) && remote.http_clients.length > 0);

  // skip：不得出现 rule_set / http_clients
  const skip = buildSingbox(source, parseIniConfig('[custom]'),
    makeParams({ target: 'singbox', geo_rules: 'skip' }), {});
  assert.equal(skip.route?.rule_set, undefined, 'skip 模式不应有 rule_set');
  assert.equal(skip.http_clients, undefined, 'skip 模式不应有 http_clients');
  assert.equal(JSON.stringify(skip).includes('geoip-'), false, 'skip 模式不应残留 geoip rule_set 引用');
  assert.equal(JSON.stringify(skip).includes('geosite-'), false, 'skip 模式不应残留 geosite rule_set 引用');

  // LAN 语义必须保留（映射到内置 ip_is_private，无需下载）
  const rules = (skip.route?.rules ?? []) as Record<string, unknown>[];
  assert.ok(rules.some(rule => rule.ip_is_private === true), 'GEOIP,LAN 应映射为 ip_is_private');

  // 非 geo 规则不受影响
  assert.ok(rules.some(rule => JSON.stringify(rule).includes('a.test')));
  assert.equal(skip.route?.final, 'DIRECT');
});

test('sing-box：geo_rules=remote 是默认值', () => {
  const source: ClashConfig = {
    proxies: [{ name: 'n1', type: 'ss', server: 'a.example.com', port: 443, cipher: 'aes-128-gcm', password: 'pw' }],
    rules: ['GEOIP,CN,DIRECT', 'MATCH,DIRECT'],
  };
  const implicit = buildSingbox(source, parseIniConfig('[custom]'), makeParams({ target: 'singbox' }), {});
  const explicit = buildSingbox(source, parseIniConfig('[custom]'),
    makeParams({ target: 'singbox', geo_rules: 'remote' }), {});
  assert.deepEqual(implicit.route?.rule_set, explicit.route?.rule_set);
});
