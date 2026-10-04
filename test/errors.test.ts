// ============================================================
// 错误路径与降级行为
//
// 覆盖：部分上游失败、超大响应、重定向异常、超时、规则集并发与数量上限、
// 极端规模（节点/规则数量）、以及「部分失败是否降级」的既定语义。
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';
import app from '../src/worker';

const realFetch = globalThis.fetch;

interface StubResponse {
  body?: string;
  status?: number;
  headers?: Record<string, string>;
  /** 返回该值则让 fetch 抛出（模拟网络错误） */
  throwError?: string;
  /** 延迟返回（毫秒），用于模拟超时 */
  delayMs?: number;
}

type StubMap = Record<string, StubResponse>;

function installFetchStub(routes: StubMap, fallback: StubResponse = { status: 404, body: 'not found' }): () => void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const stub = routes[url] ?? fallback;
    if (stub.throwError) throw new Error(stub.throwError);
    if (stub.delayMs) await new Promise(resolve => setTimeout(resolve, stub.delayMs));
    const status = stub.status ?? 200;
    const headers = new Headers(stub.headers ?? { 'Content-Type': 'text/plain; charset=utf-8' });
    return new Response(stub.body ?? '', { status, headers });
  }) as typeof globalThis.fetch;
  return () => { globalThis.fetch = realFetch; };
}

async function callWorker(query: string): Promise<{ status: number; headers: Headers; body: string }> {
  const response = await app.fetch(new Request(`http://worker.test/sub?${query}`));
  return { status: response.status, headers: response.headers, body: await response.text() };
}

const enc = encodeURIComponent;

function subscription(nodeCount: number, prefix = 'n'): string {
  const lines = ['proxies:'];
  for (let index = 0; index < nodeCount; index++) {
    lines.push(`  - { name: ${prefix}${index}, type: ss, server: s${index}.example.com, port: ${1000 + index}, cipher: aes-128-gcm, password: pw }`);
  }
  lines.push('proxy-groups:');
  lines.push(`  - { name: G, type: select, proxies: [${Array.from({ length: nodeCount }, (_, i) => `${prefix}${i}`).join(', ')}, DIRECT] }`);
  lines.push('rules:');
  lines.push('  - MATCH,G');
  return lines.join('\n');
}

function ruleList(count: number, prefix = 'r'): string {
  return Array.from({ length: count }, (_, index) => `DOMAIN-SUFFIX,${prefix}${index}.test`).join('\n');
}

// ============================================================
// 部分上游失败：既定语义是整单失败（不静默降级）
// ============================================================

test('错误路径：多订阅中有一个失败时整单失败（不静默降级）', async () => {
  const restore = installFetchStub({
    'https://fixture.test/ok.yaml': { body: subscription(3) },
    'https://fixture.test/bad.yaml': { status: 500, body: 'server error' },
  });
  try {
    const result = await callWorker(
      `target=clash&url=${enc('https://fixture.test/ok.yaml')}&url=${enc('https://fixture.test/bad.yaml')}`
    );
    // 明确失败优于「悄悄少一半节点」
    assert.equal(result.status, 502);
    assert.match(result.body, /下载或解析订阅失败/);
  } finally {
    restore();
  }
});

test('错误路径：上游网络异常时返回 502', async () => {
  const restore = installFetchStub({
    'https://fixture.test/ok.yaml': { body: subscription(2) },
    'https://fixture.test/net.yaml': { throwError: 'ECONNRESET' },
  });
  try {
    const result = await callWorker(`target=clash&url=${enc('https://fixture.test/net.yaml')}`);
    assert.equal(result.status, 502);
  } finally {
    restore();
  }
});

// ============================================================
// 重定向
// ============================================================

test('错误路径：重定向次数过多时返回 502', async () => {
  const routes: StubMap = {};
  for (let index = 0; index < 8; index++) {
    routes[`https://fixture.test/r${index}.yaml`] = {
      status: 302,
      headers: { Location: `https://fixture.test/r${index + 1}.yaml` },
    };
  }
  const restore = installFetchStub(routes);
  try {
    const result = await callWorker(`target=clash&url=${enc('https://fixture.test/r0.yaml')}`);
    assert.equal(result.status, 502);
  } finally {
    restore();
  }
});

test('错误路径：重定向后正常取到订阅', async () => {
  const restore = installFetchStub({
    'https://fixture.test/moved.yaml': { status: 302, headers: { Location: 'https://fixture.test/final.yaml' } },
    'https://fixture.test/final.yaml': { body: subscription(2) },
  });
  try {
    const result = await callWorker(`target=clash&url=${enc('https://fixture.test/moved.yaml')}`);
    assert.equal(result.status, 200);
    assert.match(result.body, /name: "n0"/);
  } finally {
    restore();
  }
});

test('错误路径：重定向到内网地址被 SSRF 防护拦下', async () => {
  const restore = installFetchStub({
    'https://fixture.test/evil.yaml': { status: 302, headers: { Location: 'http://127.0.0.1:8080/secret' } },
  });
  try {
    const result = await callWorker(`target=clash&url=${enc('https://fixture.test/evil.yaml')}`);
    assert.equal(result.status, 502);
  } finally {
    restore();
  }
});

// ============================================================
// 超大响应
// ============================================================

test('错误路径：声明超大 content-length 的订阅被拒绝', async () => {
  const restore = installFetchStub({
    'https://fixture.test/huge.yaml': {
      body: subscription(2),
      headers: { 'Content-Type': 'text/yaml', 'Content-Length': String(5 * 1024 * 1024) },
    },
  });
  try {
    const result = await callWorker(`target=clash&url=${enc('https://fixture.test/huge.yaml')}`);
    assert.equal(result.status, 502);
  } finally {
    restore();
  }
});

test('错误路径：实际正文超过 2MB 上限被拒绝', async () => {
  // 构造超过 2MB 的正文（不依赖 content-length）
  const padding = '# '.padEnd(1024, 'x');
  const body = ['proxies:', `  - { name: n0, type: ss, server: a.example.com, port: 443, cipher: aes-128-gcm, password: pw }`,
    ...Array.from({ length: 2200 }, () => padding)].join('\n');
  assert.ok(body.length > 2 * 1024 * 1024, '夹具应超过 2MB');
  const restore = installFetchStub({ 'https://fixture.test/big.yaml': { body } });
  try {
    const result = await callWorker(`target=clash&url=${enc('https://fixture.test/big.yaml')}`);
    assert.equal(result.status, 502);
  } finally {
    restore();
  }
});

test('错误路径：config 超过 512KB 上限被拒绝', async () => {
  const bigIni = ['[custom]', ...Array.from({ length: 9000 }, (_, i) => `; padding line ${i} ${'x'.repeat(60)}`)].join('\n');
  assert.ok(bigIni.length > 512 * 1024);
  const restore = installFetchStub({
    'https://fixture.test/sub.yaml': { body: subscription(2) },
    'https://fixture.test/big.ini': { body: bigIni },
  });
  try {
    const result = await callWorker(
      `target=clash&url=${enc('https://fixture.test/sub.yaml')}&config=${enc('https://fixture.test/big.ini')}`
    );
    assert.equal(result.status, 502);
    assert.match(result.body, /无法下载或解析规则配置/);
  } finally {
    restore();
  }
});

// ============================================================
// 规则集：并发抓取、数量上限、部分失败
// ============================================================

test('降级：规则集部分失败时仍产出配置，失败项留占位', async () => {
  const routes: StubMap = { 'https://fixture.test/sub.yaml': { body: subscription(2) } };
  const iniLines = ['[custom]', 'custom_proxy_group=P`select`.*'];
  for (let index = 0; index < 6; index++) {
    const url = `https://fixture.test/list${index}.list`;
    iniLines.push(`ruleset=P,${url}`);
    // 一半成功一半 404
    routes[url] = index % 2 === 0 ? { body: ruleList(3, `ok${index}`) } : { status: 404, body: '' };
  }
  iniLines.push('ruleset=P,[]FINAL');
  routes['https://fixture.test/config.ini'] = { body: iniLines.join('\n') };

  const restore = installFetchStub(routes);
  try {
    const result = await callWorker(
      `target=clash&url=${enc('https://fixture.test/sub.yaml')}&config=${enc('https://fixture.test/config.ini')}`
    );
    assert.equal(result.status, 200);
    // 成功的规则集内容应出现
    assert.match(result.body, /ok00\.test/);
    assert.match(result.body, /ok20\.test/);
    assert.match(result.body, /ok40\.test/);
    // 失败项不应出现对应域名
    assert.equal(result.body.includes('ok10.test'), false);
    // 兜底规则仍在，失败项有占位注释
    assert.match(result.body, /MATCH,P/);
    assert.match(result.body, /规则集下载失败/);
  } finally {
    restore();
  }
});

test('降级：规则集全部失败时只保留订阅规则与兜底', async () => {
  const ini = ['[custom]', 'custom_proxy_group=P`select`.*',
    'ruleset=P,https://fixture.test/gone1.list',
    'ruleset=P,https://fixture.test/gone2.list',
    'ruleset=P,[]FINAL'].join('\n');
  const restore = installFetchStub({
    'https://fixture.test/sub.yaml': { body: subscription(2) },
    'https://fixture.test/config.ini': { body: ini },
  });
  try {
    const result = await callWorker(
      `target=clash&url=${enc('https://fixture.test/sub.yaml')}&config=${enc('https://fixture.test/config.ini')}`
    );
    assert.equal(result.status, 200);
    assert.match(result.body, /MATCH,P/);
    assert.equal(result.body.includes('gone1.list'), false);
  } finally {
    restore();
  }
});

test('规模：超过 50 个规则集时只抓取前 50 个', async () => {
  const routes: StubMap = { 'https://fixture.test/sub.yaml': { body: subscription(2) } };
  const iniLines = ['[custom]', 'custom_proxy_group=P`select`.*'];
  for (let index = 0; index < 60; index++) {
    const url = `https://fixture.test/many${index}.list`;
    iniLines.push(`ruleset=P,${url}`);
    routes[url] = { body: `DOMAIN-SUFFIX,many${index}.test` };
  }
  iniLines.push('ruleset=P,[]FINAL');
  routes['https://fixture.test/config.ini'] = { body: iniLines.join('\n') };

  const restore = installFetchStub(routes);
  try {
    const result = await callWorker(
      `target=clash&url=${enc('https://fixture.test/sub.yaml')}&config=${enc('https://fixture.test/config.ini')}`
    );
    assert.equal(result.status, 200);
    assert.match(result.body, /many0\.test/);
    assert.match(result.body, /many49\.test/);
    // 第 51 个及以后不应被抓取
    assert.equal(result.body.includes('many50.test'), false);
    assert.equal(result.body.includes('many59.test'), false);
  } finally {
    restore();
  }
});

// ============================================================
// 极端规模
// ============================================================

test('规模：1000 个节点 × 三目标都能产出有效配置', async () => {
  const body = subscription(1000);
  const restore = installFetchStub({ 'https://fixture.test/big.yaml': { body } });
  try {
    for (const target of ['clash', 'singbox', 'surge']) {
      const result = await callWorker(`target=${target}&url=${enc('https://fixture.test/big.yaml')}`);
      assert.equal(result.status, 200, `${target} 应成功`);
      assert.ok(result.body.length > 10_000, `${target} 产物应非空`);
      if (target === 'singbox') {
        const config = JSON.parse(result.body) as { outbounds?: unknown[] };
        // 1000 节点 + direct/block + 1 策略组
        assert.ok((config.outbounds ?? []).length >= 1002, 'sing-box 出站数应覆盖全部节点');
      } else {
        const nodeLines = (result.body.match(/name: "/g) ?? []).length + (result.body.match(/^n\d+ = /gm) ?? []).length;
        assert.ok(nodeLines >= 1000, `${target} 节点数应覆盖全部节点，实际 ${nodeLines}`);
      }
    }
  } finally {
    restore();
  }
});

test('规模：5000 条规则 × 三目标都能产出有效配置', async () => {
  const rules = Array.from({ length: 5000 }, (_, index) => `  - DOMAIN-SUFFIX,rule${index}.test,G`).join('\n');
  const body = `${subscription(5)}\n  - MATCH,G`.replace('  - MATCH,G', `\n${rules}\n  - MATCH,G`);
  const restore = installFetchStub({ 'https://fixture.test/rules.yaml': { body } });
  try {
    for (const target of ['clash', 'singbox', 'surge']) {
      const result = await callWorker(`target=${target}&url=${enc('https://fixture.test/rules.yaml')}`);
      assert.equal(result.status, 200, `${target} 应成功`);
      const count = (result.body.match(/rule\d+\.test/g) ?? []).length;
      assert.ok(count >= 4000, `${target} 规则数应接近 5000，实际 ${count}`);
    }
  } finally {
    restore();
  }
});

test('规模：规则集内容 5000 行仍能展开', async () => {
  const ini = ['[custom]', 'custom_proxy_group=P`select`.*',
    'ruleset=P,https://fixture.test/huge.list', 'ruleset=P,[]FINAL'].join('\n');
  const restore = installFetchStub({
    'https://fixture.test/sub.yaml': { body: subscription(3) },
    'https://fixture.test/config.ini': { body: ini },
    'https://fixture.test/huge.list': { body: ruleList(5000, 'big') },
  });
  try {
    const result = await callWorker(
      `target=clash&url=${enc('https://fixture.test/sub.yaml')}&config=${enc('https://fixture.test/config.ini')}`
    );
    assert.equal(result.status, 200);
    const count = (result.body.match(/big\d+\.test/g) ?? []).length;
    assert.ok(count >= 4000, `规则集应被展开，实际 ${count}`);
  } finally {
    restore();
  }
});

// ============================================================
// 上游响应形态异常
// ============================================================

test('错误路径：上游返回 HTML 而非 YAML 时给出明确错误', async () => {
  const restore = installFetchStub({
    'https://fixture.test/html.yaml': { body: '<!DOCTYPE html><html><body>login required</body></html>' },
  });
  try {
    const result = await callWorker(`target=clash&url=${enc('https://fixture.test/html.yaml')}`);
    assert.equal(result.status, 400);
    assert.match(result.body, /必须是 YAML 对象|未找到有效代理节点|不是有效的 YAML/);
  } finally {
    restore();
  }
});

test('错误路径：上游返回 base64 订阅（非 Clash 格式）时给出明确错误', async () => {
  const payload = Buffer.from('ss://YWVzLTEyOC1nY206cHc@a.example.com:443#node').toString('base64');
  const restore = installFetchStub({ 'https://fixture.test/b64.txt': { body: payload } });
  try {
    const result = await callWorker(`target=clash&url=${enc('https://fixture.test/b64.txt')}`);
    assert.equal(result.status, 400);
  } finally {
    restore();
  }
});

test('错误路径：订阅 proxies 字段类型错误时给出明确错误', async () => {
  const restore = installFetchStub({
    'https://fixture.test/badtype.yaml': { body: 'proxies: "not-an-array"\nrules:\n  - MATCH,DIRECT\n' },
  });
  try {
    const result = await callWorker(`target=clash&url=${enc('https://fixture.test/badtype.yaml')}`);
    assert.equal(result.status, 400);
    assert.match(result.body, /未找到有效代理节点/);
  } finally {
    restore();
  }
});

test('错误路径：rules 字段类型错误时返回 400', async () => {
  const restore = installFetchStub({
    'https://fixture.test/badrules.yaml': {
      body: subscription(2).replace('rules:\n  - MATCH,G', 'rules: "not-an-array"'),
    },
  });
  try {
    const result = await callWorker(`target=clash&url=${enc('https://fixture.test/badrules.yaml')}`);
    assert.equal(result.status, 400);
    assert.match(result.body, /rules 字段格式无效|不是有效的 YAML 配置/);
  } finally {
    restore();
  }
});
