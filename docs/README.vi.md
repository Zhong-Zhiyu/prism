# Prism

[English](../README.md) | [简体中文](README.zh-Hans.md) | [繁體中文](README.zh-Hant.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [العربية](README.ar.md) | [فارسی](README.fa.md)

Công cụ chuyển đổi đăng ký proxy đa định dạng, có thể triển khai trên Cloudflare Workers và Vercel.

## Định dạng được hỗ trợ

| Định dạng | Làm nguồn | Làm đầu ra | Kiểm chứng bằng |
|-----------|:---:|:---:|------|
| Clash / Mihomo (YAML) | ✅ | ✅ | Clash Verge Rev |
| sing-box (JSON) | ❌ | ⚠️ | Android ✅ / iOS ❌ |
| Surge (INI) | ❌ | ⚠️ | Surfboard |

> Nguồn đăng ký phải ở định dạng Clash / Mihomo YAML. sing-box JSON và Surge INI chỉ dùng làm đầu ra.<br>
> **Lưu ý:** Đầu ra sing-box đã được kiểm chứng trên Android nhưng không khởi động được dịch vụ VPN trên iOS. Đầu ra Surge được kiểm chứng bằng Surfboard. Xem [hướng dẫn kiểm chứng và bảo trì](verification-guide.md).

## Triển khai nhanh

### Cách 1: Cloudflare Dashboard

1. Fork kho lưu trữ này về GitHub của bạn
2. Đăng nhập vào [Cloudflare Dashboard](https://dash.cloudflare.com), vào mục **Workers & Pages**
3. Nhấn **Tạo ứng dụng** → **Connect to GitHub**
4. Chọn kho lưu trữ đã fork → **Tiếp theo** → **Triển khai**

### Cách 2: Wrangler CLI

```bash
git clone https://github.com/Zhong-Zhiyu/prism.git
cd prism
npm install
npm run deploy
```

### Cách 3: Vercel

```bash
git clone https://github.com/Zhong-Zhiyu/prism.git
cd prism
npm install
npx vercel deploy --prod
```

Vercel sẽ chạy `npm run build:vercel` trong quá trình triển khai để build `api/index.js`; bạn cũng có thể chạy lệnh này cục bộ để kiểm tra quá trình build.

## Phát triển cục bộ

```bash
npm run dev          # Cloudflare Workers → http://localhost:8787
npm run dev:vercel   # Vercel (Node.js)  → http://localhost:8788
npm run build        # Đóng gói cho Cloudflare Workers
npm run build:vercel # Build lại api/index.js cho Vercel
```

## Kiểm thử

```bash
npm test          # 139 bài kiểm thử đơn vị / tích hợp (không cần phụ thuộc ngoài)
npm run check     # kiểm thử + kiểm tra kiểu + cả hai bản dựng
```

Đầu ra cũng được kiểm chứng bằng nhân `mihomo` và `sing-box` thật
(cần cả hai tệp nhị phân; cách lấy xem trong hướng dẫn kiểm chứng):

```bash
MIHOMO_BIN=~/tools/bin/mihomo SINGBOX_BIN=~/tools/bin/sing-box npm run verify:kernel
```

Nếu thiếu nhân, kết quả được đánh dấu SKIP chứ không phải thất bại, nên an toàn cho CI.

**[Hướng dẫn kiểm chứng và bảo trì](verification-guide.md)** trình bày cách kiểm chứng bằng nhân, kiểm chứng thực tế với gói đăng ký, dựng phòng thí nghiệm cục bộ, và các kiểm tra cần chạy sau mỗi loại thay đổi.

## Cấu trúc dự án

```
prism/
├── src/
│   ├── worker.ts          # Định tuyến Worker + API chuyển đổi
│   ├── vercel.ts          # Mã nguồn adapter Vercel
│   ├── frontend/          # HTML / CSS / script máy khách
│   ├── parsers/           # Trình phân tích đăng ký + cấu hình
│   ├── generators/        # Trình tạo định dạng đầu ra
│   └── utils/             # Định nghĩa kiểu + tham số mặc định
├── api/
│   └── index.js           # Hàm Vercel đã build sẵn
├── scripts/
│   └── dev-vercel.js      # Máy chủ phát triển Vercel cục bộ
├── test/                  # Kiểm thử đơn vị / tích hợp / fuzz / bằng nhân
│   └── lab/               # Phòng thí nghiệm ngoại tuyến (fixture + máy chủ cục bộ)
├── docs/
│   └── verification-guide.md  # Hướng dẫn kiểm chứng và bảo trì
├── fonts/                 # Phông chữ tự lưu trữ
├── public/                # Thư mục tĩnh Vercel
├── vercel.json            # Cấu hình định tuyến Vercel
├── wrangler.toml          # Cấu hình Cloudflare Workers
└── package.json
```

## Giấy phép

MIT © 2026 Zhong Zhiyu. All rights reserved.
