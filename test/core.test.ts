import assert from 'node:assert/strict';
import test from 'node:test';
import { parseClashYaml } from '../src/parsers/yaml-parser';
import { parseClashRule, prepareNodes } from '../src/utils/node-utils';
import type { ConversionParams } from '../src/utils/types';

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
