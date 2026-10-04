// ============================================================
// Worker HTTP 层集成测试
//
// 直接在进程内驱动 Hono app，并用 fetch 桩替换上游抓取，
// 覆盖转换 API 的完整链路：参数解析、上游抓取、多 URL 合并、
// 响应头、错误分支与边界值。
//
// 用 fetch 桩而不是本地 HTTP 服务，是为了不改动 isSafeUrl 的 SSRF 防护
// （它会拒绝回环/内网地址，这是必须保留的安全行为）。
// ============================================================

import assert from 'node:assert/strict';
import test from 'node:test';
import app from '../src/worker';

// ============================================================
// 夹具
// ============================================================

const SUBSCRIPTION = `
mixed-port: 7890
allow-lan: false
log-level: info
dns:
  enable: true
  enhanced-mode: fake-ip
  nameserver: ['223.5.5.5']
proxies:
  - { name: n1, type: ss, server: a.example.com, port: 443, cipher: aes-128-gcm, password: pw, udp: true }
  - { name: n2, type: trojan, server: b.example.com, port: 443, password: pw }
  - { name: n3, type: anytls, server: c.example.com, port: 8443, password: pw, sni: c.example.com }
proxy-groups:
  - { name: G, type: select, proxies: [n1, n2, n3, DIRECT] }
rules:
  - DOMAIN-SUFFIX,example.com,G
  - MATCH,G
`;

const SECOND_SUBSCRIPTION = `
proxies:
  - { name: n4, type: vmess, server: d.example.com, port: 443, uuid: 11111111-2222-3333-4444-555555555555, alterId: 0 }
rules:
  - DOMAIN-SUFFIX,second-sub.test,DIRECT
`;

const RULE_LIST = ['DOMAIN-SUFFIX,rule-list.test', 'IP-CIDR,10.0.0.0/8,no-resolve'].join('\n');

const INI_CONFIG = [
  '[custom]',
  'custom_proxy_group=🚀 节点选择`select`.*',
  'ruleset=🚀 节点选择,https://fixture.test/rules.list',
  'ruleset=🚀 节点选择,[]FINAL',
].join('\n');

// ============================================================
// fetch 桩
// ============================================================

interface StubResponse {
  body?: string;
  status?: number;
  headers?: Record<string, string>;
}

type StubMap = Record<string, StubResponse>;

const realFetch = globalThis.fetch;

/** 用给定映射替换全局 fetch，返回恢复函数 */
function installFetchStub(routes: StubMap, fallback: StubResponse = { status: 404, body: 'not found' }): () => void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const stub = routes[url] ?? fallback;
    const status = stub.status ?? 200;
    const headers = new Headers(stub.headers ?? { 'Content-Type': 'text/plain; charset=utf-8' });
    return new Response(stub.body ?? '', { status, headers });
  }) as typeof globalThis.fetch;
  return () => { globalThis.fetch = realFetch; };
}

const BASE_ROUTES: StubMap = {
  'https://fixture.test/sub.yaml': { body: SUBSCRIPTION, headers: { 'Content-Type': 'text/yaml', 'subscription-userinfo': 'upload=1; download=2; total=3; expire=4' } },
  'https://fixture.test/sub2.yaml': { body: SECOND_SUBSCRIPTION, headers: { 'Content-Type': 'text/yaml' } },
  'https://fixture.test/rules.list': { body: RULE_LIST },
  'https://fixture.test/config.ini': { body: INI_CONFIG },
  'https://fixture.test/empty.yaml': { body: 'proxies: []' },
  'https://fixture.test/broken.yaml': { body: 'this is not: [valid yaml' },
  'https://fixture.test/no-proxies.yaml': { body: 'rules:\n  - MATCH,DIRECT\n' },
};

async function callWorker(query: string): Promise<{ status: number; headers: Headers; body: string }> {
  const response = await app.fetch(new Request(`http://worker.test/sub?${query}`));
  return { status: response.status, headers: response.headers, body: await response.text() };
}

// ============================================================
// 参数校验与错误分支
// ============================================================

test('Worker：缺少 url 参数返回 400', async () => {
  const result = await callWorker('target=clash');
  assert.equal(result.status, 400);
  assert.match(result.body, /缺少 url 参数/);
});

test('Worker：不支持的 target 返回 400', async () => {
  const result = await callWorker('target=unknown&url=https%3A%2F%2Ffixture.test%2Fsub.yaml');
  assert.equal(result.status, 400);
  assert.match(result.body, /不支持的 target/);
});

test('Worker：非法的 config 参数返回 400', async () => {
  const result = await callWorker('target=clash&url=https%3A%2F%2Ffixture.test%2Fsub.yaml&config=file%3A%2F%2F%2Fetc%2Fpasswd');
  assert.equal(result.status, 400);
  assert.match(result.body, /config 必须是安全的 HTTP\(S\) URL/);
});

test('Worker：非法正则返回 400', async () => {
  const result = await callWorker('target=clash&url=https%3A%2F%2Ffixture.test%2Fsub.yaml&include=%5B');
  assert.equal(result.status, 400);
  assert.match(result.body, /过滤正则表达式无效/);
});

test('Worker：非法 User-Agent 返回 400', async () => {
  const result = await callWorker(
    `target=clash&url=https%3A%2F%2Ffixture.test%2Fsub.yaml&ua=${encodeURIComponent('bad\nua')}`
  );
  assert.equal(result.status, 400);
  assert.match(result.body, /User-Agent 无效/);
});

test('Worker：超长参数返回 400', async () => {
  const result = await callWorker(
    `target=clash&url=https%3A%2F%2Ffixture.test%2Fsub.yaml&filename=${'x'.repeat(5000)}`
  );
  assert.equal(result.status, 400);
  assert.match(result.body, /filename 参数过长/);
});

test('Worker：SSRF 防护拒绝回环与内网地址', async () => {
  const targets = [
    'http://127.0.0.1:8080/sub.yaml',
    'http://localhost/sub.yaml',
    'http://192.168.1.1/sub.yaml',
    'http://10.0.0.1/sub.yaml',
    'http://172.16.0.1/sub.yaml',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/sub.yaml',
    'http://metadata.google.internal/x',
    'http://foo.local/x',
  ];
  const restore = installFetchStub(BASE_ROUTES);
  try {
    for (const target of targets) {
      const result = await callWorker(`target=clash&url=${encodeURIComponent(target)}`);
      assert.equal(result.status, 502, `应拒绝 ${target}`);
      assert.match(result.body, /下载或解析订阅失败/);
    }
  } finally {
    restore();
  }
});

test('Worker：超过 5 个订阅链接返回 400', async () => {
  const urls = Array.from({ length: 6 }, (_, index) => `url=https%3A%2F%2Ffixture.test%2Fs${index}.yaml`).join('&');
  const result = await callWorker(`target=clash&${urls}`);
  assert.equal(result.status, 400);
  assert.match(result.body, /最多支持 5 个订阅链接/);
});

// ============================================================
// 上游失败分支
// ============================================================

test('Worker：上游 404 返回 502', async () => {
  const restore = installFetchStub(BASE_ROUTES);
  try {
    const result = await callWorker('target=clash&url=https%3A%2F%2Ffixture.test%2Fmissing.yaml');
    assert.equal(result.status, 502);
  } finally {
    restore();
  }
});

test('Worker：订阅无有效节点返回 400', async () => {
  const restore = installFetchStub(BASE_ROUTES);
  try {
    for (const path of ['empty.yaml', 'no-proxies.yaml', 'broken.yaml']) {
      const result = await callWorker(`target=clash&url=${encodeURIComponent(`https://fixture.test/${path}`)}`);
      assert.equal(result.status, 400, `${path} 应返回 400`);
      assert.match(result.body, /未找到有效代理节点|不是有效的 YAML 配置|下载或解析订阅失败/);
    }
  } finally {
    restore();
  }
});

test('Worker：config 抓取失败返回 502', async () => {
  const restore = installFetchStub(BASE_ROUTES);
  try {
    const result = await callWorker(
      'target=clash&url=https%3A%2F%2Ffixture.test%2Fsub.yaml&config=https%3A%2F%2Ffixture.test%2Fmissing.ini'
    );
    assert.equal(result.status, 502);
    assert.match(result.body, /无法下载规则配置/);
  } finally {
    restore();
  }
});

test('Worker：规则集抓取失败仍能产出配置（占位注释）', async () => {
  const restore = installFetchStub({
    ...BASE_ROUTES,
    'https://fixture.test/config.ini': { body: INI_CONFIG.replace('https://fixture.test/rules.list', 'https://fixture.test/gone.list') },
  });
  try {
    const result = await callWorker(
      'target=clash&url=https%3A%2F%2Ffixture.test%2Fsub.yaml&config=https%3A%2F%2Ffixture.test%2Fconfig.ini'
    );
    assert.equal(result.status, 200);
    // 规则集不可用时，外部配置的 FINAL 仍然要输出兜底规则
    assert.match(result.body, /MATCH,🚀 节点选择/);
  } finally {
    restore();
  }
});

// ============================================================
// 成功路径：三种目标 + 响应头
// ============================================================

test('Worker：clash 目标成功转换并带完整响应头', async () => {
  const restore = installFetchStub(BASE_ROUTES);
  try {
    const result = await callWorker('target=clash&url=https%3A%2F%2Ffixture.test%2Fsub.yaml');
    assert.equal(result.status, 200);
    assert.match(result.headers.get('content-type') || '', /text\/yaml/);
    assert.equal(result.headers.get('access-control-allow-origin'), '*');
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(result.headers.get('referrer-policy'), 'no-referrer');
    // 上游的 subscription-userinfo 应透传
    assert.equal(result.headers.get('subscription-userinfo'), 'upload=1; download=2; total=3; expire=4');
    assert.equal(result.headers.get('profile-update-interval'), '24');
    // profile-title 是 Base64 编码的订阅名
    const title = result.headers.get('profile-title') || '';
    assert.equal(Buffer.from(title, 'base64').toString('utf8'), 'Prism');
    // 正文结构
    assert.match(result.body, /^proxies:/m);
    assert.match(result.body, /name: "n1"/);
    assert.match(result.body, /MATCH,G/);
  } finally {
    restore();
  }
});

test('Worker：singbox 目标产出可解析 JSON', async () => {
  const restore = installFetchStub(BASE_ROUTES);
  try {
    const result = await callWorker('target=singbox&url=https%3A%2F%2Ffixture.test%2Fsub.yaml');
    assert.equal(result.status, 200);
    assert.match(result.headers.get('content-type') || '', /application\/json/);
    const config = JSON.parse(result.body) as {
      outbounds?: { tag?: string; type?: string }[];
      route?: { final?: string };
      dns?: { servers?: { type?: string; address?: string }[] };
    };
    assert.ok(config.outbounds?.some(item => item.tag === 'n1'));
    assert.ok(config.outbounds?.some(item => item.tag === 'G'));
    assert.equal(config.route?.final, 'G');
    // DNS 必须是 1.14 新格式
    for (const server of config.dns?.servers ?? []) {
      assert.ok(typeof server.type === 'string');
      assert.equal('address' in server, false);
    }
  } finally {
    restore();
  }
});

test('Worker：surge 目标产出结构自洽的配置', async () => {
  const restore = installFetchStub(BASE_ROUTES);
  try {
    const result = await callWorker('target=surge&url=https%3A%2F%2Ffixture.test%2Fsub.yaml');
    assert.equal(result.status, 200);
    assert.match(result.body, /\[Proxy\]/);
    assert.match(result.body, /^n1 = ss, /m);
    assert.match(result.body, /^n3 = anytls, /m);
    assert.match(result.body, /^FINAL,/m);
  } finally {
    restore();
  }
});

test('Worker：filename 参数决定下载文件名', async () => {
  const restore = installFetchStub(BASE_ROUTES);
  try {
    const result = await callWorker(
      'target=clash&url=https%3A%2F%2Ffixture.test%2Fsub.yaml&filename=%E6%B5%8B%E8%AF%95%2F%E8%AE%A2%E9%98%85'
    );
    assert.equal(result.status, 200);
    const disposition = result.headers.get('content-disposition') || '';
    // 路径分隔符会被净化
    assert.match(disposition, /filename\*=UTF-8''/);
    assert.equal(disposition.includes('/'), false);
    const title = result.headers.get('profile-title') || '';
    assert.equal(Buffer.from(title, 'base64').toString('utf8'), '测试_订阅');
  } finally {
    restore();
  }
});

test('Worker：多订阅合并节点与规则', async () => {
  const restore = installFetchStub(BASE_ROUTES);
  try {
    const result = await callWorker(
      'target=clash&url=https%3A%2F%2Ffixture.test%2Fsub.yaml&url=https%3A%2F%2Ffixture.test%2Fsub2.yaml'
    );
    assert.equal(result.status, 200);
    assert.match(result.body, /name: "n1"/);
    assert.match(result.body, /name: "n4"/);
    assert.match(result.body, /second-sub\.test/);
  } finally {
    restore();
  }
});

test('Worker：外部配置替换策略组并保留订阅规则', async () => {
  const restore = installFetchStub(BASE_ROUTES);
  try {
    const result = await callWorker(
      'target=clash&url=https%3A%2F%2Ffixture.test%2Fsub.yaml&config=https%3A%2F%2Ffixture.test%2Fconfig.ini'
    );
    assert.equal(result.status, 200);
    // 外部配置定义的策略组
    assert.match(result.body, /name: "🚀 节点选择"/);
    // 规则集内容被展开
    assert.match(result.body, /DOMAIN-SUFFIX,rule-list\.test,🚀 节点选择/);
    assert.match(result.body, /IP-CIDR,10\.0\.0\.0\/8,🚀 节点选择,no-resolve/);
    assert.match(result.body, /MATCH,🚀 节点选择/);
  } finally {
    restore();
  }
});

test('Worker：include / exclude / rename 等参数生效', async () => {
  const restore = installFetchStub(BASE_ROUTES);
  try {
    const included = await callWorker(
      `target=clash&url=https%3A%2F%2Ffixture.test%2Fsub.yaml&include=${encodeURIComponent('^n[12]$')}`
    );
    assert.equal(included.status, 200);
    assert.match(included.body, /name: "n1"/);
    assert.match(included.body, /name: "n2"/);
    assert.equal(included.body.includes('name: "n3"'), false);

    const excluded = await callWorker(
      `target=clash&url=https%3A%2F%2Ffixture.test%2Fsub.yaml&exclude=${encodeURIComponent('n1')}`
    );
    assert.equal(excluded.status, 200);
    assert.equal(excluded.body.includes('name: "n1"'), false);
    assert.match(excluded.body, /name: "n2"/);

    const renamed = await callWorker(
      `target=clash&url=https%3A%2F%2Ffixture.test%2Fsub.yaml&rename=${encodeURIComponent('^n(\\d)$@node-$1')}`
    );
    assert.equal(renamed.status, 200);
    assert.match(renamed.body, /name: "node-1"/);
  } finally {
    restore();
  }
});

test('Worker：布尔参数解析（emoji / udp / tfo / dedup / expand）', async () => {
  const restore = installFetchStub(BASE_ROUTES);
  try {
    const off = await callWorker('target=clash&url=https%3A%2F%2Ffixture.test%2Fsub.yaml&udp=0&dedup=false');
    assert.equal(off.status, 200);

    const on = await callWorker('target=clash&url=https%3A%2F%2Ffixture.test%2Fsub.yaml&udp=1&tfo=1&scv=1');
    assert.equal(on.status, 200);
    assert.match(on.body, /tfo: true/);

    // 非法布尔值应回退到默认值而不是报错
    const bogus = await callWorker('target=clash&url=https%3A%2F%2Ffixture.test%2Fsub.yaml&udp=maybe');
    assert.equal(bogus.status, 200);
  } finally {
    restore();
  }
});

test('Worker：OPTIONS 预检返回 204 且带 CORS 头', async () => {
  const response = await app.fetch(new Request('http://worker.test/sub', { method: 'OPTIONS' }));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(response.headers.get('access-control-allow-methods'), 'GET, OPTIONS');
});

test('Worker：首页返回 HTML 且遵循主题 Cookie', async () => {
  const plain = await app.fetch(new Request('http://worker.test/'));
  assert.equal(plain.status, 200);
  assert.match(plain.headers.get('content-type') || '', /text\/html/);
  const plainHtml = await plain.text();
  // 未带 Cookie 时 html 标签上不应有 data-theme（内联脚本里出现该字符串是正常的）
  assert.match(plainHtml, /<html lang="zh-Hans">/);
  assert.equal(/<html[^>]*data-theme/.test(plainHtml), false);

  const dark = await app.fetch(new Request('http://worker.test/', {
    headers: { cookie: 'prism-theme=dark' },
  }));
  assert.match(await dark.text(), /<html lang="zh-Hans" data-theme="dark">/);

  const light = await app.fetch(new Request('http://worker.test/', {
    headers: { cookie: 'prism-theme=light' },
  }));
  assert.match(await light.text(), /<html lang="zh-Hans" data-theme="light">/);

  // 非法主题值应被忽略
  const bogus = await app.fetch(new Request('http://worker.test/', {
    headers: { cookie: 'prism-theme=neon' },
  }));
  assert.equal(/<html[^>]*data-theme/.test(await bogus.text()), false);
});
