import express from 'express';

const app = express();
app.use(express.json({ limit: '256kb' }));

const webRoot = new URL('../web', import.meta.url).pathname;
const indexHtmlPath = new URL('../web/index.html', import.meta.url).pathname;

// Small helper to invoke a governed capability through the Knowi gateway.
async function invoke(req, capability, input) {
  const token = req.headers['x-knowi-capability-token'];
  const gatewayUrl = process.env.KNOWI_GATEWAY_URL;
  if (!gatewayUrl) {
    return { status: 500, body: { error: 'Gateway not configured' } };
  }
  try {
    const res = await fetch(`${gatewayUrl}/v1/capabilities`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Knowi-Capability-Token': token || ''
      },
      body: JSON.stringify({ capability, input })
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: text };
    }
    return { status: res.status, body };
  } catch (err) {
    return { status: 502, body: { error: 'Upstream request failed' } };
  }
}

// GET /api/supporters — proxy the 'supporters' data binding.
app.get('/api/supporters', async (req, res) => {
  const { status, body } = await invoke(req, 'data.query', {
    binding: 'supporters',
    limit: 200000
  });
  res.status(status).json(body);
});

// Static files.
app.use(express.static(webRoot));

// SPA fallback (after /api routes and static files).
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(indexHtmlPath);
});

const port = Number(process.env.PORT);
app.listen(port, '0.0.0.0');