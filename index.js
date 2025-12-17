// ...existing code...
const express = require('express');
const client = require('prom-client');
const { WebSocketServer } = require('ws');

const app = express();
const register = client.register;

// Metrics
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.3, 1, 2, 5]
});

const wsEventDuration = new client.Histogram({
  name: 'ws_event_duration_seconds',
  help: 'Duration of WebSocket events processing in seconds',
  labelNames: ['event', 'direction', 'result'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1]
});

// Middleware to measure HTTP
app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    end({ method: req.method, route: req.path, status: res.statusCode });
  });
  next();
});

// Demo endpoints
app.get('/', (req, res) => {
  // Simulate work
  const delay = Math.random() * 500;
  setTimeout(() => res.send('Hello World'), delay);
});

app.get('/slow', (req, res) => {
  const delay = 500 + Math.random() * 1000;
  setTimeout(() => res.send('Slow response'), delay);
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

const server = app.listen(3000, () => console.log('App listening on 3000'));

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  // Send periodic messages to client
  const interval = setInterval(() => {
    const start = Date.now();
    // simulate processing
    const processing = Math.random() * 200;
    setTimeout(() => {
      const duration = (Date.now() - start) / 1000;
      wsEventDuration.observe({ event: 'server_ping', direction: 'out', result: 'ok' }, duration);
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: 'ping', ts: Date.now() }));
    }, processing);
  }, 2000);

  ws.on('message', (message) => {
    const start = Date.now();
    // emulate handling
    const processing = Math.random() * 300;
    setTimeout(() => {
      const duration = (Date.now() - start) / 1000;
      wsEventDuration.observe({ event: 'client_msg', direction: 'in', result: 'ok' }, duration);
      ws.send(JSON.stringify({ echo: message.toString() }));
    }, processing);
  });

  ws.on('close', () => clearInterval(interval));
});

// Simulate internal generation of WS events
setInterval(() => {
  const start = Date.now();
  const processing = Math.random() * 100;
  setTimeout(() => {
    const duration = (Date.now() - start) / 1000;
    wsEventDuration.observe({ event: 'internal_job', direction: 'in', result: Math.random() > 0.9 ? 'error' : 'ok' }, duration);
  }, processing);
}, 1500);


client.collectDefaultMetrics({ register });