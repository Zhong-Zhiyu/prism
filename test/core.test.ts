import assert from 'node:assert/strict';
import test from 'node:test';
import { parseClashYaml } from '../src/parsers/yaml-parser';
import { parseIniConfig } from '../src/parsers/ini-parser';
import { parseClashRule, prepareNodes } from '../src/utils/node-utils';
import { pruneRules } from '../src/utils/rule-pruner';
import { generateClashConfig } from '../src/generators/clash';
import { generateSurgeConfig } from '../src/generators/surge';
import { generateSingboxConfig } from '../src/generators/singbox';
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

test('Clash expand output prunes redundant rules and keeps URL-REGEX', () => {
  const output = generateClashConfig(emptySource(), makeIni(), makeParams(), RULE_CONTENTS);
  assert.ok(output.includes('  - DOMAIN-SUFFIX,example.com,🚀 Proxy'));
  assert.ok(!output.includes('sub.example.com'));
  assert.ok(output.includes('  - IP-CIDR,10.0.0.0/8,🚀 Proxy,no-resolve'));
  assert.ok(!output.includes('10.1.0.0/16'));
  assert.ok(output.includes('  - URL-REGEX,^https?://ads\\.example\\.com/,🚀 Proxy'));
  assert.ok(output.includes('  - GEOIP,CN,🎯 Direct'));
  assert.ok(output.includes('  - MATCH,🚀 Proxy'));
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

test('Surge output prunes rules, keeps no-resolve and drops URL-REGEX', () => {
  const output = generateSurgeConfig(emptySource(), makeIni(), makeParams({ target: 'surge' }), RULE_CONTENTS);
  assert.ok(output.includes('DOMAIN-SUFFIX,example.com,🚀 Proxy'));
  assert.ok(!output.includes('sub.example.com'));
  assert.ok(output.includes('IP-CIDR,10.0.0.0/8,🚀 Proxy,no-resolve'));
  assert.ok(!output.includes('10.1.0.0/16'));
  assert.ok(!output.includes('URL-REGEX'));
  assert.ok(output.includes('GEOIP,CN,🎯 Direct'));
  assert.ok(output.includes('FINAL,🚀 Proxy'));
});

test('sing-box output prunes rules and drops URL-REGEX', () => {
  const output = generateSingboxConfig(emptySource(), makeIni(), makeParams({ target: 'singbox' }), RULE_CONTENTS);
  const config = JSON.parse(output) as { route: { rules: Record<string, unknown>[] } };
  const rules = config.route.rules;
  assert.deepEqual(rules[0], { domain_suffix: 'example.com', outbound: '🚀 Proxy' });
  assert.equal(rules.some(rule => JSON.stringify(rule).includes('sub.example.com')), false);
  assert.equal(rules.some(rule => JSON.stringify(rule).includes('10.1.0.0/16')), false);
  assert.equal(rules.some(rule => 'domain_regex' in rule), false);
  assert.deepEqual(rules[rules.length - 1], { outbound: '🚀 Proxy' });
});
