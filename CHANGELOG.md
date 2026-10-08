# Changelog

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
