# Prism

[English](../README.md) | [简体中文](README.zh-Hans.md) | [繁體中文](README.zh-Hant.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [العربية](README.ar.md) | [فارسی](README.fa.md)

Конвертер прокси-подписок с поддержкой разных форматов, разворачиваемый на Cloudflare Workers и Vercel.

## Поддерживаемые форматы

| Формат | Источник | Вывод |
|------|:---:|:---:|
| Clash / Mihomo (YAML) | ✅ | ✅ |
| sing-box (JSON) | ⚠️ | ⚠️ |
| Surge (INI) | ⚠️ | ⚠️ |

> ⚠️ Функции импорта и экспорта для sing-box и Surge **не были проверены** и могут содержать проблемы совместимости.

## Быстрое развёртывание

### Способ 1: Cloudflare Dashboard

1. Форкните этот репозиторий на GitHub
2. Войдите в [Cloudflare Dashboard](https://dash.cloudflare.com) и перейдите в **Workers & Pages**
3. Нажмите **Создать приложение** → **Connect to GitHub**
4. Выберите форкнутый репозиторий → **Далее** → **Развернуть**

### Способ 2: Wrangler CLI

```bash
git clone https://github.com/Motrans/prism.git
cd prism
npm install
npm run deploy
```

### Способ 3: Vercel

```bash
git clone https://github.com/Motrans/prism.git
cd prism
npm install
npx vercel deploy --prod
```

Сборка не требуется — предварительно собранный `api/index.js` уже включён в репозиторий.

## Локальная разработка

```bash
npm run dev          # Cloudflare Workers → http://localhost:8787
npm run dev:vercel   # Vercel (Node.js)  → http://localhost:8788
npm run build        # Сборка для Cloudflare Workers
npm run build:vercel # Пересборка api/index.js для Vercel
```

## Структура проекта

```
prism/
├── src/
│   ├── worker.ts          # Маршруты Worker + API конвертации
│   ├── vercel.ts          # Исходник адаптера Vercel
│   ├── frontend/          # HTML / CSS / клиентские скрипты
│   ├── parsers/           # Парсеры подписок и конфигураций
│   ├── generators/        # Генераторы выходных форматов
│   └── utils/             # Типы + параметры по умолчанию
├── api/
│   └── index.js           # Предварительно собранная функция Vercel
├── scripts/
│   └── dev-vercel.js      # Локальный сервер разработки Vercel
├── public/                # Статический заполнитель Vercel
├── vercel.json            # Конфигурация маршрутизации Vercel
├── wrangler.toml          # Конфигурация Cloudflare Workers
└── package.json
```

## Лицензия

MIT © 2026 Zhong Zhiyu. All rights reserved.
