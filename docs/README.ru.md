# Prism

[English](../README.md) | [简体中文](README.zh-Hans.md) | [繁體中文](README.zh-Hant.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [العربية](README.ar.md) | [فارسی](README.fa.md)

Конвертер прокси-подписок с поддержкой разных форматов, разворачиваемый на Cloudflare Workers и Vercel.

## Поддерживаемые форматы

| Формат | Как источник | Как вывод | Проверено в клиенте |
|--------|:---:|:---:|------|
| Clash / Mihomo (YAML) | ✅ | ✅ | Clash Verge Rev |
| sing-box (JSON) | ❌ | ⚠️ | Android ✅ / iOS ❌ |
| Surge (INI) | ❌ | ⚠️ | Surfboard |

> Источник подписки должен быть в формате Clash / Mihomo YAML. sing-box JSON и Surge INI — только для вывода.<br>
> **Примечание.** Вывод sing-box проверен на Android, но на iOS VPN-сервис не запускается. Вывод Surge проверен в Surfboard. Подробнее см. [руководство по проверке и сопровождению](verification-guide.md).

## Быстрое развёртывание

### Способ 1: Cloudflare Dashboard

1. Форкните этот репозиторий на GitHub
2. Войдите в [Cloudflare Dashboard](https://dash.cloudflare.com) и перейдите в **Workers & Pages**
3. Нажмите **Создать приложение** → **Connect to GitHub**
4. Выберите форкнутый репозиторий → **Далее** → **Развернуть**

### Способ 2: Wrangler CLI

```bash
git clone https://github.com/Zhong-Zhiyu/prism.git
cd prism
npm install
npm run deploy
```

### Способ 3: Vercel

```bash
git clone https://github.com/Zhong-Zhiyu/prism.git
cd prism
npm install
npx vercel deploy --prod
```

Во время деплоя Vercel запускает `npm run build:vercel` для сборки `api/index.js`; ту же команду можно выполнить локально, чтобы проверить сборку.

## Локальная разработка

```bash
npm run dev          # Cloudflare Workers → http://localhost:8787
npm run dev:vercel   # Vercel (Node.js)  → http://localhost:8788
npm run build        # Сборка для Cloudflare Workers
npm run build:vercel # Пересборка api/index.js для Vercel
```

## Тестирование

```bash
npm test          # 139 модульных / интеграционных тестов (без внешних зависимостей)
npm run check     # тесты + проверка типов + обе сборки
```

Вывод также проверяется реальными ядрами `mihomo` и `sing-box`
(нужны оба бинарника; как их получить — см. руководство по проверке):

```bash
MIHOMO_BIN=~/tools/bin/mihomo SINGBOX_BIN=~/tools/bin/sing-box npm run verify:kernel
```

Если ядра не найдены, это отмечается как SKIP, а не как ошибка, поэтому команда безопасна для CI.

**[Руководство по проверке и сопровождению](verification-guide.md)** описывает проверку на уровне ядра, запуск с реальной подпиской, создание локальной лаборатории и проверки, необходимые после каждого типа изменений.

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
├── test/                  # Модульные / интеграционные / фаззинг-тесты, проверка ядром
│   └── lab/               # Локальная лаборатория (фикстуры + сервер)
├── docs/
│   └── verification-guide.md  # Руководство по проверке и сопровождению
├── fonts/                 # Собственные шрифты
├── public/                # Статический заполнитель Vercel
├── vercel.json            # Конфигурация маршрутизации Vercel
├── wrangler.toml          # Конфигурация Cloudflare Workers
└── package.json
```

## Лицензия

MIT © 2026 Zhong Zhiyu. All rights reserved.
