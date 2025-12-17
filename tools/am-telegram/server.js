const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

async function sendToTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error('Telegram bot token or chat id not set');
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const payload = {
    chat_id: TELEGRAM_CHAT_ID,
    text,
    parse_mode: 'MarkdownV2'
  };

  // simple retry
  for (let i = 0; i < 3; i++) {
    try {
      const resp = await axios.post(url, payload, { timeout: 5000 });
      return resp.data;
    } catch (err) {
      const msg = err.response ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}` : err.message;
      console.error(`Telegram send attempt ${i+1} failed: ${msg}`);
      if (i === 2) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i+1)));
    }
  }
}

// Helper: escape text for MarkdownV2
function escapeMdV2(s) {
  if (s === undefined || s === null) return '';
  const special = '_*[]()~`>#+-=|{}\\.!';
  return String(s).split('').map(ch => special.includes(ch) ? '\\' + ch : ch).join('');
}

function formatAlerts(payload) {
  if (!payload || !payload.alerts) return 'Empty alert';

  // icons
  const statusIcons = {
    firing: '🚨',
    resolved: '✅'
  };
  const severityIcons = {
    critical: '🔥',
    warning: '⚠️',
    info: 'ℹ️'
  };

  const alertsText = payload.alerts.map(a => {
    const status = (a.status || 'firing').toLowerCase();
    const labels = a.labels || {};
    const annotations = a.annotations || {};
    const summary = annotations.summary || '';
    const description = annotations.description || '';

    const statusIcon = statusIcons[status] || '🔔';
    const severity = (labels.severity || '').toLowerCase();
    const severityIcon = severityIcons[severity] || '';

    const alertName = escapeMdV2(labels.alertname || 'alert');
    const summaryEsc = escapeMdV2(summary);
    const descEsc = escapeMdV2(description);

    const lines = [];
    // Title line: icon + bold alert name + severity icon + status
    // Экрануем литеральные скобки \( и \) чтобы Telegram MarkdownV2 не ругался
    lines.push(`${statusIcon} *${alertName}* ${severityIcon} \\(${escapeMdV2(status)}\\)`);

    if (summaryEsc) lines.push(`_${summaryEsc}_`);
    if (descEsc) lines.push(descEsc);

    // attach some useful labels (instance, job, etc.)
    const usefulLabels = ['instance', 'job'];
    const extra = Object.entries(labels)
      .filter(([k]) => !['alertname', 'severity'].includes(k) && usefulLabels.includes(k))
      .map(([k, v]) => `${escapeMdV2(k)}=${escapeMdV2(v)}`)
      .join(', ');
    if (extra) lines.push(`Labels: ${extra}`);

    return lines.join('\n');
  }).join('\n\n');

  // Telegram message size limit ~4096, keep some headroom
  const maxLen = 3800;
  if (alertsText.length > maxLen) {
    return alertsText.slice(0, maxLen - 3) + '...';
  }
  return alertsText;
}

app.post('/telegram', async (req, res) => {
  console.log('[am-telegram] Received webhook from Alertmanager');
  console.log(JSON.stringify(req.body, null, 2));

  const text = formatAlerts(req.body);

  try {
    const data = await sendToTelegram(text);
    console.log('[am-telegram] Telegram API response:', JSON.stringify(data));
    res.status(200).send('ok');
  } catch (err) {
    const msg = err.response ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}` : err.message;
    console.error('[am-telegram] Failed to send telegram message:', msg);
    res.status(500).send('failed');
  }
});

const port = process.env.PORT || 9094;
app.listen(port, ()=> console.log('am-telegram listening on', port));
