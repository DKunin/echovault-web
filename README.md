# EchoVault Web

Закрытый веб-плеер для удалённой музыки на WebDAV. Интерфейс повторяет структуру EchoVault для macOS: Library, Now Playing, Playlists, Settings и постоянный мини-плеер. Используются тот же логотип и тёмная визуальная система.

## Возможности

- обязательная Kunini-сессия до выдачи HTML, ассетов и API;
- server-side WebDAV proxy с Basic/Digest-аутентификацией;
- единый server-managed WebDAV-профиль для всех пользователей Kunini Auth;
- AES-256-GCM шифрование WebDAV-логина и пароля на диске;
- прямое server-side подключение только к `https://webdav.kunini.ru/music/` и запрет выхода за WebDAV root;
- единая удалённая Library без отдельного WebDAV-раздела и offline/download-интерфейса;
- автоматическая очистка имён файлов и фоновое обогащение названий, исполнителей и альбомов через MusicBrainz;
- обложки альбомов из Cover Art Archive через same-origin proxy без ослабления CSP;
- рекурсивные Play Folder и Shuffle Folder, поиск, очередь, избранное, shuffle/repeat, seek и range-streaming;
- совместимый с iOS/macOS импорт и экспорт `.echovaultplaylist` с переносимыми WebDAV-ссылками;
- адаптивный desktop/mobile интерфейс и Media Session metadata.
- автоматический fallback-режим для старых TV-браузеров и совместимая сборка для Chromium 68+ (LG webOS 5+).

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
   - `WEBDAV_ALLOWED_HOSTS` — дополнительные разрешённые WebDAV hostname через запятую (необязательно; `webdav.kunini.ru` разрешён всегда);
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

Settings → WebDAV показывает состояние единого подключения к `https://webdav.kunini.ru/music/`, но не принимает и не возвращает credentials. Логин и пароль хранятся только в AES-256-GCM-зашифрованном профиле `__default__` на сервере и используются для всех пользователей, прошедших Kunini Auth. Пользовательские профили игнорируются.

Первичная настройка и ротация профиля разрешены только через loopback API с доверенным `X-Auth-User-Id: __default__`; публичный nginx очищает входящие `X-Auth-*`, поэтому пользователь не может подменить профиль. При записи соединение проверяется `PROPFIND Depth: 0`. Ранее сохранённые ссылки в локальных плейлистах автоматически переходят на закреплённый HTTPS origin.

## Плейлисты

Playlists импортирует и экспортирует версионированные файлы `.echovaultplaylist` формата `com.dkunin.echovault.playlist`, совместимые с EchoVault для iOS и macOS. Файл содержит порядок, отображаемые метаданные и переносимые абсолютные ссылки `webdav-track:` / `webdav-folder:`; credentials и аудиоданные не экспортируются. Импортированные плейлисты хранятся локально в браузере отдельно для каждого Kunini-пользователя.

## Метаданные

Названия файлов сначала очищаются локально, включая трёх- и четырёхчастный формат `YTM-… - channel - artist - title`. Затем backend последовательно запрашивает MusicBrainz с обязательным идентифицирующим `User-Agent`, соблюдает лимит не чаще одного запроса в 1,1 секунды, ограниченно повторяет временные ошибки с backoff и кеширует успешные результаты на 30 дней. Поиск проверяет до четырёх страниц по 100 кандидатов только для неоднозначных результатов и предпочитает оригинальную студийную запись официальному live, demo, remix или re-recording варианту. Применяются только совпадения с высокой уверенностью по названию и исполнителю; при ошибке или сомнительном результате сохраняется безопасный filename fallback.

Для найденного release group обложка размером 500 px загружается из Cover Art Archive через защищённый маршрут EchoVault. Временные ошибки повторяются с ограниченным backoff, а одновременные запросы одной обложки объединяются. Браузер не подключается к сторонним origin напрямую. MusicBrainz получает только очищенные название и исполнителя, выведенные из имени файла; WebDAV credentials, URL потока и Kunini identity наружу не передаются.

## Маршруты

Все маршруты защищены единым auth middleware, включая статические файлы.

| Route | Назначение |
| --- | --- |
| `GET /api/session` | текущая Kunini-идентичность |
| `GET /api/settings/webdav` | безопасное представление настроек без пароля |
| `PUT /api/settings/webdav` | проверка и сохранение WebDAV connection |
| `GET /api/webdav/items?path=` | `PROPFIND` папки внутри root |
| `GET /api/webdav/stream?path=` | поток аудио с поддержкой `Range` |
| `GET /api/metadata/track?path=` | нормализованные MusicBrainz metadata с filename fallback |
| `GET /api/metadata/artwork/:releaseGroupId` | ограниченный proxy обложки Cover Art Archive |

## Проверка

```bash
npm run validate
npm audit
```

## Совместимость с TV-браузерами

Для LG webOS 5 и более новых версий production-сборка транспилируется под Chromium 68+ и добавляет необходимые JavaScript polyfills. На старых TV-движках автоматически отключаются необязательные Media Session metadata и тяжёлые blur-эффекты; вызов `audio.play()` поддерживает как современный Promise-результат, так и старый `void`-контракт.

Fallback-режим можно принудительно включить параметром `?compat=fallback` или отключить для диагностики через `?compat=modern`. Реальное воспроизведение всё равно зависит от поддерживаемого телевизором аудиокодека; MP3/AAC/M4A остаются наиболее переносимыми форматами.

## Ограничения

- браузерная поддержка AIFF/CAF/ALAC зависит от конкретного браузера;
- offline downloads и синхронизация пользовательских плейлистов между браузерами пока не реализованы;
- WebDAV root закреплён за `https://webdav.kunini.ru/music/`; дополнительные hostname можно разрешить только для служебной совместимости, но пользовательский трафик на них не направляется.
- webOS 4 и более старые версии не входят в гарантированный диапазон из-за отсутствия необходимых layout-возможностей браузера.
