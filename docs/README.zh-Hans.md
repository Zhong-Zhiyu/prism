# Prism

[English](../README.md) | [简体中文](README.zh-Hans.md) | [繁體中文](README.zh-Hant.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [العربية](README.ar.md) | [فارسی](README.fa.md)

跨格式代理订阅转换工具，可部署至 Cloudflare Workers 和 Vercel。

## 支持格式

| 格式 | 作为源 | 作为输出 |
|------|:---:|:---:|
| Clash / Mihomo (YAML) | ✅ | ✅ |
| sing-box (JSON) | ⚠️ | ⚠️ |
| Surge (INI) | ⚠️ | ⚠️ |

> ⚠️ sing-box 与 Surge 的导入与转换功能**尚未验证可用性**，可能存在兼容性问题。

## 快速部署

### 方式一：Cloudflare Dashboard 网页端部署

1. Fork 本仓库到你的 GitHub
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)，进入 **Workers 和 Pages**
3. 点击 **创建应用程序** → **Connect to GitHub**
4. 选择你 Fork 的仓库 → **下一步** → **部署**

### 方式二：Wrangler CLI 部署

```bash
git clone https://github.com/Motrans/prism.git
cd prism
npm install
npm run deploy
```

### 方式三：Vercel 部署

```bash
git clone https://github.com/Motrans/prism.git
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
├── public/                # Vercel 静态占位目录
├── vercel.json            # Vercel 路由配置
├── wrangler.toml          # Cloudflare Workers 配置
└── package.json
```

## 许可

MIT © 2026 Zhong Zhiyu. All rights reserved.
