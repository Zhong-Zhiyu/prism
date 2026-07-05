# Prism

[English](README.md) | [简体中文](docs/README.zh-Hans.md) | [繁體中文](docs/README.zh-Hant.md) | [日本語](docs/README.ja.md) | [한국어](docs/README.ko.md) | [Русский](docs/README.ru.md) | [Tiếng Việt](docs/README.vi.md) | [العربية](docs/README.ar.md) | [فارسی](docs/README.fa.md)

Cross-format proxy subscription converter, deployable to Cloudflare Workers and Vercel.

## Supported Formats

| Format | As Source | As Output |
|--------|:---------:|:---------:|
| Clash / Mihomo (YAML) | ✅ | ✅ |
| sing-box (JSON) | ⚠️ | ⚠️ |
| Surge (INI) | ⚠️ | ⚠️ |

> ⚠️ sing-box and Surge import/export functionality **has not been verified** and may contain compatibility issues.

## Quick Deploy

### Option 1: Cloudflare Dashboard

1. Fork this repository to your GitHub
2. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com) and go to **Workers & Pages**
3. Click **Create application** → **Connect to GitHub**
4. Select your forked repository → **Next** → **Deploy**

### Option 2: Wrangler CLI

```bash
git clone https://github.com/Motrans/prism.git
cd prism
npm install
npm run deploy
```

### Option 3: Vercel

```bash
git clone https://github.com/Motrans/prism.git
cd prism
npm install
npx vercel deploy --prod
```

No build step needed — the pre-built `api/index.js` is already included in the repository.

## Local Development

```bash
npm run dev          # Cloudflare Workers → http://localhost:8787
npm run dev:vercel   # Vercel (Node.js)  → http://localhost:8788
npm run build        # Bundle for Cloudflare Workers
npm run build:vercel # Rebuild api/index.js for Vercel
```

## Project Structure

```
prism/
├── src/
│   ├── worker.ts          # Worker routes + conversion API
│   ├── vercel.ts          # Vercel adapter source
│   ├── frontend/          # HTML / CSS / client JS
│   ├── parsers/           # Subscription + config parsers
│   ├── generators/        # Output format generators
│   └── utils/             # Types + defaults
├── api/
│   └── index.js           # Pre-built Vercel function
├── scripts/
│   └── dev-vercel.js      # Local Vercel dev server
├── public/                # Vercel static placeholder
├── vercel.json            # Vercel routing config
├── wrangler.toml          # Cloudflare Workers config
└── package.json
```

## License

MIT © 2026 Zhong Zhiyu. All rights reserved.
