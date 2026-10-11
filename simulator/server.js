require('dotenv').config();
const express = require('express');

const app = express();
app.use(express.json());

const axios = require('axios');

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: "OpsMind Simulator is running"
  });
});

const INGEST_URL = process.env.INGEST_URL || 'http://localhost:5000/api/ingest';
const SERVICE_ID = process.env.SERVICE_ID;
const INGEST_SECRET = process.env.INGEST_SECRET;

app.post('/api/simulate/healthy', async (req, res) => {
  if (!SERVICE_ID || !INGEST_SECRET) return res.status(500).json({ error: 'Missing SERVICE_ID or INGEST_SECRET' });
  try {
    await axios.post(`${INGEST_URL}/${SERVICE_ID}/logs`, {
      level: 'info',
      message: 'System operating normally'
    }, { headers: { Authorization: `Bearer ${INGEST_SECRET}` } });
    res.json({ success: true, message: 'Sent healthy log' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/simulate/error', async (req, res) => {
  if (!SERVICE_ID || !INGEST_SECRET) return res.status(500).json({ error: 'Missing SERVICE_ID or INGEST_SECRET' });
  try {
    await axios.post(`${INGEST_URL}/${SERVICE_ID}/logs`, {
      level: 'error',
      message: 'Database connection timeout',
      metadata: { code: 500, service: 'auth-db' }
    }, { headers: { Authorization: `Bearer ${INGEST_SECRET}` } });
    res.json({ success: true, message: 'Sent error log' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/simulate/invalid', async (req, res) => {
  if (!SERVICE_ID) return res.status(500).json({ error: 'Missing SERVICE_ID' });
  try {
    await axios.post(`${INGEST_URL}/${SERVICE_ID}/logs`, {
      level: 'info',
      message: 'This should be rejected'
    }, { headers: { Authorization: `Bearer bad-secret` } });
    res.json({ success: true, message: 'Sent with bad secret (should not reach here)' });
  } catch (err) {
    res.json({ success: true, message: `Rejected as expected: ${err.message}` });
  }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Simulator running on port ${PORT}`);
});
