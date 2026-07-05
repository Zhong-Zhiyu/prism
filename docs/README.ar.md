# Prism

[English](../README.md) | [简体中文](README.zh-Hans.md) | [繁體中文](README.zh-Hant.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [العربية](README.ar.md) | [فارسی](README.fa.md)

أداة تحويل اشتراكات البروكسي متعددة الصيغ، قابلة للنشر على Cloudflare Workers و Vercel.

## الصيغ المدعومة

| الصيغة | كمصدر | كمخرج |
|------|:---:|:---:|
| Clash / Mihomo (YAML) | ✅ | ✅ |
| sing-box (JSON) | ⚠️ | ⚠️ |
| Surge (INI) | ⚠️ | ⚠️ |

> ⚠️ وظائف الاستيراد والتصدير لـ sing-box و Surge **لم يتم التحقق منها بعد** وقد تحتوي على مشكلات توافق.

## النشر السريع

### الطريقة الأولى: Cloudflare Dashboard

1. قم بعمل Fork لهذا المستودع إلى حساب GitHub الخاص بك
2. سجّل الدخول إلى [Cloudflare Dashboard](https://dash.cloudflare.com) وانتقل إلى **Workers & Pages**
3. انقر على **إنشاء تطبيق** → **Connect to GitHub**
4. اختر المستودع الذي قمت بعمل Fork له → **التالي** → **نشر**

### الطريقة الثانية: Wrangler CLI

```bash
git clone https://github.com/Motrans/prism.git
cd prism
npm install
npm run deploy
```

### الطريقة الثالثة: Vercel

```bash
git clone https://github.com/Motrans/prism.git
cd prism
npm install
npx vercel deploy --prod
```

لا حاجة لخطوة بناء — `api/index.js` المُبنى مسبقًا مضمن في المستودع.

## التطوير المحلي

```bash
npm run dev          # Cloudflare Workers → http://localhost:8787
npm run dev:vercel   # Vercel (Node.js)  → http://localhost:8788
npm run build        # حزمة لـ Cloudflare Workers
npm run build:vercel # إعادة بناء api/index.js لـ Vercel
```

## هيكل المشروع

```
prism/
├── src/
│   ├── worker.ts          # توجيه Worker + API التحويل
│   ├── vercel.ts          # مصدر محول Vercel
│   ├── frontend/          # HTML / CSS / سكريبت العميل
│   ├── parsers/           # محللات الاشتراك والإعدادات
│   ├── generators/        # مولدات تنسيق الإخراج
│   └── utils/             # تعريفات الأنواع + المعاملات الافتراضية
├── api/
│   └── index.js           # دالة Vercel مبنية مسبقًا
├── scripts/
│   └── dev-vercel.js      # خادم تطوير Vercel المحلي
├── public/                # عنصر نائب ثابت لـ Vercel
├── vercel.json            # إعدادات توجيه Vercel
├── wrangler.toml          # إعدادات Cloudflare Workers
└── package.json
```

## الترخيص

MIT © 2026 Zhong Zhiyu. All rights reserved.
