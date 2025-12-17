# monitoring Metrics Demo

Небольшой демонстрационный проект для мониторинга с Prometheus и Grafana и поддержкой отправки Alertmanager -> Telegram через локальный webhook-сервис `am-telegram`.

Содержание документации:
- Краткое описание
- Список сервисов (docker-compose)
- Требования
- Переменные окружения
- Быстрый старт
- Тестирование webhook и примеры
- Где лежат конфигурации (Prometheus, Alertmanager, Grafana)
- Отладка и распространённые ошибки

---

## Описание

Проект содержит:
- `app` — демонстрационное Node.js приложение с метриками и веб-сокетом.
- `prometheus` — Prometheus для сбора метрик и генерации алертов.
- `alertmanager` — Alertmanager для маршрутизации алертов.
- `am-telegram` — простой HTTP-сервис (Express), принимающий webhook от Alertmanager и пересылающий сообщения в Telegram.
- `grafana` — Grafana с примерными дашбордами и datasource provisioning.

## Список сервисов и порты

- app: http://localhost:3000 (метрики: /metrics)
- prometheus: http://localhost:9090
- alertmanager: http://localhost:9093
- am-telegram: http://localhost:9094 (принимает POST /telegram)
- grafana: http://localhost:3001

> Примечание: в docker-compose сервисы доступны друг для друга по имени сервиса (`am-telegram`, `alertmanager` и т.д.). Alertmanager должен использовать URL вида `http://am-telegram:9094/telegram` в `alertmanager.yml`.

## Требования

- Docker и docker-compose
- Переменные окружения (см. ниже) — для корректной отправки сообщений в Telegram

## Переменные окружения

Перед запуском задайте следующие переменные (например в `.env` в корне проекта):

- `TELEGRAM_BOT_TOKEN` — токен бота Telegram
- `TELEGRAM_CHAT_ID` — id чата/юзера, куда будут отправляться сообщения
- `GRAFANA_ADMIN_USER` — (опционально) пользователь Grafana
- `GRAFANA_ADMIN_PASSWORD` — (опционально) пароль Grafana

Пример `.env`:

```bash
TELEGRAM_BOT_TOKEN=123456:ABCDEF...
TELEGRAM_CHAT_ID=987654321
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=secret
```

## Быстрый старт

1) Собрать и запустить стек:

```bash
docker-compose up --build -d
```

3) Открыть интерфейсы в браузере:
- App: http://localhost:3000/
- Prometheus: http://localhost:9090/
- Alertmanager: http://localhost:9093/
- Grafana: http://localhost:3001/
