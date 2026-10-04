// ============================================================
// 内核级验收运行器
//
// 用真实内核校验 Prism 三种目标的产物：
//   - Clash     : mihomo -t -f <file> -d <dir>
//   - sing-box  : sing-box check -c <file>
//   - Surge     : 结构化校验（Surge 无 Linux 运行时，见 checkSurgeConfig 注释）
//
// 内核二进制路径由环境变量提供，缺失时该项标记为 SKIP：
//   MIHOMO_BIN=/path/to/mihomo SINGBOX_BIN=/path/to/sing-box npm run verify:kernel
// ============================================================

import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateClashConfig } from '../../src/generators/clash';
import { generateSingboxConfig } from '../../src/generators/singbox';
import { generateSurgeConfig } from '../../src/generators/surge';
import { checkSurgeConfig } from '../../src/generators/surge-check';
import { parseIniConfig } from '../../src/parsers/ini-parser';
import { parseClashYaml } from '../../src/parsers/yaml-parser';
import type { ClashConfig, ConversionParams, ParsedIniConfig } from '../../src/utils/types';
import { DEFAULT_PARAMS } from '../../src/utils/types';

const MIHOMO_BIN = process.env.MIHOMO_BIN || 'mihomo';
const SINGBOX_BIN = process.env.SINGBOX_BIN || 'sing-box';

/** 覆盖主流协议与传输层的夹具订阅 */
const FIXTURE_SUB = `
mixed-port: 7890
allow-lan: false
log-level: info
dns:
  enable: true
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  fake-ip-filter: ['*.lan', '+.example.com']
  default-nameserver: ['223.5.5.5']
  nameserver: ['https://doh.pub/dns-query', 'tls://dns.google']
  fallback: ['https://1.1.1.1/dns-query']
  fallback-filter: { geosite: gfw }
proxies:
  - { name: ss-plain, type: ss, server: a.example.com, port: 8443, cipher: aes-256-gcm, password: pw, udp: true }
  - { name: ss-obfs, type: ss, server: b.example.com, port: 8443, cipher: aes-128-gcm, password: pw, plugin: obfs, plugin-opts: { mode: tls, host: bing.com } }
  - { name: vmess-ws, type: vmess, server: c.example.com, port: 443, uuid: 11111111-2222-3333-4444-555555555555, alterId: 4, cipher: auto, network: ws, tls: true, servername: cdn.example.com, ws-opts: { path: /ws, headers: { Host: cdn.example.com } }, client-fingerprint: chrome, udp: true }
  - { name: vless-reality, type: vless, server: d.example.com, port: 443, uuid: 66666666-7777-8888-9999-000000000000, network: tcp, tls: true, flow: xtls-rprx-vision, servername: www.microsoft.com, reality-opts: { public-key: BI5tEyMoNFnF9q-alA5_Yl_nYJ3ksO0bq1jmG3mBdX4, short-id: abcd }, udp: true }
  - { name: vless-grpc, type: vless, server: e.example.com, port: 2053, uuid: 66666666-7777-8888-9999-000000000001, network: grpc, tls: true, servername: grpc.example.com, grpc-opts: { grpc-service-name: svc } }
  - { name: trojan-tls, type: trojan, server: f.example.com, port: 443, password: pw, sni: f.example.com, alpn: [h2], skip-cert-verify: true, udp: true }
  - { name: hysteria2, type: hysteria2, server: g.example.com, port: 8443, password: pw, sni: g.example.com, skip-cert-verify: true, up: 100 Mbps, down: 500 Mbps }
  - { name: tuic-v5, type: tuic, server: h.example.com, port: 8444, uuid: aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee, password: pw, sni: h.example.com, alpn: [h3], congestion-controller: bbr, udp-relay-mode: native, skip-cert-verify: true }
  - { name: snell-v4, type: snell, server: i.example.com, port: 443, psk: psk-value, version: 4, obfs-opts: { mode: tls, host: bing.com } }
  - { name: anytls-node, type: anytls, server: j.example.com, port: 8443, password: pw, sni: j.example.com, client-fingerprint: chrome, alpn: [h2, http/1.1], skip-cert-verify: true, udp: true }
  - { name: http-auth, type: http, server: k.example.com, port: 8080, username: user1, password: pass1 }
  - { name: socks5-auth, type: socks5, server: l.example.com, port: 1080, username: user2, password: pass2, udp: true }
  - { name: ssr-node, type: ssr, server: m.example.com, port: 8445, cipher: aes-256-cfb, password: pw, protocol: auth_aes128_md5, protocol-param: '123:abc', obfs: tls1.2_ticket_auth, obfs-param: cloud.example.com }
proxy-groups:
  - { name: AUTO, type: url-test, url: 'http://www.gstatic.com/generate_204', interval: 600, tolerance: 50, proxies: [ss-plain, vmess-ws, trojan-tls] }
  - { name: SELECT, type: select, proxies: [AUTO, DIRECT, ss-plain, ss-obfs, vmess-ws, vless-reality, vless-grpc, trojan-tls, hysteria2, tuic-v5, snell-v4, anytls-node, http-auth, socks5-auth] }
rules:
  - DOMAIN-SUFFIX,example.com,SELECT
  - DOMAIN-KEYWORD,fixture,SELECT
  - IP-CIDR,198.18.0.0/16,DIRECT,no-resolve
  - GEOIP,LAN,DIRECT
  - GEOIP,CN,DIRECT
  - GEOSITE,openai,SELECT
  - PROCESS-NAME,curl.exe,DIRECT
  - URL-REGEX,^https?://ads\\.example\\.com/,REJECT
  - MATCH,SELECT
`;

const FIXTURE_INI = [
  '[custom]',
  'overwrite_original_rules=false',
  'custom_proxy_group=🚀 节点选择`select`.*',
  'custom_proxy_group=♻️ 自动选择`url-test`.*`http://www.gstatic.com/generate_204`600',
  'custom_proxy_group=🎯 全球直连`select`DIRECT',
  'ruleset=🎯 全球直连,https://fixtures.example.com/direct.list',
  'ruleset=🎯 全球直连,[]GEOIP,CN',
  'ruleset=🚀 节点选择,[]FINAL',
].join('\n');

const FIXTURE_RULES: Record<string, string[]> = {
  'https://fixtures.example.com/direct.list': [
    'DOMAIN-SUFFIX,cn',
    'IP-CIDR,10.0.0.0/8,no-resolve',
  ],
};

function buildParams(target: ConversionParams['target']): ConversionParams {
  return { ...DEFAULT_PARAMS, target, url: '', config: 'https://fixtures.example.com/config.ini' };
}

interface CaseResult {
  label: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  detail: string;
}

const results: CaseResult[] = [];

function run(bin: string, args: string[], cwd?: string): { ok: boolean; output: string } {
  try {
    const output = execFileSync(bin, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 });
    return { ok: true, output: output.trim() };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string; code?: string };
    if (err.code === 'ENOENT') return { ok: false, output: 'ENOENT' };
    return { ok: false, output: `${err.stdout ?? ''}${err.stderr ?? ''}`.trim() || String(err.message) };
  }
}

function checkKernel(bin: string, args: string[], cwd: string | undefined, label: string, skipMessage: string): void {
  const probe = run(bin, ['--help']);
  if (!probe.ok && probe.output === 'ENOENT') {
    results.push({ label, status: 'SKIP', detail: skipMessage });
    return;
  }
  const result = run(bin, args, cwd);
  const clean = result.output.replace(/\u001b\[[0-9;]*m/g, '');
  if (result.ok) {
    results.push({ label, status: 'PASS', detail: clean.split('\n').slice(-1)[0]?.slice(0, 100) || 'ok' });
    return;
  }
  const first = clean.split('\n').find(line => /error|fatal|failed/i.test(line)) || clean.split('\n')[0] || 'failed';
  results.push({ label, status: 'FAIL', detail: first.slice(0, 160) });
}

/**
 * 预置 mihomo 的地理数据文件。
 *
 * 含 GEOSITE / GEOIP 规则时 mihomo 会尝试下载 geosite.dat / geoip.dat；
 * 实测本机网络下 mihomo 自身的下载会 EOF，而 curl 可以正常完成，
 * 因此这里预先取到工作目录，让验收结果只反映配置本身的问题。
 */
function preloadGeoData(workdir: string): string {
  const sources = [
    'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest',
    'https://cdn.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release',
  ];
  const notes: string[] = [];

  for (const file of ['geosite.dat', 'geoip.dat', 'country.mmdb', 'geoip.metadb']) {
    const target = join(workdir, file);
    if (existsSync(target) && statSync(target).size > 0) continue;
    let ok = false;
    for (const base of sources) {
      const attempt = run('curl', ['-sL', '--max-time', '120', '-o', target, `${base}/${file}`]);
      if (attempt.ok && existsSync(target) && statSync(target).size > 0) {
        ok = true;
        break;
      }
    }
    notes.push(`${file}: ${ok ? '已预置' : '预置失败（GEOSITE/GEOIP 校验可能受影响）'}`);
  }
  return notes.join('，');
}

function main(): void {
  const source = parseClashYaml(FIXTURE_SUB);
  const ini: ParsedIniConfig = parseIniConfig(FIXTURE_INI);
  const workdir = mkdtempSync(join(tmpdir(), 'prism-verify-'));
  const geoNote = preloadGeoData(workdir);
  console.log(`地理数据: ${geoNote}\n`);

  // ---- Clash ----
  for (const [label, withConfig] of [['clash (订阅自带规则)', false], ['clash (外部配置)', true]] as const) {
    const params = buildParams('clash');
    if (!withConfig) delete params.config;
    const output = generateClashConfig(source as ClashConfig, withConfig ? ini : parseIniConfig('[custom]'), params, withConfig ? FIXTURE_RULES : {});
    const file = join(workdir, `${label.replace(/[^\w]/g, '_')}.yaml`);
    writeFileSync(file, output);
    checkKernel(MIHOMO_BIN, ['-t', '-f', file, '-d', workdir], undefined, label,
      '未找到 mihomo，请设置 MIHOMO_BIN');
  }

  // ---- sing-box ----
  for (const [label, withConfig] of [['sing-box (订阅自带规则)', false], ['sing-box (外部配置)', true]] as const) {
    const params = buildParams('singbox');
    if (!withConfig) delete params.config;
    const output = generateSingboxConfig(source as ClashConfig, withConfig ? ini : parseIniConfig('[custom]'), params, withConfig ? FIXTURE_RULES : {});
    const file = join(workdir, `${label.replace(/[^\w]/g, '_')}.json`);
    writeFileSync(file, output);
    checkKernel(SINGBOX_BIN, ['check', '-c', file], undefined, label,
      '未找到 sing-box，请设置 SINGBOX_BIN');
  }

  // ---- Surge ----
  for (const [label, withConfig] of [['surge (订阅自带规则)', false], ['surge (外部配置)', true]] as const) {
    const params = buildParams('surge');
    if (!withConfig) delete params.config;
    const output = generateSurgeConfig(source as ClashConfig, withConfig ? ini : parseIniConfig('[custom]'), params, withConfig ? FIXTURE_RULES : {});
    const file = join(workdir, `${label.replace(/[^\w]/g, '_')}.conf`);
    writeFileSync(file, output);
    const check = checkSurgeConfig(output);
    const detail = check.errors.length === 0
      ? `节点 ${check.proxyCount} / 策略组 ${check.groupCount} / 规则 ${check.ruleCount}，引用一致`
      : check.errors[0];
    results.push({
      label,
      status: check.errors.length === 0 ? 'PASS' : 'FAIL',
      detail: detail.slice(0, 160),
    });
    for (const warning of check.warnings) {
      console.log(`  [warn] ${label}: ${warning}`);
    }
  }

  // ---- 输出 ----
  const width = Math.max(...results.map(item => item.label.length));
  let failed = 0;
  for (const item of results) {
    const icon = item.status === 'PASS' ? '✔' : item.status === 'FAIL' ? '✖' : '○';
    if (item.status === 'FAIL') failed++;
    console.log(`${icon} ${item.label.padEnd(width)}  ${item.detail}`);
  }
  console.log(`\n产物目录: ${workdir}`);
  console.log(`结果: ${results.filter(item => item.status === 'PASS').length} 通过, ${failed} 失败, ${results.filter(item => item.status === 'SKIP').length} 跳过`);

  if (failed > 0) process.exitCode = 1;
}

main();
