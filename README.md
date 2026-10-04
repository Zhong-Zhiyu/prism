# Prism

[English](README.md) | [简体中文](docs/README.zh-Hans.md) | [繁體中文](docs/README.zh-Hant.md) | [日本語](docs/README.ja.md) | [한국어](docs/README.ko.md) | [Русский](docs/README.ru.md) | [Tiếng Việt](docs/README.vi.md) | [العربية](docs/README.ar.md) | [فارسی](docs/README.fa.md)

Cross-format proxy subscription converter, deployable to Cloudflare Workers and Vercel.

## Supported Formats

| Format | As Source | As Output | Verified with |
|--------|:---------:|:---------:|---------------|
| Clash / Mihomo (YAML) | ✅ | ✅ | Clash Verge Rev |
| sing-box (JSON) | ❌ | ⚠️ | Android ✅ / iOS ❌ |
| Surge (INI) | ❌ | ⚠️ | Surfboard |

> The source subscription must be in Clash / Mihomo YAML format. sing-box JSON and Surge INI are output-only.<br>
> **Note:** sing-box output has been verified on Android but still fails on iOS (the VPN service cannot be started). Surge output has been verified with Surfboard. See the [verification and maintenance guide](docs/verification-guide.md).

## Quick Deploy

### Option 1: Cloudflare Dashboard

1. Fork this repository to your GitHub
2. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com) and go to **Workers & Pages**
3. Click **Create application** → **Connect to GitHub**
4. Select your forked repository → **Next** → **Deploy**

### Option 2: Wrangler CLI

```bash
git clone https://github.com/Zhong-Zhiyu/prism.git
cd prism
npm install
npm run deploy
```

### Option 3: Vercel

```bash
git clone https://github.com/Zhong-Zhiyu/prism.git
cd prism
npm install
npx vercel deploy --prod
```

Vercel runs `npm run build:vercel` during deployment to build `api/index.js`; you can run the same command locally to verify the build.

## Local Development

```bash
npm run dev          # Cloudflare Workers → http://localhost:8787
npm run dev:vercel   # Vercel (Node.js)  → http://localhost:8788
npm run build        # Bundle for Cloudflare Workers
npm run build:vercel # Rebuild api/index.js for Vercel
```

## Testing

```bash
npm test          # 139 unit and integration tests, no external dependencies
npm run check     # tests + type checking + both builds
```

Output correctness is additionally verified against the `mihomo` and `sing-box` kernels.
Both binaries are required; see the verification guide for installation instructions.

```bash
MIHOMO_BIN=~/tools/bin/mihomo SINGBOX_BIN=~/tools/bin/sing-box npm run verify:kernel
```

If the kernels are not present, the corresponding cases are reported as SKIP rather than
failure, so the command is safe to run in CI.

Surge output is validated for syntax and reference consistency only. No runtime validation
path is available in CI; see the verification guide for details.

The [verification and maintenance guide](docs/verification-guide.md) documents the
kernel-level checks, runtime verification against a real subscription, the local test lab,
and the checks required after each type of change.

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
├── test/                  # Unit / integration / fuzz / kernel verification
│   └── lab/               # Offline test lab (fixtures + local server)
├── docs/
│   └── verification-guide.md  # Verification procedures
├── fonts/                 # Self-hosted webfonts
├── public/                # Vercel static placeholder
├── vercel.json            # Vercel routing config
├── wrangler.toml          # Cloudflare Workers config
└── package.json
```

## License

MIT © 2026 Zhong Zhiyu. All rights reserved.
