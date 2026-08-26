# Prism

[English](../README.md) | [简体中文](README.zh-Hans.md) | [繁體中文](README.zh-Hant.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [العربية](README.ar.md) | [فارسی](README.fa.md)

Công cụ chuyển đổi đăng ký proxy đa định dạng, có thể triển khai trên Cloudflare Workers và Vercel.

## Định dạng được hỗ trợ

| Định dạng | Nguồn | Đầu ra |
|------|:---:|:---:|
| Clash / Mihomo (YAML) | ✅ | ✅ |
| sing-box (JSON) | ⚠️ | ⚠️ |
| Surge (INI) | ⚠️ | ⚠️ |

> ⚠️ Chức năng nhập và xuất đối với sing-box và Surge **chưa được kiểm chứng** và có thể gặp vấn đề tương thích.

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
├── public/                # Thư mục tĩnh Vercel
├── vercel.json            # Cấu hình định tuyến Vercel
├── wrangler.toml          # Cấu hình Cloudflare Workers
└── package.json
```

## Giấy phép

MIT © 2026 Zhong Zhiyu. All rights reserved.
