import express from 'express';

const app = express();
app.use(express.json({ limit: '256kb' }));

const webRoot = new URL('../web', import.meta.url).pathname;
const indexHtmlPath = new URL('../web/index.html', import.meta.url).pathname;

async function invoke(req, capability, input) {
  const token = req.headers['x-knowi-capability-token'];
  const gatewayUrl = process.env.KNOWI_GATEWAY_URL;
  const res = await fetch(`${gatewayUrl}/v1/capabilities`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Knowi-Capability-Token': token
    },
    body: JSON.stringify({ capability, input })
  });
  const data = await res.json();
  return { status: res.status, data };
}

app.get('/api/supporters', async (req, res) => {
  try {
    const { status, data } = await invoke(req, 'data.query', {
      binding: 'supporters',
      limit: 200000
    });
    if (status >= 200 && status < 300) {
      res.json(data);
    } else {
      res.status(status).json(data);
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch supporters data' });
  }
});

app.use(express.static(webRoot));

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(indexHtmlPath);
});

app.listen(Number(process.env.PORT), '0.0.0.0');