// 离线测试台：同一端口同时提供 Prism 转换接口与夹具文件。
//
// 用途：不依赖真实订阅即可跑通「取订阅 → 转换 → 落盘」全流程。
// 前置：先执行 npm run lab:build 生成 lab-worker.mjs。
//
// 用法：
//   npm run lab:build && node test/lab/lab-server.mjs
//   bash test/lab/run-matrix.sh
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, 'fixtures');
const PORT = Number(process.env.LAB_PORT || 18787);
const HOST = '127.0.0.1';

const { default: app } = await import(join(HERE, 'lab-worker.mjs'));

const MIME = {
  '.yaml': 'text/yaml; charset=utf-8',
  '.ini': 'text/plain; charset=utf-8',
  '.list': 'text/plain; charset=utf-8',
};

async function handler(req, res) {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  if (url.pathname.startsWith('/fixtures/')) {
    const rel = url.pathname.slice('/fixtures/'.length).replace(/^rules\//, 'rule-');
    const file = join(FIXTURES, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': MIME[extname(file)] || 'application/octet-stream',
        'Content-Length': body.length,
      });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found');
    }
    return;
  }

  try {
    const headers = new Headers();
    for (const key of Object.keys(req.headers || {})) {
      const val = req.headers[key];
      if (val != null) headers.set(key, Array.isArray(val) ? val.join(', ') : String(val));
    }
    const webRes = await app.fetch(new Request(url.toString(), { method: req.method || 'GET', headers }));
    const body = Buffer.from(await webRes.arrayBuffer());
    res.writeHead(webRes.status, {
      'Content-Type': webRes.headers.get('content-type') || 'application/octet-stream',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`lab adapter error: ${err.message}`);
  }
}

createServer(handler).listen(PORT, HOST, () => {
  console.log(`lab server on http://${HOST}:${PORT}`);
});
