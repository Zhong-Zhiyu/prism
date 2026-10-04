# Prism

[English](../README.md) | [简体中文](README.zh-Hans.md) | [繁體中文](README.zh-Hant.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [العربية](README.ar.md) | [فارسی](README.fa.md)

أداة تحويل اشتراكات البروكسي متعددة الصيغ، قابلة للنشر على Cloudflare Workers و Vercel.

## الصيغ المدعومة

| الصيغة | كمصدر | كمخرج | تم التحقق بواسطة |
|--------|:---:|:---:|------|
| Clash / Mihomo (YAML) | ✅ | ✅ | Clash Verge Rev |
| sing-box (JSON) | ❌ | ⚠️ | Android ✅ / iOS ❌ |
| Surge (INI) | ❌ | ⚠️ | Surfboard |

> يجب أن يكون مصدر الاشتراك بصيغة Clash / Mihomo YAML. صيغتا sing-box JSON و Surge INI للإخراج فقط.<br>
> **ملاحظة:** تم التحقق من مخرجات sing-box على Android، لكن خدمة VPN لا تعمل على iOS. تم التحقق من مخرجات Surge باستخدام Surfboard. راجع [دليل التحقق والصيانة](verification-guide.md).

## النشر السريع

### الطريقة الأولى: Cloudflare Dashboard

1. قم بعمل Fork لهذا المستودع إلى حساب GitHub الخاص بك
2. سجّل الدخول إلى [Cloudflare Dashboard](https://dash.cloudflare.com) وانتقل إلى **Workers & Pages**
3. انقر على **إنشاء تطبيق** → **Connect to GitHub**
4. اختر المستودع الذي قمت بعمل Fork له → **التالي** → **نشر**

### الطريقة الثانية: Wrangler CLI

```bash
git clone https://github.com/Zhong-Zhiyu/prism.git
cd prism
npm install
npm run deploy
```

### الطريقة الثالثة: Vercel

```bash
git clone https://github.com/Zhong-Zhiyu/prism.git
cd prism
npm install
npx vercel deploy --prod
```

يشغّل Vercel الأمر `npm run build:vercel` أثناء النشر لبناء `api/index.js`؛ ويمكنك تشغيل الأمر نفسه محليًا للتحقق من عملية البناء.

## التطوير المحلي

```bash
npm run dev          # Cloudflare Workers → http://localhost:8787
npm run dev:vercel   # Vercel (Node.js)  → http://localhost:8788
npm run build        # حزمة لـ Cloudflare Workers
npm run build:vercel # إعادة بناء api/index.js لـ Vercel
```

## الاختبار

```bash
npm test          # 139 اختبار وحدة / تكامل (بدون تبعيات خارجية)
npm run check     # الاختبارات + فحص الأنواع + كلا البناءين
```

يتم التحقق من المخرجات أيضًا باستخدام نواة `mihomo` و`sing-box` الحقيقية
(يلزم توفر الملفين التنفيذيين؛ طريقة الحصول عليهما في دليل التحقق):

```bash
MIHOMO_BIN=~/tools/bin/mihomo SINGBOX_BIN=~/tools/bin/sing-box npm run verify:kernel
```

إذا لم تكن النواة متوفرة، تُعلَّم النتيجة بـ SKIP وليس بالفشل، لذا فهي آمنة في CI.

**[دليل التحقق والصيانة](verification-guide.md)** يشرح التحقق على مستوى النواة، والتحقق الفعلي باستخدام اشتراك حقيقي، وبناء مختبر محلي، والفحوصات المطلوبة بعد كل نوع من التغييرات.

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
├── test/                  # اختبارات الوحدة / التكامل / الضبابية / النواة
│   └── lab/               # مختبر محلي (بيانات ثابتة + خادم)
├── docs/
│   └── verification-guide.md  # دليل التحقق والصيانة
├── fonts/                 # خطوط مستضافة ذاتيًا
├── public/                # عنصر نائب ثابت لـ Vercel
├── vercel.json            # إعدادات توجيه Vercel
├── wrangler.toml          # إعدادات Cloudflare Workers
└── package.json
```

## الترخيص

MIT © 2026 Zhong Zhiyu. All rights reserved.
