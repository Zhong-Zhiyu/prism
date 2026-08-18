// ============================================================
// Clash YAML 订阅解析器
// ============================================================

import yaml from 'js-yaml';
import type { ClashConfig, ProxyGroup, ProxyNode } from '../utils/types';

const SUPPORTED_PROXY_TYPES = new Set([
  'ss', 'ssr', 'vmess', 'vless', 'trojan', 'hysteria2', 'http', 'socks5', 'snell', 'tuic',
]);

/**
 * 使用标准 YAML 解析器读取 Clash 配置，并拒绝不完整的代理节点。
 */
export function parseClashYaml(content: string): ClashConfig {
  if (content.length > 2 * 1024 * 1024) {
    throw new Error('订阅配置过大');
  }

  let parsed: unknown;
  try {
    parsed = yaml.load(content, { json: false });
  } catch {
    throw new Error('订阅不是有效的 YAML 配置');
  }

  if (!isRecord(parsed)) {
    throw new Error('订阅配置必须是 YAML 对象');
  }

  const proxies = parseProxies(parsed.proxies);
  if (proxies.length === 0) {
    throw new Error('订阅中未找到有效代理节点');
  }

  const result: ClashConfig = { ...parsed, proxies } as ClashConfig;
  if (parsed['proxy-groups'] !== undefined) {
    result['proxy-groups'] = parseProxyGroups(parsed['proxy-groups']);
  }
  if (parsed.rules !== undefined) {
    if (!Array.isArray(parsed.rules) || !parsed.rules.every(value => typeof value === 'string')) {
      throw new Error('订阅 rules 字段格式无效');
    }
    result.rules = parsed.rules as string[];
  }
  return result;
}

function parseProxies(value: unknown): ProxyNode[] {
  if (!Array.isArray(value)) return [];
  const proxies: ProxyNode[] = [];

  for (const item of value) {
    if (!isRecord(item)) continue;
    const name = item.name;
    const type = item.type;
    const server = item.server;
    const port = item.port;
    if (typeof name !== 'string' || !name.trim() || typeof type !== 'string' ||
      !SUPPORTED_PROXY_TYPES.has(type.toLowerCase()) || typeof server !== 'string' ||
      !server.trim() || !Number.isInteger(port) || port < 1 || port > 65535) {
      continue;
    }
    proxies.push({ ...item, name, type: type.toLowerCase(), server, port } as ProxyNode);
  }

  return proxies;
}

function parseProxyGroups(value: unknown): ProxyGroup[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap(item => {
    if (typeof item.name !== 'string' || !item.name.trim() || typeof item.type !== 'string') return [];
    const proxies = Array.isArray(item.proxies)
      ? item.proxies.filter((proxy): proxy is string => typeof proxy === 'string')
      : [];
    return [{ ...item, name: item.name, type: item.type, proxies } as ProxyGroup];
  });
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function extractProxyNames(config: ClashConfig): string[] {
  return config.proxies.map(proxy => proxy.name);
}
