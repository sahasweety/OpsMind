'use strict';
/**
 * Mock HTTP Receiver for Webhook Verification
 * Runs on host machine on 0.0.0.0:9999 so Docker containers can reach it
 * via http://host.docker.internal:9999/wh
 */
const http = require('node:http');

let currentMode = '200'; // '200', '500', '404', 'timeout', 'redirect'
let timeoutDelay = 6000;
let lastRequestHeaders = {};
let lastRequestBody = '';
let requestCount = 0;
let deliveryHistory = [];

const server = http.createServer((req, res) => {
  // Control endpoints
  if (req.url === '/_control/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      requestCount,
      lastRequestHeaders,
      lastRequestBody,
      deliveryHistoryCount: deliveryHistory.length
    }));
  }

  if (req.url === '/_control/reset') {
    requestCount = 0;
    lastRequestHeaders = {};
    lastRequestBody = '';
    deliveryHistory = [];
    currentMode = '200';
    timeoutDelay = 6000;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (req.url.startsWith('/_control/set-mode/')) {
    currentMode = req.url.replace('/_control/set-mode/', '');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ mode: currentMode }));
  }

  // Delivery target endpoint
  requestCount++;
  const headers = req.headers;
  lastRequestHeaders = headers;

  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    const rawBody = Buffer.concat(chunks).toString('utf8');
    lastRequestBody = rawBody;
    deliveryHistory.push({
      time: Date.now(),
      method: req.method,
      url: req.url,
      headers: { ...headers },
      body: rawBody
    });

    if (currentMode === 'timeout') {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, delayed: true }));
      }, timeoutDelay);
      return;
    }

    if (currentMode === '500') {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Internal Server Error' }));
    }

    if (currentMode === '404') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Not Found' }));
    }

    if (currentMode === 'redirect') {
      res.writeHead(302, { 'Location': 'http://127.0.0.1:9999/wh-redirect-target' });
      return res.end();
    }

    // Default 200 OK
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, received: true }));
  });
});

const PORT = 9999;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[MockReceiver] Listening on 0.0.0.0:${PORT}`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
