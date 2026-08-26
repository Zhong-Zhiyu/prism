# Prism

[English](../README.md) | [简体中文](README.zh-Hans.md) | [繁體中文](README.zh-Hant.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [العربية](README.ar.md) | [فارسی](README.fa.md)

멀티 포맷 프록시 구독 변환 도구이며, Cloudflare Workers 및 Vercel에 배포할 수 있습니다.

## 지원 형식

| 형식 | 입력 | 출력 |
|------|:---:|:---:|
| Clash / Mihomo (YAML) | ✅ | ✅ |
| sing-box (JSON) | ⚠️ | ⚠️ |
| Surge (INI) | ⚠️ | ⚠️ |

> ⚠️ sing-box 및 Surge의 임포트/익스포트 기능은 **아직 검증되지 않았으며**, 호환성 문제가 있을 수 있습니다.

## 빠른 배포

### 방법 1: Cloudflare Dashboard

1. 이 저장소를 GitHub에 Fork하세요
2. [Cloudflare Dashboard](https://dash.cloudflare.com)에 로그인하고 **Workers & Pages**로 이동하세요
3. **애플리케이션 만들기** → **Connect to GitHub**
4. Fork한 저장소를 선택 → **다음** → **배포**

### 방법 2: Wrangler CLI

```bash
git clone https://github.com/Zhong-Zhiyu/prism.git
cd prism
npm install
npm run deploy
```

### 방법 3: Vercel

```bash
git clone https://github.com/Zhong-Zhiyu/prism.git
cd prism
npm install
npx vercel deploy --prod
```

Vercel은 배포 중 `npm run build:vercel`을 실행하여 `api/index.js`를 빌드합니다. 로컬에서도 같은 명령을 실행해 빌드를 확인할 수 있습니다.

## 로컬 개발

```bash
npm run dev          # Cloudflare Workers → http://localhost:8787
npm run dev:vercel   # Vercel (Node.js)  → http://localhost:8788
npm run build        # Cloudflare Workers용 번들
npm run build:vercel # Vercel용 api/index.js 재빌드
```

## 프로젝트 구조

```
prism/
├── src/
│   ├── worker.ts          # Worker 라우팅 + 변환 API
│   ├── vercel.ts          # Vercel 어댑터 소스
│   ├── frontend/          # HTML / CSS / 클라이언트 스크립트
│   ├── parsers/           # 구독 + 설정 파서
│   ├── generators/        # 출력 형식 생성기
│   └── utils/             # 타입 정의 + 기본 매개변수
├── api/
│   └── index.js           # 사전 빌드된 Vercel 함수
├── scripts/
│   └── dev-vercel.js      # 로컬 Vercel 개발 서버
├── public/                # Vercel 정적 플레이스홀더
├── vercel.json            # Vercel 라우팅 설정
├── wrangler.toml          # Cloudflare Workers 설정
└── package.json
```

## 라이선스

MIT © 2026 Zhong Zhiyu. All rights reserved.
