# EchoVault Web

Закрытый веб-плеер для удалённой музыки на WebDAV. Интерфейс повторяет структуру EchoVault для macOS: Library, Now Playing, Playlists, Settings и постоянный мини-плеер. Используются тот же логотип и тёмная визуальная система.

## Возможности

- обязательная Kunini-сессия до выдачи HTML, ассетов и API;
- server-side WebDAV proxy с Basic/Digest-аутентификацией;
- персональная WebDAV-конфигурация по стабильному `X-Auth-User-Id`;
- AES-256-GCM шифрование WebDAV-логина и пароля на диске;
- проверка endpoint, allowlist хостов и запрет выхода за настроенный WebDAV root;
- единая удалённая Library без отдельного WebDAV-раздела и offline/download-интерфейса;
- рекурсивные Play Folder и Shuffle Folder, поиск, очередь, избранное, shuffle/repeat, seek и range-streaming;
- совместимый с iOS/macOS импорт и экспорт `.echovaultplaylist` с переносимыми WebDAV-ссылками;
- адаптивный desktop/mobile интерфейс и Media Session metadata.

Визуальный референс: [`design/echo-vault-web-concept.png`](design/echo-vault-web-concept.png).

## Локальный запуск

Требуется Node.js 24+.

```bash
npm install
npm run dev
```

Development-режим слушает `127.0.0.1:3338` и создаёт только временную in-memory WebDAV-конфигурацию. `AUTH_MODE=dev` запрещён при `NODE_ENV=production`.

## Production setup

1. Создать ключ шифрования:

   ```bash
   openssl rand -base64 32
   ```

2. Для PM2 задать в `.env.runtime` (для Docker Compose — в shell environment или локальном `.env`):

   - `CREDENTIALS_KEY` — результат команды выше;
   - `WEBDAV_ALLOWED_HOSTS` — разрешённые WebDAV hostname через запятую;
   - при необходимости `CREDENTIALS_FILE` (по умолчанию `data/credentials.json`).

3. Запустить сервис через `docker compose up -d --build` либо PM2 с [`ecosystem.config.cjs`](ecosystem.config.cjs). Compose публикует upstream только на `127.0.0.1:3338`.
4. Для подготовленного hostname `music.kunini.ru` применить [`scripts/install-nginx.sh`](scripts/install-nginx.sh). Скрипт получает/обновляет сертификат, устанавливает production-конфиг и выполняет `nginx -t` перед reload.

### Обновление production через Git

Production checkout отслеживает `origin/main`. Обновление запускается от пользователя `dekunin`:

```bash
ssh dekunin@62.217.190.139 'cd /var/apps/echo-vault-web && ./scripts/update-production.sh'
```

Скрипт принимает только fast-forward обновление, отказывается работать при изменённых tracked-файлах, выполняет `npm ci`, полный `npm run validate`, reload и сохранение PM2, затем проверяет loopback API. `.env.runtime`, `data/`, dependencies и build output исключены из Git; production-секреты и зашифрованные WebDAV credentials не переносятся в репозиторий.

Backend доверяет `X-Auth-*` только потому, что доступен исключительно через loopback nginx. Nginx очищает входящие заголовки, проверяет cookie через `auth.kunini.ru/verify` и выставляет идентичность из ответа. Прямой production-запуск на публичном интерфейсе не поддерживается.

## WebDAV setup в приложении

Settings → WebDAV содержит те же обязательные данные, что и native EchoVault:

- полный Server address вместе с корневым маршрутом музыки;
- Username;
- Password;
- явный opt-in для небезопасного HTTP.

При сохранении соединение проверяется `PROPFIND Depth: 0`; только после успешной проверки конфигурация шифруется и записывается. Пароль не возвращается в браузер и не попадает в URL аудиопотока.

Для single-vault deployment можно один раз записать конфигурацию под служебным идентификатором `__default__` через loopback API. Она остаётся зашифрованной и доступна всем прошедшим Kunini Auth пользователям, пока конкретный пользователь не сохранит персональное переопределение.

## Плейлисты

Playlists импортирует и экспортирует версионированные файлы `.echovaultplaylist` формата `com.dkunin.echovault.playlist`, совместимые с EchoVault для iOS и macOS. Файл содержит порядок, отображаемые метаданные и переносимые абсолютные ссылки `webdav-track:` / `webdav-folder:`; credentials и аудиоданные не экспортируются. Импортированные плейлисты хранятся локально в браузере отдельно для каждого Kunini-пользователя.

## Маршруты

Все маршруты защищены единым auth middleware, включая статические файлы.

| Route | Назначение |
| --- | --- |
| `GET /api/session` | текущая Kunini-идентичность |
| `GET /api/settings/webdav` | безопасное представление настроек без пароля |
| `PUT /api/settings/webdav` | проверка и сохранение WebDAV connection |
| `GET /api/webdav/items?path=` | `PROPFIND` папки внутри root |
| `GET /api/webdav/stream?path=` | поток аудио с поддержкой `Range` |

## Проверка

```bash
npm run validate
npm audit
```

## Ограничения

- браузерная поддержка AIFF/CAF/ALAC зависит от конкретного браузера;
- offline downloads и синхронизация пользовательских плейлистов между браузерами пока не реализованы;
- allowlist WebDAV-хостов обязателен в production и должен быть задан оператором перед запуском.
