# Prism

[English](../README.md) | [简体中文](README.zh-Hans.md) | [繁體中文](README.zh-Hant.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [العربية](README.ar.md) | [فارسی](README.fa.md)

멀티 포맷 프록시 구독 변환 도구이며, Cloudflare Workers 및 Vercel에 배포할 수 있습니다.

## 지원 형식

| 형식 | 소스로 | 출력으로 | 검증 클라이언트 |
|------|:---:|:---:|------|
| Clash / Mihomo (YAML) | ✅ | ✅ | Clash Verge Rev |
| sing-box (JSON) | ❌ | ⚠️ | Android ✅ / iOS ❌ |
| Surge (INI) | ❌ | ⚠️ | Surfboard |

> 구독 소스는 Clash / Mihomo YAML 형식이어야 합니다. sing-box JSON과 Surge INI는 출력 전용입니다.<br>
> **참고:** sing-box 출력은 Android에서 검증되었지만 iOS에서는 VPN 서비스를 시작할 수 없습니다. Surge 출력은 Surfboard로 검증했습니다. 자세한 내용은 [검증 및 유지보수 가이드](verification-guide.md)를 참조하세요.

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

## 테스트

```bash
npm test          # 단위 / 통합 테스트 139개 (외부 의존성 없음)
npm run check     # 테스트 + 타입 검사 + 양쪽 빌드
```

출력은 실제 `mihomo` / `sing-box` 커널로도 검증합니다
(두 바이너리가 필요하며, 획득 방법은 검증 가이드를 참조):

```bash
MIHOMO_BIN=~/tools/bin/mihomo SINGBOX_BIN=~/tools/bin/sing-box npm run verify:kernel
```

커널이 없으면 실패가 아니라 SKIP으로 처리되므로 CI에서도 안전합니다.

**[검증 및 유지보수 가이드](verification-guide.md)** 에는 커널 검증, 실제 구독 실행 검증, 로컬 테스트 랩 구축 방법, 변경 유형별로 필요한 검사가 설명되어 있습니다.

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
├── test/                  # 단위 / 통합 / 퍼즈 / 커널 검증
│   └── lab/               # 오프라인 테스트 랩 (픽스처 + 로컬 서버)
├── docs/
│   └── verification-guide.md  # 검증 및 유지보수 가이드
├── fonts/                 # 자체 호스팅 글꼴
├── public/                # Vercel 정적 플레이스홀더
├── vercel.json            # Vercel 라우팅 설정
├── wrangler.toml          # Cloudflare Workers 설정
└── package.json
```

## 라이선스

MIT © 2026 Zhong Zhiyu. All rights reserved.
