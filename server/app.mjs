import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '256kb' }));

const webRoot = path.resolve(__dirname, '../web');
const indexHtmlPath = path.join(webRoot, 'index.html');

// Small helper to invoke a governed capability through the Knowi gateway.
async function invoke(req, capability, input) {
  const token = req.headers['x-knowi-capability-token'];
  const gatewayUrl = process.env.KNOWI_GATEWAY_URL;
  if (!gatewayUrl) {
    throw new Error('KNOWI_GATEWAY_URL is not configured');
  }
  const res = await fetch(`${gatewayUrl}/v1/capabilities`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Knowi-Capability-Token': token || ''
    },
    body: JSON.stringify({ capability, input })
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text };
  }
  return { status: res.status, data };
}

// Proxy the supporters dataset through the approved data binding.
app.get('/api/supporters', async (req, res) => {
  try {
    const { status, data } = await invoke(req, 'data.query', {
      binding: 'supporters',
      limit: 200000
    });
    if (status >= 200 && status < 300) {
      res.status(status).json({
        columns: data.columns || [],
        rows: data.rows || [],
        truncated: data.truncated || false
      });
    } else {
      res.status(status).json(data);
    }
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch supporters data' });
  }
});

// Serve the web assets.
app.use(express.static(webRoot));

// SPA fallback for client-side routes.
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(indexHtmlPath);
});

const port = Number(process.env.PORT);
app.listen(port, '0.0.0.0');