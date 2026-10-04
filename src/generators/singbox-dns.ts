// ============================================================
// Clash DNS 配置 → sing-box 1.14 DNS 配置
//
// sing-box 1.12 起旧的 address 描述格式废弃，1.14 起彻底移除，
// 因此这里必须输出新格式：{"type":"tls","server":"1.1.1.1"}。
// 旧 DNS 服务端格式与 Clash 的 enhanced-mode / nameserver / fallback
// 等字段在 sing-box 中根本不存在，直接透传会导致内核拒绝加载。
// ============================================================

/** sing-box 1.14 DNS 服务端对象 */
export interface SingboxDnsServer {
  type: string;
  tag?: string;
  server?: string;
  server_port?: number;
  path?: string;
  domain_resolver?: string;
  detour?: string;
  inet4_range?: string;
  inet6_range?: string;
}

/** DNS 转换结果 */
export interface SingboxDnsResult {
  dns: Record<string, unknown> | null;
  /** 供 route.default_domain_resolver 使用的解析器 tag */
  domainResolverTag?: string;
  /** 需要做为 bootstrap 直连的解析器 tag */
  bootstrapTags: string[];
  warnings: string[];
}

const IPV4_LITERAL = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const IPV6_LITERAL = /^[0-9a-f:]+$/i;

/** 把一个 Clash DNS 地址解析为 sing-box DNS 服务端对象 */
export function parseDnsServerAddress(raw: string): SingboxDnsServer | null {
  const value = String(raw || '').trim();
  if (!value) return null;

  if (value === 'local' || value === 'system') return { type: 'local' };
  if (value === 'fakeip') return { type: 'fakeip' };
  if (value === 'dhcp://auto' || value === 'dhcp') return { type: 'dhcp' };

  const dhcpInterface = value.match(/^dhcp:\/\/(.+)$/i);
  if (dhcpInterface) return { type: 'dhcp', server: dhcpInterface[1] };

  const url = value.match(/^(https?|tls|quic|h3|tcp|udp):\/\/(.+)$/i);
  if (url) {
    const scheme = url[1].toLowerCase();
    const rest = url[2];
    const slash = rest.indexOf('/');
    const hostPart = slash === -1 ? rest : rest.slice(0, slash);
    const path = slash === -1 ? undefined : rest.slice(slash);
    const { host, port } = splitHostPort(hostPart);

    // https://dns.google/dns-query 的 path 必须带上，否则 DoH 请求会 404
    if (scheme === 'https' || scheme === 'http') {
      const server: SingboxDnsServer = { type: 'https', server: host };
      if (port !== undefined) server.server_port = port;
      server.path = path && path !== '/' ? path : '/dns-query';
      return server;
    }
    if (scheme === 'h3') {
      const server: SingboxDnsServer = { type: 'h3', server: host };
      if (port !== undefined) server.server_port = port;
      server.path = path && path !== '/' ? path : '/dns-query';
      return server;
    }
    const typeMap: Record<string, string> = { tls: 'tls', quic: 'quic', tcp: 'tcp', udp: 'udp' };
    const server: SingboxDnsServer = { type: typeMap[scheme], server: host };
    if (port !== undefined) server.server_port = port;
    return server;
  }

  const { host, port } = splitHostPort(value);
  if (IPV4_LITERAL.test(host) || IPV6_LITERAL.test(host)) {
    const server: SingboxDnsServer = { type: 'udp', server: host };
    if (port !== undefined) server.server_port = port;
    return server;
  }
  // 裸域名在 sing-box 中无效，必须带协议
  return null;
}

function splitHostPort(value: string): { host: string; port?: number } {
  const trimmed = value.replace(/^\[|\]$/g, '');
  // IPv6 字面量：[::1]:53 或 ::1
  const bracketed = value.match(/^\[([^\]]+)\](?::(\d+))?$/);
  if (bracketed) {
    return { host: bracketed[1], port: bracketed[2] ? Number(bracketed[2]) : undefined };
  }
  const parts = trimmed.split(':');
  if (parts.length === 2 && /^\d+$/.test(parts[1])) {
    return { host: parts[0], port: Number(parts[1]) };
  }
  return { host: trimmed };
}

/**
 * 把 Clash 的 dns 段转换成 sing-box 1.14 的 dns 段。
 *
 * 只保留语义等价的部分，其余（enhanced-mode、fallback、use-hosts 等
 * Clash 专有字段）显式丢弃并记入 warnings，避免内核因未知字段拒绝加载。
 */
export function convertClashDnsToSingbox(
  clashDns: unknown,
  options: { proxyDetour?: string; requireDns?: boolean } = {}
): SingboxDnsResult {
  const warnings: string[] = [];
  const src = (clashDns && typeof clashDns === 'object' ? clashDns : {}) as Record<string, unknown>;

  const servers: SingboxDnsServer[] = [];
  const tags = new Set<string>();
  const bootstrapTags: string[] = [];

  const addServer = (server: SingboxDnsServer | null, tag: string, bootstrap = false): string | undefined => {
    if (!server) return undefined;
    let finalTag = tag;
    let suffix = 2;
    while (tags.has(finalTag)) finalTag = `${tag}-${suffix++}`;
    tags.add(finalTag);
    server.tag = finalTag;
    if (bootstrap) bootstrapTags.push(finalTag);
    servers.push(server);
    return finalTag;
  };

  // ---- 本地解析器：始终提供，用于 private / 局域网域名 ----
  addServer({ type: 'local' }, 'local');

  // ---- default-nameserver：bootstrap，必须直连 ----
  const defaultNs = toStringArray(src['default-nameserver']);
  defaultNs.forEach((entry, index) => {
    addServer(parseDnsServerAddress(entry), `bootstrap-${index + 1}`, true);
  });

  // ---- nameserver / fallback：主力解析器 ----
  let primaryTag: string | undefined;
  const primaryList = toStringArray(src.nameserver);
  primaryList.forEach((entry, index) => {
    const tag = addServer(parseDnsServerAddress(entry), index === 0 ? 'remote' : `remote-${index + 1}`);
    if (index === 0) primaryTag = tag;
  });

  const fallbackList = toStringArray(src.fallback);
  fallbackList.forEach((entry, index) => {
    addServer(parseDnsServerAddress(entry), `fallback-${index + 1}`);
  });

  // ---- proxy-server-nameserver：解析代理服务器域名时使用 ----
  const proxyNs = toStringArray(src['proxy-server-nameserver']);
  const proxyNsTag = addServer(parseDnsServerAddress(proxyNs[0] || ''), 'proxy-nameserver', true);

  // ---- fake-ip ----
  const enhancedMode = String(src['enhanced-mode'] || '').toLowerCase();
  const fakeIpEnabled = enhancedMode === 'fake-ip';
  const fakeIpRange = String(src['fake-ip-range'] || '').trim();
  const fakeIpFilter = toStringArray(src['fake-ip-filter']);
  const cacheSize = typeof src['cache-size'] === 'number' ? src['cache-size'] : undefined;

  const hasContent = servers.length > 1 || primaryList.length > 0 || fallbackList.length > 0
    || fakeIpEnabled || defaultNs.length > 0 || proxyNs.length > 0;

  if (!hasContent) {
    if (!options.requireDns) return { dns: null, bootstrapTags, warnings };
    // 源订阅未提供 DNS：给出一份保守可用的默认配置
    servers.length = 0;
    tags.clear();
    bootstrapTags.length = 0;
    addServer({ type: 'local' }, 'local');
    const bootstrap = addServer(parseDnsServerAddress('223.5.5.5'), 'bootstrap-1', true);
    const remote = addServer(parseDnsServerAddress('https://1.1.1.1/dns-query'), 'remote');
    if (bootstrap && remote) {
      const target = servers.find(server => server.tag === remote);
      if (target) target.domain_resolver = bootstrap;
    }
    primaryTag = remote;
  }

  const rules: Record<string, unknown>[] = [];

  // 局域网域名走本地解析器。
  // 注意：sing-box 1.14 的 DNS 规则里 ip_is_private / ip_cidr 属于「响应匹配字段」，
  // 需要前置 evaluate action 才能使用，因此这里只做域名字面量匹配。
  rules.push({ domain_suffix: ['.local', '.lan', '.home.arpa', '.internal'], server: 'local' });

  // fake-ip 由独立 DNS 服务端承担，A/AAAA 查询才分配虚拟地址
  if (fakeIpEnabled) {
    rules.push({ query_type: ['A', 'AAAA'], action: 'route', server: 'fakeip' });
  }

  if (fakeIpEnabled && fakeIpFilter.length > 0) {
    const domain: string[] = [];
    const domainSuffix: string[] = [];
    for (const entry of fakeIpFilter) {
      const value = entry.trim();
      if (!value) continue;
      if (value.startsWith('+.') || value.startsWith('*.')) domainSuffix.push(value.slice(2));
      else if (value.startsWith('.')) domainSuffix.push(value.slice(1));
      else domain.push(value);
    }
    // fake-ip-filter 的语义是「这些域名不要分配 fake-ip」，用返回真实地址的解析器即可
    const filterRule: Record<string, unknown> = { query_type: ['A', 'AAAA'], action: 'route', server: 'local' };
    if (domain.length > 0) filterRule.domain = domain;
    if (domainSuffix.length > 0) filterRule.domain_suffix = domainSuffix;
    if (filterRule.domain || filterRule.domain_suffix) rules.push(filterRule);
  }

  // nameserver-policy → DNS 规则
  const policy = src['nameserver-policy'];
  if (policy && typeof policy === 'object') {
    for (const [key, value] of Object.entries(policy as Record<string, unknown>)) {
      const target = Array.isArray(value) ? String(value[0] || '') : String(value || '');
      const parsed = parseDnsServerAddress(target);
      if (!parsed) continue;
      const tag = addServer(parsed, `policy-${servers.length + 1}`);
      const list = key.split(',').map(part => part.trim()).filter(Boolean);
      const exact: string[] = [];
      const suffix: string[] = [];
      for (const item of list) {
        if (item.startsWith('+.') || item.startsWith('*.')) suffix.push(item.slice(2));
        else if (item.startsWith('.')) suffix.push(item.slice(1));
        else exact.push(item);
      }
      const rule: Record<string, unknown> = { action: 'route', server: tag };
      if (exact.length > 0) rule.domain = exact;
      if (suffix.length > 0) rule.domain_suffix = suffix;
      rules.push(rule);
    }
  }

  if (fallbackList.length > 0) {
    warnings.push('Clash dns.fallback 在 sing-box 中没有等价物，已作为备用服务端加入');
  }
  if (src['fallback-filter'] !== undefined) {
    warnings.push('Clash dns.fallback-filter 在 sing-box 中没有等价物，已忽略');
  }
  if (src['use-hosts'] !== undefined) {
    warnings.push('Clash dns.use-hosts 在 sing-box 中没有等价物，已忽略');
  }
  if (src['respect-rules'] !== undefined && !options.proxyDetour) {
    warnings.push('Clash dns.respect-rules 需要代理出站才能映射为 detour，已忽略');
  }

  if (src.enable === false) {
    warnings.push('Clash dns.enable = false，已省略 sing-box dns 段');
    return { dns: null, bootstrapTags, warnings };
  }

  // fake-ip 服务端：sing-box 1.14 起必须是独立服务端，顶层 dns.fakeip 已移除
  if (fakeIpEnabled) {
    const fakeipServer: Record<string, unknown> = { type: 'fakeip', tag: 'fakeip' };
    if (fakeIpRange) fakeipServer.inet4_range = normalizeFakeIpRange(fakeIpRange);
    servers.push(fakeipServer as unknown as (typeof servers)[number]);
  }

  const dns: Record<string, unknown> = { servers, rules };
  if (primaryTag) dns.final = primaryTag;
  if (cacheSize !== undefined) dns.cache_capacity = cacheSize;

  // 解析器自身需要 domain_resolver 才能解析 DoH/DoT 服务器域名
  const bootstrapForResolvers = bootstrapTags[0] || proxyNsTag;
  if (bootstrapForResolvers) {
    for (const server of servers) {
      if (server.type === 'udp' || server.type === 'local' || server.type === 'dhcp' || server.type === 'fakeip') continue;
      if (server.domain_resolver) continue;
      server.domain_resolver = bootstrapForResolvers;
    }
  }

  // respect-rules 语义：DNS 走代理解析
  if (src['respect-rules'] === true && options.proxyDetour) {
    for (const server of servers) {
      if (server.type === 'local' || server.type === 'fakeip' || server.type === 'dhcp') continue;
      if (bootstrapTags.includes(server.tag || '')) continue;
      server.detour = options.proxyDetour;
    }
  }

  return { dns, domainResolverTag: primaryTag || bootstrapTags[0], bootstrapTags, warnings };
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => String(item)).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

/**
 * Clash 允许把 fake-ip-range 写成单个地址（198.18.0.1/16），
 * sing-box 要求写成网段（198.18.0.0/16），这里做归一化。
 */
export function normalizeFakeIpRange(value: string): string {
  const match = value.trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
  if (!match) return value.trim();
  const octets = match[1].split('.').map(part => Number(part));
  const prefix = Number(match[2]);
  if (octets.some(octet => !Number.isFinite(octet) || octet > 255) || prefix > 32) return value.trim();
  const net = octets.reduce((acc, octet) => (acc * 256) + octet, 0) >>> 0;
  const shift = 32 - prefix;
  const masked = prefix === 0 ? 0 : ((net >>> shift) << shift) >>> 0;
  const out = [(masked >>> 24) & 255, (masked >>> 16) & 255, (masked >>> 8) & 255, masked & 255];
  return `${out.join('.')}/${prefix}`;
}
