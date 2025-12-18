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

- app: доступ через nginx http://localhost:3000 (метрики приложения: /metrics на адресе app:3000)
- nginx: http://localhost:8030 (реверс-прокси на `app`)
- nginx_exporter: http://localhost:9113/metrics (метрики nginx)
- prometheus: http://localhost:9090
- alertmanager: http://localhost:9093
- am-telegram: http://localhost:9094 (принимает POST /telegram)
- grafana: http://localhost:3001

> Примечание: в docker-compose сервисы доступны друг для друга по имени сервиса (`am-telegram`, `alertmanager`, `nginx` и т.д.). Alertmanager должен использовать URL вида `http://am-telegram:9094/telegram` в `alertmanager.yml`.

## Требования

- Docker и docker-compose
- Переменные окружения (см. ниже) — для корректной отправки сообщений в Telegram

## Переменные окружения

Перед запуском задайте следующие переменные (например в `.env` в корне проекта):

- `TELEGRAM_BOT_TOKEN` — токен бота Telegram
- `TELEGRAM_CHAT_ID` — id чата/юзера, куда будут отправляться сообщения
- `NGINX_SCRAPE_URL` — URL для сбора метрик nginx (например, `http://nginx/nginx_status`)
- `GRAFANA_ADMIN_USER` — (опционально) пользователь Grafana
- `GRAFANA_ADMIN_PASSWORD` — (опционально) пароль Grafana

Пример `.env`:

```bash
TELEGRAM_BOT_TOKEN=123456:ABCDEF...
TELEGRAM_CHAT_ID=987654321
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=secret
NGINX_SCRAPE_URL=http://nginx/nginx_status
```

## Переменная `NGINX_SCRAPE_URL`

Для локального тестирования в `docker-compose.yml` экспортер nginx использует переменную `NGINX_SCRAPE_URL` (например, `http://nginx/nginx_status`).

- В локальной `docker-compose.override.yml` или `docker-compose.override.example.yml` вы можете определить nginx как пример/заглушку. Пример:

```yaml
services:
  nginx:
    image: nginx:stable-alpine
    ports:
      - "8030:80"
    volumes:
      - ./tools/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
```

- Для `nginx_exporter` в `docker-compose.yml` можно передать переменную окружения/замену в `command`:

```yaml
nginx_exporter:
  image: nginx/nginx-prometheus-exporter:0.11.0
  command: ["-nginx.scrape-uri", "${NGINX_SCRAPE_URL}"]
```

В продовой среде укажите URL вашего внешнего nginx (например, `http://nginx.example.com/nginx_status` или внутренний адрес мониторинга).

---

## Краткий гид: как добавить метрики в приложение (Node.js)

Ниже — минимальная инструкция для экспорта метрик из Node.js приложения с помощью `prom-client` и middleware.

1) Установите зависимость:

```bash
npm install prom-client
```

2) Простая конфигурация в `app`:

```js
const client = require('prom-client');
const express = require('express');
const app = express();

// collect default metrics
client.collectDefaultMetrics({ timeout: 5000 });

// histogram for request durations
const httpRequestDurationMicroseconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status']
});

// simple middleware to measure request duration
app.use((req, res, next) => {
  const end = httpRequestDurationMicroseconds.startTimer();
  res.on('finish', () => {
    end({ method: req.method, route: req.path, status: res.statusCode });
  });
  next();
});

// expose metrics
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

module.exports = app;
```

3) Websocket events: если у вас WebSocket/WS, вы можете вручную измерять время событий и инкрементировать счётчики или гистограммы.

```js
// example for ws event
const start = httpRequestDurationMicroseconds.startTimer();
// ... process event ...
start({ method: 'WS', route: 'my_event', status: '200' });
```

Примечание: в дашборде мы использовали гистограмму `http_request_duration_seconds_bucket` и группировку по лейблу `route`. Убедитесь, что ваш middleware проставляет лейбл `route` (или измените группировку в Dashboard на тот лейбл, который есть).

---

## Пример конфигурации `nginx` для метрик и проксирования

Пример минимального `nginx.conf`, который мы используем в `./tools/nginx/nginx.conf` (в репозитории):

```nginx
worker_processes 1;

http {
  upstream app_upstream { server app:3000; }

  server {
    listen 80;

    location / {
      proxy_pass http://app_upstream;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /nginx_status {
      stub_status on;
      access_log off;
      allow all;
    }

    location /health { return 200 'ok'; }
  }
}
```

Обратите внимание:
- Включён `stub_status` на `/nginx_status` — именно этот URL читает `nginx-prometheus-exporter`.
- В реальном проде рекомендуется ограничить доступ к `/nginx_status` (IP-allowlist) и/или использовать внутреннюю сеть.

---

## Быстрый старт для продового развертывания

Если у вас уже есть продовый `nginx` (вне docker-compose), рекомендуем:

1) Непосредственно настроить `stub_status` на существующем nginx и открыть его только для мониторинга (например, через internal network или firewall):

```nginx
location /nginx_status {
  stub_status on;
  allow 10.0.0.0/8; # internal network
  deny all;
}
```

2) Указать правильный `NGINX_SCRAPE_URL` в переменных окружения Prometheus/docker-compose (или в конфиге `nginx_exporter`), например:

```
NGINX_SCRAPE_URL=http://10.0.1.23:80/nginx_status
```

3) Добавить `nginx_exporter` (если вы не используете встроенный экспортёр) к вашему `docker-compose`/orchestration и убедиться, что Prometheus может достучаться до него.

4) В проде не запускайте локальный `nginx` контейнер (удаляйте/переопределяйте `docker-compose.override.yml`). Для локального развёртывания используйте `docker-compose.override.example.yml` как пример.

5) Запустите стек (prod-ready config)

```bash
docker-compose up -d --build
```

6) Проверьте, что Prometheus видит экспортёр и метрики:
- Prometheus UI: http://<prometheus-host>:9090/targets
- Grafana: откройте дашборд NGINX Overview
