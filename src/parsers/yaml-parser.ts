// ============================================================
// Clash YAML 订阅解析器
// ============================================================

import yaml from 'js-yaml';
import type { ClashConfig, ProxyGroup, ProxyNode } from '../utils/types';
import { MIHOMO_PROXY_TYPES, describeDroppedTypes } from '../utils/target-support';

/**
 * 上游在客户端 UA 过旧时可能只下发占位节点，节点名通常是「只显示 / 更新客户端」这类提示。
 * 这里仅用于日志提示，不会过滤或改写订阅内容。
 */
const PLACEHOLDER_NODE_PATTERN = /只显示|更新客户端|outdated client|update (?:your |the )?client/i;

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
  const droppedTypes = new Map<string, number>();
  let placeholderCount = 0;

  for (const item of value) {
    if (!isRecord(item)) continue;
    const name = item.name;
    const type = item.type;
    const server = item.server;
    const port = item.port;
    const normalizedType = typeof type === 'string' ? type.trim().toLowerCase() : '';
    if (typeof name !== 'string' || !name.trim() ||
      !normalizedType || !MIHOMO_PROXY_TYPES.has(normalizedType) || typeof server !== 'string' ||
      !server.trim() || !Number.isInteger(port) || port < 1 || port > 65535) {
      if (normalizedType && !MIHOMO_PROXY_TYPES.has(normalizedType)) {
        droppedTypes.set(normalizedType, (droppedTypes.get(normalizedType) ?? 0) + 1);
      }
      continue;
    }
    if (PLACEHOLDER_NODE_PATTERN.test(name)) placeholderCount++;
    proxies.push({ ...item, name, type: normalizedType, server, port } as ProxyNode);
  }

  if (droppedTypes.size > 0) {
    console.warn(`[Prism] 已忽略不支持的节点类型: ${describeDroppedTypes(droppedTypes)}`);
  }
  if (placeholderCount > 0) {
    if (placeholderCount === proxies.length) {
      console.warn(
        `[Prism] 订阅中仅包含 ${placeholderCount} 个疑似占位节点，` +
        '上游可能因客户端 UA 过旧未下发真实节点，可用 ua 参数指定客户端版本'
      );
    } else {
      console.warn(
        `[Prism] 订阅中包含 ${placeholderCount} 个疑似占位节点，` +
        '可用 exclude 参数过滤，或用 ua 参数指定客户端版本'
      );
    }
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
