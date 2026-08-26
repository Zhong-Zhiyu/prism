# Prism

[English](../README.md) | [简体中文](README.zh-Hans.md) | [繁體中文](README.zh-Hant.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [العربية](README.ar.md) | [فارسی](README.fa.md)

跨格式代理訂閱轉換工具，可部署至 Cloudflare Workers 和 Vercel。

## 支援格式

| 格式 | 作為來源 | 作為輸出 |
|------|:---:|:---:|
| Clash / Mihomo (YAML) | ✅ | ✅ |
| sing-box (JSON) | ⚠️ | ⚠️ |
| Surge (INI) | ⚠️ | ⚠️ |

> ⚠️ sing-box 與 Surge 的匯入與轉換功能**尚未經過驗證**，可能存有相容性問題。

## 快速部署

### 方式一：Cloudflare Dashboard 網頁端部署

1. Fork 本倉庫到你的 GitHub
2. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com)，進入 **Workers 和 Pages**
3. 點擊 **建立應用程式** → **Connect to GitHub**
4. 選擇你 Fork 的倉庫 → **下一步** → **部署**

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

Vercel 會在部署時執行 `npm run build:vercel` 建置 `api/index.js`；你也可以在本機執行相同指令來驗證建置。

## 本地開發

```bash
npm run dev          # Cloudflare Workers → http://localhost:8787
npm run dev:vercel   # Vercel (Node.js)  → http://localhost:8788
npm run build        # 為 Cloudflare Workers 打包
npm run build:vercel # 重建 Vercel 用的 api/index.js
```

## 專案結構

```
prism/
├── src/
│   ├── worker.ts          # Worker 路由 + 轉換 API
│   ├── vercel.ts          # Vercel 配接器原始碼
│   ├── frontend/          # HTML / CSS / 用戶端腳本
│   ├── parsers/           # 訂閱解析 + 設定解析
│   ├── generators/        # 輸出格式產生器
│   └── utils/             # 型別定義 + 預設參數
├── api/
│   └── index.js           # 預構建的 Vercel 函式
├── scripts/
│   └── dev-vercel.js      # 本地 Vercel 開發伺服器
├── public/                # Vercel 靜態佔位目錄
├── vercel.json            # Vercel 路由設定
├── wrangler.toml          # Cloudflare Workers 設定
└── package.json
```

## 授權

MIT © 2026 Zhong Zhiyu. All rights reserved.
