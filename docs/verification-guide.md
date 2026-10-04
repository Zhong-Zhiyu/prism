# Prism 验收与维护手册

本手册说明如何验证 Prism 产物的可用性，以及在不同类型的改动后应执行哪些检查。
按本文操作可在 Linux 环境（含 WSL）中搭建出可复现的验收环境。

---

## 1. 验收分层

Prism 负责将 Clash 订阅转换为多种客户端配置。此类转换工具的主要风险并非程序崩溃，
而是**生成的配置语法正确、却被内核拒绝加载，或加载后流量走向错误**。这类问题通常不会
在单元测试中暴露。

验收分为三层，各层的覆盖范围不同：

| 层级 | 手段 | 可判定的问题 |
|---|---|---|
| 单元 / 集成测试 | `npm test` | 数据语义、边界条件、错误路径、跨生成器一致性 |
| 内核校验 | `npm run verify:kernel` | 产物能否被真实内核加载 |
| 实跑验证 | 见第 4、5 节 | 转换后的配置能否实际代理流量 |

单元测试无法发现内核拒绝加载的配置；内核校验无法发现「配置可加载但流量走向错误」
以及「节点实际不可用」。三层均需执行。

---

## 2. 快速开始

```bash
npm install
npm test          # 单元 / 集成测试，无需内核
npm run check     # 测试 + 类型检查 + 双目标构建
```

`npm test` 不依赖任何外部程序，是日常改动的最小检查项。

---

## 3. 内核级校验

### 3.1 获取内核

需要 `sing-box` 与 `mihomo` 两个二进制文件。建议安装在 Linux 侧（WSL 内即可），
无需安装到宿主系统。

```bash
mkdir -p ~/tools/bin && cd ~/tools

# sing-box（Linux amd64 glibc）
curl -sL -o sb.tar.gz https://github.com/SagerNet/sing-box/releases/download/v1.14.2/sing-box-1.14.2-linux-amd64-glibc.tar.gz
tar xzf sb.tar.gz && cp sing-box-1.14.2-linux-amd64-glibc/sing-box bin/sing-box && chmod +x bin/sing-box

# mihomo（Linux amd64 compatible）
curl -sL -o mh.gz https://github.com/MetaCubeX/mihomo/releases/download/v1.19.32/mihomo-linux-amd64-compatible-v1.19.32.gz
gunzip -f mh.gz && cp mihomo-linux-amd64-compatible-v1.19.32 bin/mihomo && chmod +x bin/mihomo

~/tools/bin/sing-box version
~/tools/bin/mihomo -v
```

### 3.2 执行校验

```bash
MIHOMO_BIN=~/tools/bin/mihomo SINGBOX_BIN=~/tools/bin/sing-box npm run verify:kernel
```

预期输出：

```
地理数据: geosite.dat: 已预置，geoip.dat: 已预置，country.mmdb: 已预置，geoip.metadb: 已预置

✔ clash (订阅自带规则)     configuration file ... test is successful
✔ clash (外部配置)       configuration file ... test is successful
✔ sing-box (订阅自带规则)  ok
✔ sing-box (外部配置)    ok
✔ surge (订阅自带规则)     节点 10 / 策略组 2 / 规则 8，引用一致
✔ surge (外部配置)       节点 10 / 策略组 4 / 规则 10，引用一致

结果: 6 通过, 0 失败, 0 跳过
```

未检测到内核时，对应用例标记为 SKIP 而非失败，因此该命令可直接用于 CI。

该脚本会把测试文件构建到 `.tmp-tests/`，目录不存在时会自动创建；若尚未执行过 `npm test`，建议先运行一次以确认依赖已安装。

### 3.3 地理数据预置

产物包含 `GEOSITE` / `GEOIP` 规则时，mihomo 会自行下载 `geosite.dat` 与 `country.mmdb`。
部分网络环境下该下载过程会中断，导致校验结果不稳定。验收器改用 `curl` 预取这些文件
到工作目录，使校验结果仅反映配置本身的问题。

---

## 4. 实跑验证

实跑用于确认转换后的配置能够实际代理流量。内核校验只能证明配置可加载，
无法证明节点可用。流程如下：

```bash
# 1. 启动本地测试台（同时提供 Prism API 与外部文件托管），
#    详见第 6 节；也可用 npm run dev:vercel 启动部署产物
npm run build:vercel && node scripts/dev-vercel.js    # 127.0.0.1:8788

# 2. 获取转换产物
curl -o /tmp/out.json "http://127.0.0.1:8788/sub?target=singbox&url=<订阅URL>"

# 3. 内核校验
~/tools/bin/sing-box check -c /tmp/out.json

# 4. 实跑：剥离 dns 段并改用本地端口后启动，经 SOCKS 请求判定出口 IP
```

**判定标准为请求出口 IP 与直连出口不同。** 仅检查 HTTP 200 不足以下结论：配置可能
静默回落到直连，此时请求同样返回 200。

> **注意：** 实跑前必须移除配置中的 `dns.listen`，否则 mihomo 会在本机启动 DNS 监听。
> 全程只绑定 `127.0.0.1` 高位端口，不要创建 TUN，不要修改路由或 DNS。

SOCKS 实跑覆盖的是 `mixed` 入站路径，不覆盖 TUN 入站。TUN 入站的验证方法见第 5 节。

---

## 5. TUN 入站验证

sing-box 的 TUN 入站需要 root 权限才能创建接口，因此该项验证无法包含在
`npm run verify:kernel` 中，需要单独执行。

### 5.1 递进测试

```bash
# 测试一：仅建立接口，不修改路由
#   配置中 auto_route=false，验证内核能否创建 TUN
sudo ~/tools/bin/sing-box run -c tun-noroute.json

# 测试二：auto_route=true + direct 出站，验证路由安装与流量接管
# 测试三：auto_route=true + 真实节点，验证完整链路
sudo ~/tools/bin/sing-box run -c run.json
```

判定标准：

| 序 | 判据 |
|---|---|
| 1 | TUN 接口建立成功（`auto_route=false` 时不修改路由表） |
| 2 | `auto_route=true` 时安装策略路由（路由表 2022 与 9000–9003 规则） |
| 3 | 经节点端口请求返回 200 |
| 4 | 出口 IP 与直连出口不同 |

### 5.2 安全边界

TUN 接口创建于 WSL 的网络命名空间内，不影响宿主系统的 IP 栈。宿主侧仅可见
一个 Hyper-V 虚拟网卡。

`auto_route` 会接管 WSL 自身的路由，建议配合超时清理，避免测试中断后无法恢复：

```bash
( sleep 100; sudo pkill -f 'run.json'; sudo ip link delete tun0 ) &
```

测试结束后应确认：TUN 接口数为 0、策略路由（表 2022）为 0 条、默认路由已恢复。

### 5.3 fake-ip 环境

宿主机以 TUN 模式接管流量并启用 fake-ip 时，无需将 DNS 模式改为 redir-host。
将 `route.default_domain_resolver` 指向 DoH 服务器后，解析链路为：

```
DoH 服务器域名 → 系统 resolver 取得 fake-ip → 宿主机 TUN 映射至真实服务器
  → 经该 DoH 加密查询节点域名 → 取得真实 IP → 节点连接建立
```

该链路不依赖明文 53 查询的结果（明文查询会被 fake-ip 劫持）。

### 5.4 注意事项

- 创建 TUN 需要 root 权限，否则报错 `TUNSETIFF: operation not permitted`。
- `auto_detect_interface` 只能置于 `route` 下；置于 `tun` 下会被内核拒绝
  （`unknown field`）。

### 5.5 覆盖范围

TUN 入站可验证到「配置合法且内核可建立接口并接管流量」。客户端能否真正启动 VPN
（Android 的 VpnService、iOS 的 NetworkExtension）取决于客户端实现，需在真机确认。

---

## 6. 离线测试台

`test/lab/` 提供一套离线测试台，将订阅、外部配置与规则集全部托管在本机，
不依赖真实订阅即可跑通「取订阅 → 转换 → 落盘」的完整流程。适用于回归验证与
参数组合的批量检查。

```
test/lab/
  fixtures/          订阅样本（12 个节点，覆盖 11 种协议）、
                     外部配置、三份规则集
  lab-server.mjs     本地服务器，同一端口（默认 127.0.0.1:18787）同时提供
                     转换接口与夹具文件
  patch-lab.mjs      为构建产物打补丁，使其可抓取本机夹具（见下）
  run-matrix.sh      批量执行 10 组参数组合，产物写入 out/
```

### 6.1 SSRF 防护与补丁

`src/worker.ts` 中的 `isSafeUrl()` 会拒绝回环地址、`localhost`、`*.local` 与
`*.internal` 主机名（SSRF 防护，不可移除）。测试台因此需要让转换器能够抓取本机文件。

`patch-lab.mjs` 不修改源码，仅对 esbuild 产物 `dist/worker.js` 做字符串替换，
将白名单改为测试主机名 `lab2027.internal`。补丁带有自校验，任一项未生效即中止。

使用前需在本机 hosts 文件中加入一行：

```
127.0.0.1 lab2027.internal
```

### 6.2 使用

```bash
npm run lab:build       # 构建产物并打补丁
npm run lab             # 启动测试台（127.0.0.1:18787）
npm run lab:matrix      # 另开一个终端，执行参数矩阵
```

`run-matrix.sh` 输出 10 组产物到 `test/lab/out/`，可作为内核校验的输入：

```bash
~/tools/bin/sing-box check -c test/lab/out/cfg-singbox.json
~/tools/bin/mihomo -t -f test/lab/out/cfg-clash.yaml -d /tmp/mihomo-check
```

`lab-worker.mjs` 与 `out/` 为生成物，已在 `.gitignore` 中排除。

---

## 7. Surge 的验证上限

CI 环境中没有 Surge 的运行时验证方案，因此 Surge 目标只能做到以下三项：

1. **语法与参数白名单**：依据官方 `manual.nssurge.com/policies/*.html` 逐条核对
2. **引用一致性**：策略组与规则引用的策略名必须已定义
3. **与 subconverter 参照比对**

这三项可以排除「配置无效」与「字段名拼错」，但不能证明 Surge 能够实际连接。
Surge 产物的实测需借助其他兼容客户端完成。

> 参照工具的限制：subconverter v0.9.0 不支持 anytls（三种目标均会丢弃该协议节点），
> 且其 sing-box 产物使用 1.14 已移除的 DNS 格式，因此在 anytls 场景下不具备参照价值。

---

## 8. 已知取舍

| 取舍 | 原因 |
|---|---|
| Surge 名称与取值中的逗号、等号、引号替换为下划线 | 官方仅承诺双引号值内支持 `\"` 与 `\\` 转义，未承诺代理定义支持引号值；直接输出会静默产生错误的主机名或密码 |
| Surge 不输出 `ssh`、`wireguard`、`external` | Clash 订阅中缺少对应字段，且无运行时验证手段 |
| `geo_rules=skip` 会丢弃 GEOIP / GEOSITE 规则 | sing-box 的 `rule_set.url` 只接受单个 URL，无法做多源回退；下载失败会导致内核启动失败，故提供零运行时下载的开关 |
| 多订阅中任一失败则整个请求失败 | 静默丢弃部分节点比明确报错风险更高 |
| sing-box 默认输出 TUN 入站 | 移动端 sing-box 需以 TUN 方式运行；仅提供 `mixed` 入站时，Android 不启动系统 VPN、iOS 会话建立失败。可用 `tun=0` 关闭 |

---

## 9. 改动后的检查项

| 改动范围 | 应执行 |
|---|---|
| 任意改动 | `npm test` |
| `src/generators/` | `npm test` + `npm run verify:kernel` |
| 节点命名或参数处理（`node-utils.ts`） | 上述两项 + `test/naming.test.ts`、`test/consistency.test.ts` |
| 规则装配（`rule-collector.ts`、`rule-pruner.ts`） | 上述两项 + `test/rules.test.ts`、`test/consistency.test.ts` |
| Worker 请求处理（`worker.ts`） | 上述两项 + `test/worker.test.ts`、`test/errors.test.ts` |
| 发版前 | `npm run check` + `npm run verify:kernel` + 一次实跑验证 |

**跨生成器一致性**：三种目标格式共享同一套节点命名、策略组与规则语义。
涉及共享语义的改动必须同时检查三个生成器的产物，`test/consistency.test.ts` 与
`test/naming.test.ts` 用于覆盖这类问题。

---

## 10. 测试覆盖

| 文件 | 项数 | 覆盖范围 |
|---|---|---|
| `core.test.ts` | 61 | 解析、规则裁剪、三目标生成器、DNS 迁移、逐协议字段保真、TUN 入站 |
| `worker.test.ts` | 22 | HTTP 链路：参数、SSRF、上游失败、响应头、多订阅 |
| `errors.test.ts` | 18 | 部分失败、超大响应、重定向、规则集降级、极端规模、畸形上游 |
| `naming.test.ts` | 17 | rename 解析、显示名唯一性、emoji 剥离、成员映射 |
| `rules.test.ts` | 10 | 终止语义、规则装配、三目标一致性 |
| `consistency.test.ts` | 4 | 参数矩阵下三目标的节点、策略组、成员与目标一致 |
| `transport.test.ts` | 5 | ws / grpc / h2 / httpupgrade 的字段类型 |
| `fuzz.test.ts` | 2 | 随机用例与畸形输入 |
| `verify-kernel.ts` | 6 | 真实内核校验（需 `MIHOMO_BIN` / `SINGBOX_BIN`） |

---

## 11. 环境约束

在 WSL 内执行验收时需遵守以下约束。

1. **不创建 TUN、不修改 WSL 的路由与 DNS。** WSL 流量已由宿主机代理接管，
   在 WSL 内建立隧道会影响验收环境自身的连通性。第 5 节的 TUN 测试使用
   `auto_route=false` 或配合超时清理执行。
2. **只绑定 `127.0.0.1`。** WSL 默认使用 NAT 模式，绑定回环的测试服务在宿主机不可达。

另外两点需要注意：

- 产物中的 `dns.listen` 会使 `mihomo -f` 实际启动 DNS 监听，实跑前需移除。
- 宿主机以 TUN 模式接管流量时，所有域名会解析为 fake-ip（`198.18.0.0/16`），
  且直接向公网 DNS 查询同样返回 fake-ip。因此「先解析地址、再建立连接」的调试方式
  在该环境下不适用。
