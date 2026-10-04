# Prism

[English](../README.md) | [简体中文](README.zh-Hans.md) | [繁體中文](README.zh-Hant.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [العربية](README.ar.md) | [فارسی](README.fa.md)

マルチフォーマット対応プロキシサブスクリプション変換ツール。Cloudflare Workers および Vercel にデプロイ可能です。

## 対応フォーマット

| 形式 | 入力として | 出力として | 検証クライアント |
|------|:---:|:---:|------|
| Clash / Mihomo (YAML) | ✅ | ✅ | Clash Verge Rev |
| sing-box (JSON) | ❌ | ⚠️ | Android ✅ / iOS ❌ |
| Surge (INI) | ❌ | ⚠️ | Surfboard |

> サブスクリプションの入力は Clash / Mihomo YAML 形式である必要があります。sing-box JSON と Surge INI は出力専用です。<br>
> **注意：** sing-box 出力は Android で検証済みですが、iOS では VPN サービスを開始できません。Surge 出力は Surfboard で検証しています。詳細は[検証・保守ガイド](verification-guide.md)を参照してください。

## クイックデプロイ

### 方法 1: Cloudflare Dashboard

1. このリポジトリをあなたの GitHub に Fork する
2. [Cloudflare Dashboard](https://dash.cloudflare.com) にログインし、**Workers & Pages** を開く
3. **アプリケーションを作成** → **Connect to GitHub**
4. Fork したリポジトリを選択 → **次へ** → **デプロイ**

### 方法 2: Wrangler CLI

```bash
git clone https://github.com/Zhong-Zhiyu/prism.git
cd prism
npm install
npm run deploy
```

### 方法 3: Vercel

```bash
git clone https://github.com/Zhong-Zhiyu/prism.git
cd prism
npm install
npx vercel deploy --prod
```

Vercel はデプロイ時に `npm run build:vercel` を実行して `api/index.js` をビルドします。ローカルで同じコマンドを実行してビルドを確認することもできます。

## ローカル開発

```bash
npm run dev          # Cloudflare Workers → http://localhost:8787
npm run dev:vercel   # Vercel (Node.js)  → http://localhost:8788
npm run build        # Cloudflare Workers 用にバンドル
npm run build:vercel # Vercel 用の api/index.js を再ビルド
```

## テスト

```bash
npm test          # ユニット / 統合テスト 139 件（外部依存なし）
npm run check     # テスト + 型チェック + 両方のビルド
```

出力は実際の `mihomo` / `sing-box` カーネルでも検証します
（両方のバイナリが必要です。入手方法は検証ガイドを参照）：

```bash
MIHOMO_BIN=~/tools/bin/mihomo SINGBOX_BIN=~/tools/bin/sing-box npm run verify:kernel
```

カーネルが見つからない場合は失敗ではなく SKIP として扱われるため、CI でも安全です。

**[検証・保守ガイド](verification-guide.md)** では、カーネル検証、実サブスクリプションでの実行検証、ローカルテストラボの構築方法、変更の種類ごとに必要な検査を説明しています。

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
├── test/                  # ユニット / 統合 / ファズ / カーネル検証
│   └── lab/               # オフラインテストラボ（フィクスチャ + ローカルサーバー）
├── docs/
│   └── verification-guide.md  # 検証・保守ガイド
├── fonts/                 # セルフホストフォント
├── public/                # Vercel 静的プレースホルダー
├── vercel.json            # Vercel ルーティング設定
├── wrangler.toml          # Cloudflare Workers 設定
└── package.json
```

## ライセンス

MIT © 2026 Zhong Zhiyu. All rights reserved.
