// ============================================================
// Prism - Cloudflare Worker 入口
// 代理订阅转换工具的完整后端
// ============================================================

import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { parseClashYaml } from './parsers/yaml-parser';
import { dedupeRulesetEntries, parseIniConfig } from './parsers/ini-parser';
import { generateClashConfig } from './generators/clash';
import { generateSingboxConfig } from './generators/singbox';
import { generateSurgeConfig } from './generators/surge';
import type { ClashConfig, ConversionParams, OutputTarget, ParsedIniConfig } from './utils/types';
import { DEFAULT_PARAMS } from './utils/types';
import { FRONTEND_HTML } from './frontend/index';

const app = new Hono();

const MAX_SOURCE_URLS = 5;
const MAX_RULESET_URLS = 50;
const MAX_URL_LENGTH = 2048;
const MAX_PARAM_LENGTH = 4096;
const MAX_SUBSCRIPTION_BYTES = 2 * 1024 * 1024;
const MAX_CONFIG_BYTES = 512 * 1024;
const MAX_RULESET_BYTES = 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;
const FALLBACK_UA = 'clash-verge/v2.5.2';
const VERGE_LATEST_RELEASE_URL = 'https://github.com/clash-verge-rev/clash-verge-rev/releases/latest';
const VERGE_VERSION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const VERGE_VERSION_FAILURE_TTL_MS = 10 * 60 * 1000;
const VERGE_VERSION_TIMEOUT_MS = 5_000;

// ============================================================
// 路由：前端页面
// ============================================================
app.get('/', (c: Context) => {
  const theme = getCookie(c, 'prism-theme');
  if (theme === 'light' || theme === 'dark') {
    const html = FRONTEND_HTML.replace(
      '<html lang="zh-Hans">',
      `<html lang="zh-Hans" data-theme="${theme}">`
    );
    return c.html(html);
  }
  return c.html(FRONTEND_HTML);
});

// ============================================================
// 路由：订阅转换 API
// GET /sub?target=clash&url=...&config=...
// ============================================================
app.get('/sub', async (c: Context) => {
  try {
    const params = parseQueryParams(c);
    const validationError = validateParams(params);
    if (validationError) return errorResponse(c, validationError, 400);

    const urls = getSourceUrls(c);
    if (urls.length === 0) {
      return errorResponse(c, '错误：缺少 url 参数（原始订阅链接）', 400);
    }
    if (urls.length > MAX_SOURCE_URLS) {
      return errorResponse(c, `错误：最多支持 ${MAX_SOURCE_URLS} 个订阅链接`, 400);
    }

    let sourceConfig: ClashConfig;
    let upstreamUserInfo: string | null = null;

    try {
      const results: ClashConfig[] = [];
      for (let index = 0; index < urls.length; index++) {
        const response = await fetchTextSafe(urls[index], await buildUpstreamHeaders(c), MAX_SUBSCRIPTION_BYTES);
        if (!response.ok) {
          throw new Error(`订阅 ${index + 1} 返回 HTTP ${response.status}`);
        }
        if (!upstreamUserInfo) upstreamUserInfo = response.headers.get('subscription-userinfo');
        results.push(parseClashYaml(response.text));
      }
      sourceConfig = mergeConfigs(results);
    } catch (err) {
      console.error('下载或解析订阅失败:', (err as Error).message);
      return errorResponse(c, '错误：下载或解析订阅失败，请检查链接或稍后重试', 502);
    }

    if (!sourceConfig.proxies || sourceConfig.proxies.length === 0) {
      return errorResponse(c, '错误：订阅中未找到有效代理节点', 400);
    }

    // 获取外部规则配置
    let iniConfig: ParsedIniConfig = createDefaultIniConfig();
    const ruleContents: Record<string, string[]> = {};

    if (params.config) {
      try {
        const configResponse = await fetchTextSafe(params.config, await buildUpstreamHeaders(c), MAX_CONFIG_BYTES);
        if (!configResponse.ok) {
          return errorResponse(c, '错误：无法下载规则配置', 502);
        }
        const parsedConfig = parseIniConfig(configResponse.text);
        // 相同「策略组 + 规则集 URL」只保留一条，避免重复抓取与重复输出
        iniConfig = {
          ...parsedConfig,
          rulesetEntries: dedupeRulesetEntries(parsedConfig.rulesetEntries),
        };

        // 同一 URL 只抓取一次（可能被多个策略组引用）
        const ruleSetUrls: string[] = [];
        const seenUrls = new Set<string>();
        for (const entry of iniConfig.rulesetEntries) {
          if (entry.isSpecial || !entry.url || seenUrls.has(entry.url)) continue;
          seenUrls.add(entry.url);
          ruleSetUrls.push(entry.url);
        }

        const results = await mapWithConcurrency(ruleSetUrls.slice(0, MAX_RULESET_URLS), 3, async (url: string) => {
          try {
            const ruleResponse = await fetchTextSafe(url, await buildUpstreamHeaders(c), MAX_RULESET_BYTES);
            if (!ruleResponse.ok) return { url, lines: [] as string[] };
            return {
              url,
              lines: ruleResponse.text.split('\n')
                .map((line: string) => line.trim())
                .filter((line: string) => line && !line.startsWith('#') && !line.startsWith(';')),
            };
          } catch {
            return { url, lines: [] as string[] };
          }
        });
        for (const { url, lines } of results) ruleContents[url] = lines;
      } catch (err) {
        console.error('下载规则配置失败:', (err as Error).message);
        return errorResponse(c, '错误：无法下载或解析规则配置', 502);
      }
    }

    let output: string;
    let contentType: string;
    const cleanBase = sanitizeFilename(params.filename || 'Prism');

    switch (params.target) {
      case 'clash':
        output = generateClashConfig(sourceConfig, iniConfig, params, ruleContents);
        contentType = 'text/yaml; charset=utf-8';
        break;
      case 'singbox':
        output = generateSingboxConfig(sourceConfig, iniConfig, params, ruleContents);
        contentType = 'application/json; charset=utf-8';
        break;
      case 'surge':
        output = generateSurgeConfig(sourceConfig, iniConfig, params, ruleContents);
        contentType = 'text/plain; charset=utf-8';
        break;
      default:
        return errorResponse(c, '错误：不支持的 target 类型', 400);
    }

    const userInfoHeader = upstreamUserInfo && upstreamUserInfo.trim() !== ''
      ? upstreamUserInfo
      : 'upload=0; download=0; total=0; expire=0';
    const safeName = utf8ToBase64(cleanBase);

    return new Response(output, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(cleanBase)}`,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'subscription-userinfo': userInfoHeader,
        'profile-update-interval': '24',
        'profile-title': safeName,
      },
    });
  } catch (err) {
    console.error('转换异常:', (err as Error).message);
    return errorResponse(c, '内部错误：订阅转换失败', 500);
  }
});

// CORS 预检
app.options('/sub', (c: Context) => new Response(null, {
  status: 204,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  },
}));

function parseQueryParams(c: Context): ConversionParams {
  const q = c.req.query() as Record<string, string>;
  return {
    target: (q.target as OutputTarget) || DEFAULT_PARAMS.target,
    url: q.url || DEFAULT_PARAMS.url,
    config: q.config || undefined,
    include: q.include || undefined,
    exclude: q.exclude || undefined,
    rename: q.rename || undefined,
    filename: q.filename || undefined,
    emoji: parseBool(q.emoji) ?? DEFAULT_PARAMS.emoji,
    append_type: parseBool(q.append_type) ?? DEFAULT_PARAMS.append_type,
    tfo: parseBool(q.tfo) ?? DEFAULT_PARAMS.tfo,
    udp: parseBool(q.udp) ?? DEFAULT_PARAMS.udp,
    sort: parseBool(q.sort) ?? DEFAULT_PARAMS.sort,
    scv: parseBool(q.scv) ?? DEFAULT_PARAMS.scv,
    expand: parseBool(q.expand) ?? DEFAULT_PARAMS.expand,
    tls13: parseBool(q.tls13) ?? DEFAULT_PARAMS.tls13,
    dedup: parseBool(q.dedup) ?? DEFAULT_PARAMS.dedup,
    ua: q.ua || undefined,
  };
}

function getSourceUrls(c: Context): string[] {
  const values = c.req.queries('url') || [];
  if (values.length > 1) return values.map(value => value.trim()).filter(Boolean);
  if (values.length === 1) {
    const value = values[0].trim();
    if (!value.includes('|')) return [value];
    // 仅在每个分段本身都是合法 URL 时兼容旧版 | 分隔链接，避免破坏 URL 内的 |。
    const legacy = value.split('|').map(part => part.trim()).filter(Boolean);
    return legacy.length > 1 && legacy.every(isSafeUrl) ? legacy : [value];
  }
  return [];
}

async function buildUpstreamHeaders(c: Context): Promise<Record<string, string>> {
  const q = c.req.query() as Record<string, string>;
  const requested = (q.ua || '').trim();
  const ua = requested || (await resolveDefaultUa());
  return { 'User-Agent': ua };
}

// 模块级缓存：成功缓存 6 小时；失败短时间内直接回落，避免 GitHub 故障时每个请求都等待超时。
let vergeVersionCache: { ua: string; expires: number } | null = null;
let vergeVersionInFlight: Promise<string> | null = null;

async function resolveDefaultUa(): Promise<string> {
  if (vergeVersionCache && vergeVersionCache.expires > Date.now()) return vergeVersionCache.ua;
  if (!vergeVersionInFlight) {
    vergeVersionInFlight = fetchLatestVergeTag()
      .then(tag => {
        vergeVersionCache = { ua: `clash-verge/${tag}`, expires: Date.now() + VERGE_VERSION_CACHE_TTL_MS };
        return vergeVersionCache.ua;
      })
      .catch(err => {
        console.error('获取 Clash Verge 最新版本失败，使用回退 UA:', (err as Error).message);
        vergeVersionCache = { ua: FALLBACK_UA, expires: Date.now() + VERGE_VERSION_FAILURE_TTL_MS };
        return FALLBACK_UA;
      })
      .finally(() => { vergeVersionInFlight = null; });
  }
  return vergeVersionInFlight;
}

// 走 releases/latest 的 302 重定向取版本号，而非 api.github.com（未认证 API 有 60 次/小时/IP 限额，
// 在 Workers/Vercel 共享出口 IP 上极易触发）。
async function fetchLatestVergeTag(): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERGE_VERSION_TIMEOUT_MS);
  try {
    const response = await fetch(VERGE_LATEST_RELEASE_URL, {
      headers: { 'User-Agent': FALLBACK_UA },
      redirect: 'manual',
      signal: controller.signal,
    });
    if (response.status < 300 || response.status >= 400) {
      throw new Error(`GitHub 返回意外状态码 ${response.status}`);
    }
    const tag = parseVergeTagFromLocation(response.headers.get('location') || '');
    if (!tag) throw new Error('无法从重定向地址解析版本号');
    return tag;
  } finally {
    clearTimeout(timer);
  }
}

export function parseVergeTagFromLocation(location: string): string | null {
  const match = location.match(/\/tag\/(v\d+(?:\.\d+){0,3})$/);
  return match ? match[1] : null;
}

function validateParams(params: ConversionParams): string | null {
  if (!['clash', 'singbox', 'surge'].includes(params.target)) return '错误：不支持的 target 类型';
  for (const [name, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.length > MAX_PARAM_LENGTH) return `错误：${name} 参数过长`;
  }
  if (params.config && !isSafeUrl(params.config)) return '错误：config 必须是安全的 HTTP(S) URL';
  if (params.ua && !/^[^\r\n]{1,256}$/.test(params.ua)) return '错误：User-Agent 无效';
  for (const pattern of [params.include, params.exclude]) {
    if (pattern) {
      try { new RegExp(pattern); } catch { return '错误：过滤正则表达式无效'; }
    }
  }
  return null;
}

function isSafeUrl(raw: string): boolean {
  if (!raw || raw.length > MAX_URL_LENGTH || /[\r\n]/.test(raw)) return false;
  let url: URL;
  try { url = new URL(raw); } catch { return false; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (host === 'metadata.google.internal' || host === '169.254.169.254') return false;
  if (/^(127|10|0)\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return false;
  const match = host.match(/^172\.(\d{1,3})\./);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return false;
  if (/^(::1|fc|fd|fe8|fe9|fea|feb)/i.test(host)) return false;
  return true;
}

async function fetchTextSafe(rawUrl: string, headers: Record<string, string>, maxBytes: number, redirects = 0): Promise<{ ok: boolean; status: number; headers: Headers; text: string }> {
  if (!isSafeUrl(rawUrl)) throw new Error('目标 URL 不被允许');
  if (redirects > MAX_REDIRECTS) throw new Error('重定向次数过多');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(rawUrl, { headers, redirect: 'manual', signal: controller.signal });
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location) throw new Error('上游重定向缺少目标');
    const next = new URL(location, rawUrl).toString();
    return fetchTextSafe(next, headers, maxBytes, redirects + 1);
  }

  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxBytes) throw new Error('上游响应过大');
  const text = await readBodyWithLimit(response, maxBytes, FETCH_TIMEOUT_MS);
  return { ok: response.ok, status: response.status, headers: response.headers, text };
}

async function readBodyWithLimit(response: Response, maxBytes: number, timeoutMs: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('上游响应超时')), timeoutMs);
  });

  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('上游响应过大');
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(merged);
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function errorResponse(c: Context, message: string, status: 400 | 500 | 502): Response {
  return c.text(message, status, {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
}

function parseBool(value: string | undefined): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  const lower = value.toLowerCase();
  if (lower === 'true' || lower === '1') return true;
  if (lower === 'false' || lower === '0') return false;
  return undefined;
}

function mergeConfigs(configs: ClashConfig[]): ClashConfig {
  const base = configs[0];
  const allProxies = configs.flatMap(config => config.proxies || []);
  const seenProxies = new Set<string>();
  const proxies = allProxies.filter(proxy => {
    if (seenProxies.has(proxy.name)) return false;
    seenProxies.add(proxy.name);
    return true;
  });

  const groupMap = new Map<string, any>();
  for (const config of configs) {
    for (const group of config['proxy-groups'] || []) {
      const current = groupMap.get(group.name);
      if (!current) {
        groupMap.set(group.name, { ...group, proxies: [...(group.proxies || [])] });
      } else {
        current.proxies = [...new Set([...(current.proxies || []), ...(group.proxies || [])])];
      }
    }
  }

  const rules = [...new Set(configs.flatMap(config => config.rules || []))];
  const dns = Object.assign({}, ...configs.map(config => config.dns || {}));
  const hosts = Object.assign({}, ...configs.map(config => config.hosts || {}));
  const merged: ClashConfig = { ...base, proxies };
  if (groupMap.size > 0) merged['proxy-groups'] = [...groupMap.values()];
  if (rules.length > 0) merged.rules = rules;
  if (Object.keys(dns).length > 0) merged.dns = dns;
  if (Object.keys(hosts).length > 0) merged.hosts = hosts;
  return merged;
}

function createDefaultIniConfig(): ParsedIniConfig {
  return {
    rulesetEntries: [],
    customProxyGroups: [{ name: '🚀 节点选择', groupType: 'select', proxies: ['.*'] }],
    enableRuleGenerator: false,
    overwriteOriginalRules: false,
  };
}

function sanitizeFilename(value: string): string {
  return value.replace(/[\r\n\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 120) || 'Prism';
}

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export default app;
