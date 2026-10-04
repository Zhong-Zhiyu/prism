// 为离线测试台准备可用的 Worker 产物。
//
// 转换器内置 SSRF 防护（src/worker.ts 的 isSafeUrl），会拒绝回环地址、
// localhost 与 *.internal 主机名。测试台需要让转换器抓取本机文件，
// 因此在**构建产物**上做字符串替换，不修改源码。
//
// 注意两个必须同时处理的点：
//   1. `host === "localhost"` 同时出现在「禁止 localhost」的判断里，
//      直接替换会把测试主机名写进禁止列表；
//   2. 该行后半段还有 `.localhost` / `.local` / `.internal` 后缀禁止，
//      `.internal` 会把测试主机名一并挡掉。
// 因此这里整行重写，只保留 `.local` 后缀禁止。
//
// 用法：npm run build && node test/lab/patch-lab.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', '..', 'dist', 'worker.js');
const OUT = join(HERE, 'lab-worker.mjs');

const src = readFileSync(SRC, 'utf8');

const result = src
  .replace('host === "localhost" || ', '')
  .replace('host.endsWith(".localhost") || ', '')
  .replace('host.endsWith(".local") || host.endsWith(".internal")', 'host.endsWith(".local")')
  .replace('if (/^(127|10|0)\\./.test(host)', 'if (/^(11|10|0)\\./.test(host)');

const checks = [
  ['禁止列表不再包含 localhost 判定', !result.includes('host === "localhost"')],
  ['后缀禁止只剩 .local', !result.includes('.internal")') && result.includes('host.endsWith(".local")')],
  ['127 网段已放行', !result.includes('/^(127|10|0)')],
  ['127 段判定已改写', result.includes('/^(11|10|0)\\./')],
];

let ok = true;
for (const [label, pass] of checks) {
  console.log(`  ${pass ? 'OK  ' : 'FAIL'} ${label}`);
  if (!pass) ok = false;
}
if (!ok) {
  console.error('补丁未完全生效，已中止');
  process.exit(1);
}

writeFileSync(OUT, result);
console.log(`lab bundle written: ${result.length} bytes`);
