# Prism

[English](../README.md) | [简体中文](README.zh-Hans.md) | [繁體中文](README.zh-Hant.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [العربية](README.ar.md) | [فارسی](README.fa.md)

マルチフォーマット対応プロキシサブスクリプション変換ツール。Cloudflare Workers および Vercel にデプロイ可能です。

## 対応フォーマット

| フォーマット | 入力 | 出力 |
|------|:---:|:---:|
| Clash / Mihomo (YAML) | ✅ | ✅ |
| sing-box (JSON) | ⚠️ | ⚠️ |
| Surge (INI) | ⚠️ | ⚠️ |

> ⚠️ sing-box および Surge のインポート・エクスポート機能は**動作検証が未完了**であり、互換性の問題が発生する可能性があります。

## クイックデプロイ

### 方法 1: Cloudflare Dashboard

1. このリポジトリをあなたの GitHub に Fork する
2. [Cloudflare Dashboard](https://dash.cloudflare.com) にログインし、**Workers & Pages** を開く
3. **アプリケーションを作成** → **Connect to GitHub**
4. Fork したリポジトリを選択 → **次へ** → **デプロイ**

### 方法 2: Wrangler CLI

```bash
git clone https://github.com/Motrans/prism.git
cd prism
npm install
npm run deploy
```

### 方法 3: Vercel

```bash
git clone https://github.com/Motrans/prism.git
cd prism
npm install
npx vercel deploy --prod
```

ビルド手順は不要です——事前ビルド済みの `api/index.js` がリポジトリに含まれています。

## ローカル開発

```bash
npm run dev          # Cloudflare Workers → http://localhost:8787
npm run dev:vercel   # Vercel (Node.js)  → http://localhost:8788
npm run build        # Cloudflare Workers 用にバンドル
npm run build:vercel # Vercel 用の api/index.js を再ビルド
```

## プロジェクト構成

```
prism/
├── src/
│   ├── worker.ts          # Worker ルーティング + 変換 API
│   ├── vercel.ts          # Vercel アダプターソース
│   ├── frontend/          # HTML / CSS / クライアントスクリプト
│   ├── parsers/           # サブスクリプション + 設定パーサー
│   ├── generators/        # 出力フォーマットジェネレーター
│   └── utils/             # 型定義 + デフォルトパラメータ
├── api/
│   └── index.js           # 事前ビルド済み Vercel 関数
├── scripts/
│   └── dev-vercel.js      # ローカル Vercel 開発サーバー
├── public/                # Vercel 静的プレースホルダー
├── vercel.json            # Vercel ルーティング設定
├── wrangler.toml          # Cloudflare Workers 設定
└── package.json
```

## ライセンス

MIT © 2026 Zhong Zhiyu. All rights reserved.
