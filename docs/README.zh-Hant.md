# Prism

[English](../README.md) | [简体中文](README.zh-Hans.md) | [繁體中文](README.zh-Hant.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [العربية](README.ar.md) | [فارسی](README.fa.md)

跨格式代理訂閱轉換工具，可部署至 Cloudflare Workers 和 Vercel。

## 支援格式

| 格式 | 作為來源 | 作為輸出 | 實測客戶端 |
|------|:---:|:---:|------|
| Clash / Mihomo (YAML) | ✅ | ✅ | Clash Verge Rev |
| sing-box (JSON) | ❌ | ⚠️ | Android ✅ / iOS ❌ |
| Surge (INI) | ❌ | ⚠️ | Surfboard |

> 訂閱來源必須是 Clash / Mihomo YAML 格式；sing-box JSON 與 Surge INI 僅支援作為輸出。<br>
> **注意：** sing-box 輸出已在 Android 端驗證通過，但 iOS 端仍無法啟動 VPN 服務。Surge 輸出使用 Surfboard 驗證。詳見[驗收與維護手冊](verification-guide.md)。

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

## 測試

```bash
npm test          # 139 項單元 / 整合測試（無外部相依）
npm run check     # 測試 + 型別檢查 + 雙目標建置
```

產物還會與真實的 `mihomo` 與 `sing-box` 核心做校驗（需要這兩個二進位檔，取得方式見驗收與維護手冊）：

```bash
MIHOMO_BIN=~/tools/bin/mihomo SINGBOX_BIN=~/tools/bin/sing-box npm run verify:kernel
```

缺少核心時會標記為 SKIP 而非失敗，因此可安全用於 CI。

**[驗收與維護手冊](verification-guide.md)** 說明了核心級校驗、真實訂閱實跑、本機測試台的搭建方法，以及各類改動後應執行的檢查。

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
├── test/                  # 單元 / 整合 / 模糊 / 核心校驗
│   └── lab/               # 離線測試台（夾具 + 本機伺服器）
├── docs/
│   └── verification-guide.md  # 驗收與維護手冊
├── fonts/                 # 自架字型
├── public/                # Vercel 靜態佔位目錄
├── vercel.json            # Vercel 路由設定
├── wrangler.toml          # Cloudflare Workers 設定
└── package.json
```

## 授權

MIT © 2026 Zhong Zhiyu. All rights reserved.
