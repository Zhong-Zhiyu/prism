# Prism

[English](../README.md) | [简体中文](README.zh-Hans.md) | [繁體中文](README.zh-Hant.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [العربية](README.ar.md) | [فارسی](README.fa.md)

ابزار تبدیل اشتراک پروکسی چند فرمتی، قابل استقرار بر روی Cloudflare Workers و Vercel.

## فرمت‌های پشتیبانی‌شده

| فرمت | به‌عنوان منبع | به‌عنوان خروجی |
|------|:---:|:---:|
| Clash / Mihomo (YAML) | ✅ | ✅ |
| sing-box (JSON) | ⚠️ | ⚠️ |
| Surge (INI) | ⚠️ | ⚠️ |

> ⚠️ قابلیت ورودی و خروجی برای sing-box و Surge **هنوز تأیید نشده** و ممکن است مشکلات سازگاری داشته باشد.

## استقرار سریع

### روش ۱: Cloudflare Dashboard

1. این مخزن را در GitHub خود Fork کنید
2. وارد [Cloudflare Dashboard](https://dash.cloudflare.com) شوید و به **Workers & Pages** بروید
3. روی **ایجاد برنامه** → **Connect to GitHub** کلیک کنید
4. مخزن Fork شده را انتخاب کنید → **بعدی** → **استقرار**

### روش ۲: Wrangler CLI

```bash
git clone https://github.com/Motrans/prism.git
cd prism
npm install
npm run deploy
```

### روش ۳: Vercel

```bash
git clone https://github.com/Motrans/prism.git
cd prism
npm install
npx vercel deploy --prod
```

Vercel هنگام استقرار، دستور `npm run build:vercel` را برای ساخت `api/index.js` اجرا می‌کند؛ می‌توانید همین دستور را به‌صورت محلی برای بررسی ساخت اجرا کنید.

## توسعه محلی

```bash
npm run dev          # Cloudflare Workers → http://localhost:8787
npm run dev:vercel   # Vercel (Node.js)  → http://localhost:8788
npm run build        # بسته‌بندی برای Cloudflare Workers
npm run build:vercel # بازسازی api/index.js برای Vercel
```

## ساختار پروژه

```
prism/
├── src/
│   ├── worker.ts          # مسیریابی Worker + API تبدیل
│   ├── vercel.ts          # کد منبع آداپتور Vercel
│   ├── frontend/          # HTML / CSS / اسکریپت سمت کلاینت
│   ├── parsers/           # تجزیه‌گرهای اشتراک و پیکربندی
│   ├── generators/        # تولیدکننده‌های فرمت خروجی
│   └── utils/             # تعاریف نوع + پارامترهای پیش‌فرض
├── api/
│   └── index.js           # تابع Vercel از پیش ساخته شده
├── scripts/
│   └── dev-vercel.js      # سرور توسعه محلی Vercel
├── public/                # دایرکتوری استاتیک Vercel
├── vercel.json            # پیکربندی مسیریابی Vercel
├── wrangler.toml          # پیکربندی Cloudflare Workers
└── package.json
```

## مجوز

MIT © 2026 Zhong Zhiyu. All rights reserved.
