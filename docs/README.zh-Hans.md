# Prism

[English](../README.md) | [简体中文](README.zh-Hans.md) | [繁體中文](README.zh-Hant.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [العربية](README.ar.md) | [فارسی](README.fa.md)

跨格式代理订阅转换工具，可部署至 Cloudflare Workers 和 Vercel。

## 支持格式

| 格式 | 作为源 | 作为输出 | 实测客户端 |
|------|:---:|:---:|------|
| Clash / Mihomo (YAML) | ✅ | ✅ | Clash Verge Rev |
| sing-box (JSON) | ❌ | ⚠️ | Android ✅ / iOS ❌ |
| Surge (INI) | ❌ | ⚠️ | Surfboard |

> 订阅源必须是 Clash / Mihomo YAML 格式；sing-box JSON 与 Surge INI 仅支持作为输出。<br>
> **注意：** sing-box 输出已在 Android 端验证通过，但 iOS 端仍无法启动 VPN 服务。Surge 输出使用 Surfboard 验证。详见[验收与维护手册](verification-guide.md)。

## 快速部署

### 方式一：Cloudflare Dashboard 网页端部署

1. Fork 本仓库到你的 GitHub
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)，进入 **Workers 和 Pages**
3. 点击 **创建应用程序** → **Connect to GitHub**
4. 选择你 Fork 的仓库 → **下一步** → **部署**

### 方式二：Wrangler CLI 部署

```bash
git clone https://github.com/Zhong-Zhiyu/prism.git
cd prism
npm install
npm run deploy
```

### 方式三：Vercel 部署

```bash
git clone https://github.com/Zhong-Zhiyu/prism.git
cd prism
npm install
npx vercel deploy --prod
```

Vercel 会在部署时运行 `npm run build:vercel` 构建 `api/index.js`；你也可以在本地运行同一命令来验证构建。

## 本地开发

```bash
npm run dev          # Cloudflare Workers → http://localhost:8787
npm run dev:vercel   # Vercel (Node.js)  → http://localhost:8788
npm run build        # 为 Cloudflare Workers 打包
npm run build:vercel # 重建 Vercel 用的 api/index.js
```

## 测试

```bash
npm test          # 139 项单元 / 集成测试（无外部依赖）
npm run check     # 测试 + 类型检查 + 双目标构建
```

产物还会与真实的 `mihomo` 与 `sing-box` 内核做校验（需要这两个二进制，获取方式见验收与维护手册）：

```bash
MIHOMO_BIN=~/tools/bin/mihomo SINGBOX_BIN=~/tools/bin/sing-box npm run verify:kernel
```

缺少内核时会标记为 SKIP 而非失败，因此可安全用于 CI。

**[验收与维护手册](verification-guide.md)** 说明了内核级校验、真实订阅实跑、本地测试台的搭建方法，以及各类改动后应执行的检查。

## 项目结构

```
prism/
├── src/
│   ├── worker.ts          # Worker 路由 + 转换 API
│   ├── vercel.ts          # Vercel 适配器源码
│   ├── frontend/          # HTML / CSS / 客户端脚本
│   ├── parsers/           # 订阅解析 + 配置解析
│   ├── generators/        # 输出格式生成器
│   └── utils/             # 类型定义 + 默认参数
├── api/
│   └── index.js           # 预构建的 Vercel 函数
├── scripts/
│   └── dev-vercel.js      # 本地 Vercel 开发服务器
├── test/                  # 单元 / 集成 / 模糊 / 内核校验
│   └── lab/               # 离线测试台（夹具 + 本地服务器）
├── docs/
│   └── verification-guide.md  # 验收与维护手册
├── fonts/                 # 自托管字体
├── public/                # Vercel 静态占位目录
├── vercel.json            # Vercel 路由配置
├── wrangler.toml          # Cloudflare Workers 配置
└── package.json
```

## 许可

MIT © 2026 Zhong Zhiyu. All rights reserved.
