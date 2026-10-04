// sing-box 传输层字段类型回归
//
// 内核的类型要求（实测）：
//   - V2RayHTTPOptions.host   → 数组
//   - V2RayHTTPOptions.path   → 字符串（Clash 侧可能是数组）
//   - WebsocketOptions.path   → 字符串
//   - HTTPUpgradeOptions.path → 字符串
// 这些字段类型写错会让 sing-box 直接拒绝加载整份配置。
import assert from 'node:assert/strict';
import test from 'node:test';
import { generateSingboxConfig } from '../src/generators/singbox';
import { parseIniConfig } from '../src/parsers/ini-parser';
import type { ClashConfig, ConversionParams, ProxyNode } from '../src/utils/types';
import { DEFAULT_PARAMS } from '../src/utils/types';

function build(nodes: ProxyNode[]): Record<string, unknown>[] {
  const source: ClashConfig = { proxies: nodes, rules: [] };
  const params: ConversionParams = { ...DEFAULT_PARAMS, target: 'singbox', url: '' };
  const config = JSON.parse(generateSingboxConfig(source, parseIniConfig('[custom]'), params, {})) as {
    outbounds?: Record<string, unknown>[];
  };
  return config.outbounds ?? [];
}

function outboundOf(nodes: ProxyNode[], tag: string): Record<string, unknown> {
  const found = build(nodes).find(item => item.tag === tag);
  assert.ok(found, `未找到 outbound ${tag}`);
  return found;
}

const UUID = '11111111-2222-3333-4444-555555555555';

test('sing-box transport：h2 的 path 必须是字符串（Clash 侧常写成数组）', () => {
  const nodes: ProxyNode[] = [
    { name: 'h2-array', type: 'vmess', server: 'a.example.com', port: 443, uuid: UUID,
      network: 'h2', tls: true, servername: 'a.example.com',
      'h2-opts': { host: ['a.example.com'], path: ['/h2-path'] } },
    { name: 'h2-string', type: 'vmess', server: 'b.example.com', port: 443, uuid: UUID,
      network: 'h2', tls: true, 'h2-opts': { host: 'b.example.com', path: '/h2-path' } },
  ];

  for (const tag of ['h2-array', 'h2-string']) {
    const outbound = outboundOf(nodes, tag);
    const transport = outbound.transport as Record<string, unknown>;
    assert.equal(transport.type, 'http');
    assert.equal(typeof transport.path, 'string', `${tag}: path 必须是字符串`);
    assert.equal(transport.path, '/h2-path');
    assert.ok(Array.isArray(transport.host), `${tag}: host 必须是数组`);
  }
});

test('sing-box transport：httpupgrade 的 path 必须是字符串', () => {
  const nodes: ProxyNode[] = [
    { name: 'up-array', type: 'vmess', server: 'a.example.com', port: 443, uuid: UUID,
      network: 'httpupgrade', tls: true,
      'httpupgrade-opts': { host: 'a.example.com', path: ['/up-path'] } },
    { name: 'up-string', type: 'vmess', server: 'b.example.com', port: 443, uuid: UUID,
      network: 'httpupgrade', tls: true,
      'httpupgrade-opts': { host: 'b.example.com', path: '/up-path' } },
  ];

  for (const tag of ['up-array', 'up-string']) {
    const transport = outboundOf(nodes, tag).transport as Record<string, unknown>;
    assert.equal(transport.type, 'httpupgrade');
    assert.equal(typeof transport.path, 'string', `${tag}: path 必须是字符串`);
    assert.equal(transport.path, '/up-path');
    assert.equal(typeof transport.host, 'string');
  }
});

test('sing-box transport：ws 的 path 与 headers 类型正确', () => {
  const nodes: ProxyNode[] = [
    { name: 'ws', type: 'vmess', server: 'a.example.com', port: 443, uuid: UUID,
      network: 'ws', tls: true,
      'ws-opts': { path: '/ws-path', headers: { Host: 'cdn.example.com', 'X-Extra': ['v1', 'v2'] } } },
  ];
  const transport = outboundOf(nodes, 'ws').transport as Record<string, unknown>;
  assert.equal(transport.type, 'ws');
  assert.equal(transport.path, '/ws-path');
  const headers = transport.headers as Record<string, string>;
  assert.equal(headers.Host, 'cdn.example.com');
  // 数组型 header 取第一个值
  assert.equal(headers['X-Extra'], 'v1');
  for (const value of Object.values(headers)) assert.equal(typeof value, 'string');
});

test('sing-box transport：grpc 的 service_name 类型正确', () => {
  const nodes: ProxyNode[] = [
    { name: 'grpc', type: 'vless', server: 'a.example.com', port: 443, uuid: UUID,
      network: 'grpc', tls: true, 'grpc-opts': { 'grpc-service-name': 'my-svc' } },
    { name: 'grpc-empty', type: 'vless', server: 'b.example.com', port: 443, uuid: UUID,
      network: 'grpc', tls: true, 'grpc-opts': {} },
  ];
  const withName = outboundOf(nodes, 'grpc').transport as Record<string, unknown>;
  assert.equal(withName.type, 'grpc');
  assert.equal(withName.service_name, 'my-svc');
  // 未提供 service_name 时不应输出空字段
  const withoutName = outboundOf(nodes, 'grpc-empty').transport as Record<string, unknown>;
  assert.equal(withoutName.type, 'grpc');
  assert.equal('service_name' in withoutName, false);
});

test('sing-box transport：tcp / kcp 不输出 transport 段', () => {
  const nodes: ProxyNode[] = [
    { name: 'tcp', type: 'vmess', server: 'a.example.com', port: 443, uuid: UUID, network: 'tcp' },
    { name: 'kcp', type: 'vmess', server: 'b.example.com', port: 443, uuid: UUID, network: 'kcp' },
    { name: 'none', type: 'vmess', server: 'c.example.com', port: 443, uuid: UUID },
  ];
  for (const tag of ['tcp', 'kcp', 'none']) {
    assert.equal('transport' in outboundOf(nodes, tag), false, `${tag} 不应有 transport`);
  }
});
