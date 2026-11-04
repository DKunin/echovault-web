# Changelog

## Unreleased

- Исправлена загрузка PWA manifest через Kunini Auth, добавлены retry и дедупликация обложек, улучшена очистка YTM-имён и выбор оригинальных студийных релизов вместо случайных live, demo и re-recording вариантов.
- Добавлено фоновое обогащение треков через бесплатный MusicBrainz API: корректные названия, исполнители и альбомы с rate limit, ограниченным retry/backoff для временных `503`, кешем, строгим порогом совпадения и безопасным filename fallback.
- Добавлены обложки Cover Art Archive в Library, Mini Player, Now Playing и Media Session; изображения выдаются через ограниченный same-origin proxy и не требуют ослабления CSP.
- WebDAV закреплён за `https://webdav.kunini.ru/music/`: произвольный endpoint и небезопасный HTTP удалены из интерфейса, а старые сохранённые профили и локальные плейлисты автоматически переходят на новый HTTPS root с прежними учётными данными.
- Доступ к музыке переведён на единый зашифрованный профиль `__default__`: WebDAV credentials больше не возвращаются и не редактируются в браузере, а профиль могут менять только server-side операторы через loopback.
- Добавлен fallback-режим для LG webOS 5+ и других старых TV-браузеров: совместимая Chromium 68+ сборка, безопасный `audio.play()`, необязательный Media Session API, UUID/File API fallbacks и CSS-деградация без современных viewport-функций.
- При открытии папки Library автоматически переключается на Tracks или Folders, если текущий вид пуст, а другой содержит музыку.

## 1.1.0 — 2026-10-08

- Отдельный WebDAV-раздел скрыт: удалённые папки открываются непосредственно внутри Library без download/offline-действий.
- В открытой папке добавлены рекурсивные Play Folder и Shuffle Folder.
- Добавлены совместимые с iOS и macOS импорт и экспорт `.echovaultplaylist` с проверкой формата, версии, размера и количества элементов.

## 1.0.0 — 2026-10-08

- Добавлен адаптивный веб-интерфейс в стиле EchoVault для macOS с оригинальным логотипом.
- Добавлены Library, Now Playing, Playlists, WebDAV, Settings, очередь и управление воспроизведением.
- Добавлена полная защита через Kunini Auth: без проверенной идентичности не выдаются HTML, ассеты или API.
- Добавлен server-side WebDAV proxy с Basic/Digest, проверкой root-path и range-streaming.
- Добавлено per-user AES-256-GCM хранение WebDAV credentials и production-конфигурация nginx/Docker.
- Добавлен зашифрованный default WebDAV profile для single-vault deployment с пользовательскими переопределениями.
- Production hostname закреплён за `music.kunini.ru` с отдельными HTML redirect и API 401 auth-потоками.
- Добавлены регрессионные тесты auth boundary, WebDAV validation, шифрования и streaming contract.
- Добавлен безопасный Git-based production update: fast-forward `main`, locked install, полная валидация, PM2 reload и loopback-проверка.
- Учтена совместимость production updater с NVM при включённом Bash `nounset` и кратким окном запуска PM2.
