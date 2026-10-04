// ============================================================
// Surge 产物结构校验
//
// Surge 只在 Apple 平台运行，无法在 CI/WSL 内做运行时验证，
// 因此这里依据官方 profile 文档（manual.nssurge.com/policies/*）做三项检查：
//   1. 语法：每个 [Proxy] 行符合该协议的官方语法（含位置参数规则）
//   2. 参数白名单：未知参数名直接报错（官方文档没有的 key 通常是拼写错误）
//   3. 引用一致性：策略组与规则引用的每个策略名都必须已定义
// ============================================================

/** 官方文档给出的协议参数：必需项与可选项 */
const PROTOCOL_SPECS: Record<string, { required: string[]; optional: string[] }> = {
  // 参数清单来自官方 /policies/*.html
  ss: { required: ['encrypt-method', 'password'], optional: ['obfs', 'obfs-host'] },
  snell: {
    required: ['psk', 'version'],
    optional: ['obfs', 'obfs-host', 'obfs-uri', 'reuse', 'dns-ip-preference', 'mode', 'unsafe-raw', 'unshaped'],
  },
  vmess: { required: ['username'], optional: ['ws', 'ws-path', 'ws-headers', 'encrypt-method', 'vmess-aead'] },
  trojan: { required: ['password'], optional: ['ws', 'ws-path', 'ws-headers'] },
  tuic: { required: ['token'], optional: [] },
  'tuic-v5': { required: ['uuid', 'password'], optional: [] },
  hysteria2: {
    required: ['password'],
    optional: ['download-bandwidth', 'salamander-password', 'gecko-password', 'port-hopping', 'port-hopping-interval'],
  },
  anytls: { required: ['password'], optional: ['reuse'] },
  ssh: { required: ['username'], optional: ['password', 'private-key', 'idle-timeout', 'server-fingerprint'] },
  http: { required: [], optional: ['headers'] },
  https: { required: [], optional: ['headers'] },
  'h2-connect': { required: [], optional: ['headers'] },
  socks5: { required: [], optional: [] },
  'socks5-tls': { required: [], optional: [] },
  wireguard: { required: ['section-name'], optional: ['ecn', 'test-timeout'] },
  external: { required: ['exec'], optional: ['args', 'local-port', 'addresses'] },
};

/** 所有协议通用的可选参数（见 /policies/parameters.html 与 /policies/tls.html） */
const COMMON_PARAMS = new Set([
  'udp-relay', 'tfo', 'ecn', 'skip-cert-verify', 'test-url', 'test-udp', 'proxy-test-url',
  'proxy-test-udp', 'internet-test-url', 'test-timeout', 'interface', 'allow-other-interface',
  'underlying-proxy', 'sni', 'alpn', 'tls', 'reuse', 'shadow-tls-password', 'shadow-tls-version',
  'shadow-tls-sni', 'client-cert', 'server-cert-verify-name', 'server-cert-fingerprint',
  'idle-timeout', 'ip-version',
]);

/** 允许位置参数（用户名 / 密码）的协议及其上限 */
const POSITIONAL_LIMITS: Record<string, number> = {
  http: 2, https: 2, socks5: 2, 'socks5-tls': 2, 'h2-connect': 0,
};

/** 取值为逗号列表的参数：逗号属于取值本身 */
const LIST_VALUED = new Set(['alpn', 'ws-headers', 'headers', 'allowed-ips']);

const GROUP_TYPES = new Set(['select', 'url-test', 'fallback', 'load-balance', 'smart', 'subnet']);
const GROUP_PARAMS = new Set([
  'url', 'interval', 'tolerance', 'timeout', 'evaluate-before-use', 'icon-url', 'policy-path',
  'update-interval', 'no-alert', 'hidden', 'external-policy-modifier', 'underlying-proxy',
  'category', 'test-timeout', 'persistent',
]);
const BUILTIN_POLICIES = new Set([
  'DIRECT', 'REJECT', 'REJECT-TLS', 'REJECT-DROP', 'REJECT-NO-DROP', 'PASS', 'COMPATIBLE',
]);
const RULE_TYPES = new Set([
  'DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'DOMAIN-WILDCARD', 'DOMAIN-SET', 'IP-CIDR',
  'IP-CIDR6', 'IP-ASN', 'IP-SUFFIX', 'GEOIP', 'SRC-IP', 'SRC-PORT', 'DST-PORT', 'IN-PORT',
  'PROTOCOL', 'USER-AGENT', 'URL-REGEX', 'PROCESS-NAME', 'SUBNET', 'RULE-SET', 'AND', 'OR',
  'NOT', 'FINAL', 'DEST-PORT', 'SCRIPT',
]);
const KNOWN_SECTIONS = new Set([
  'General', 'Proxy', 'Proxy Group', 'Rule', 'Host', 'URL Rewrite', 'Header Rewrite',
  'Body Rewrite', 'Map Local', 'MITM', 'Keystore', 'SSID Setting', 'Script', 'Panel',
  'Ponte', 'Port Forwarding', 'Testing', 'DHCP', 'Snell Server', 'MTProto',
]);

export interface SurgeCheckResult {
  errors: string[];
  warnings: string[];
  proxyCount: number;
  groupCount: number;
  ruleCount: number;
}

/** 按逗号切分，忽略转义逗号，并把列表型取值的后续片段合并回去 */
export function splitSurgeFields(value: string): string[] {
  const raw: string[] = [];
  let buffer = '';
  let escaped = false;
  let quoted = false;

  for (const char of value) {
    if (escaped) {
      buffer += char;
      escaped = false;
    } else if (char === '\\') {
      buffer += char;
      escaped = true;
    } else if (char === '"') {
      quoted = !quoted;
      buffer += char;
    } else if (char === ',' && !quoted) {
      raw.push(buffer);
      buffer = '';
    } else {
      buffer += char;
    }
  }
  raw.push(buffer);

  const merged: string[] = [];
  for (const part of raw.map(item => item.trim())) {
    if (merged.length > 0 && part && !part.includes('=')) {
      const previous = merged[merged.length - 1];
      const key = previous.includes('=') ? previous.split('=', 1)[0].trim().toLowerCase() : '';
      if (LIST_VALUED.has(key)) {
        merged[merged.length - 1] = `${previous},${part}`;
        continue;
      }
    }
    merged.push(part);
  }
  return merged;
}

function splitSections(text: string): Record<string, string[]> {
  const sections: Record<string, string[]> = {};
  let current: string | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('[') && line.endsWith(']')) {
      current = line.slice(1, -1);
      if (!sections[current]) sections[current] = [];
      continue;
    }
    if (!current || !line) continue;
    if (line.startsWith('#') || line.startsWith(';') || line.startsWith('//')) continue;
    sections[current].push(line);
  }
  return sections;
}

/** 校验 Surge 产物：语法、参数白名单、引用一致性 */
export function checkSurgeConfig(text: string): SurgeCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sections = splitSections(text);

  // ---- [Proxy] ----
  const proxies = new Set<string>();
  for (const line of sections.Proxy ?? []) {
    const eq = line.indexOf('=');
    if (eq === -1) {
      errors.push(`[Proxy] 行缺少 =: ${line.slice(0, 70)}`);
      continue;
    }
    const name = line.slice(0, eq).trim();
    const fields = splitSurgeFields(line.slice(eq + 1));
    const type = (fields[0] ?? '').trim().toLowerCase();
    const spec = PROTOCOL_SPECS[type];
    if (!spec) {
      errors.push(`[Proxy] ${name}: 未知协议类型 ${type}`);
      continue;
    }
    if (fields.length < 3) {
      errors.push(`[Proxy] ${name}: 缺少 host/port`);
      continue;
    }
    const port = (fields[2] ?? '').trim();
    if (!/^\d+$/.test(port) || Number(port) <= 0 || Number(port) > 65535) {
      errors.push(`[Proxy] ${name}: 端口非法 "${port}"`);
    }

    const keys = new Set<string>();
    let positional = 0;
    for (const token of fields.slice(3)) {
      if (!token) continue;
      if (token.includes('=')) keys.add(token.split('=', 1)[0].trim().toLowerCase());
      else positional++;
    }

    const allowed = new Set([...spec.required, ...spec.optional, ...COMMON_PARAMS]);
    for (const key of keys) {
      if (!allowed.has(key)) errors.push(`[Proxy] ${name} (${type}): 未知参数 "${key}"`);
    }
    for (const key of spec.required) {
      if (!keys.has(key)) errors.push(`[Proxy] ${name} (${type}): 缺少必需参数 "${key}"`);
    }
    const limit = POSITIONAL_LIMITS[type] ?? 0;
    if (positional > limit) {
      errors.push(`[Proxy] ${name} (${type}): 位置参数过多（${positional} > ${limit}）`);
    }
    proxies.add(name);
  }

  // ---- [Proxy Group] ----
  const groups = new Map<string, string[]>();
  for (const line of sections['Proxy Group'] ?? []) {
    const eq = line.indexOf('=');
    if (eq === -1) {
      errors.push(`[Proxy Group] 行缺少 =: ${line.slice(0, 70)}`);
      continue;
    }
    const name = line.slice(0, eq).trim();
    const fields = splitSurgeFields(line.slice(eq + 1));
    const type = (fields[0] ?? '').trim().toLowerCase();
    if (!GROUP_TYPES.has(type)) errors.push(`[Proxy Group] ${name}: 未知组类型 ${type}`);

    const members: string[] = [];
    for (const token of fields.slice(1)) {
      if (!token) continue;
      if (token.includes('=')) {
        const key = token.split('=', 1)[0].trim().toLowerCase();
        if (!GROUP_PARAMS.has(key)) errors.push(`[Proxy Group] ${name}: 未知参数 "${key}"`);
      } else {
        members.push(token);
      }
    }
    if (members.length === 0) errors.push(`[Proxy Group] ${name}: 没有任何成员`);
    groups.set(name, members);
  }

  // ---- 引用一致性 ----
  for (const [name, members] of groups) {
    for (const member of members) {
      if (BUILTIN_POLICIES.has(member) || proxies.has(member) || groups.has(member)) continue;
      errors.push(`[Proxy Group] ${name}: 引用未定义的策略 "${member}"`);
    }
  }

  // ---- [Rule] ----
  const rules = sections.Rule ?? [];
  let finalCount = 0;
  for (const line of rules) {
    const fields = splitSurgeFields(line);
    const type = (fields[0] ?? '').trim().toUpperCase();
    if (!RULE_TYPES.has(type)) {
      errors.push(`[Rule] 未知规则类型 "${type}": ${line.slice(0, 70)}`);
      continue;
    }
    if (type === 'FINAL') finalCount++;
    let target = (fields[fields.length - 1] ?? '').trim();
    if (target.toLowerCase() === 'no-resolve' && fields.length >= 3) {
      target = fields[fields.length - 2].trim();
    }
    if (!BUILTIN_POLICIES.has(target) && !proxies.has(target) && !groups.has(target)) {
      errors.push(`[Rule] 引用未定义的策略 "${target}": ${line.slice(0, 70)}`);
    }
  }
  if (finalCount === 0) warnings.push('[Rule] 缺少 FINAL 兜底规则');
  if (finalCount > 1) errors.push(`[Rule] 出现 ${finalCount} 条 FINAL，只有最后一条会生效`);

  // ---- 段落 ----
  for (const section of Object.keys(sections)) {
    if (KNOWN_SECTIONS.has(section)) continue;
    if (/^(WireGuard|Tailscale|Ruleset)\b/.test(section)) continue;
    warnings.push(`未识别的段落 [${section}]（Surge 会保留但不解析）`);
  }

  return {
    errors,
    warnings,
    proxyCount: proxies.size,
    groupCount: groups.size,
    ruleCount: rules.length,
  };
}
