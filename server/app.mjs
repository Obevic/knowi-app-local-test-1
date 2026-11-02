import express from 'express';

const app = express();
app.use(express.json({ limit: '256kb' }));

const GATEWAY_URL = process.env.KNOWI_GATEWAY_URL;

async function invoke(req, capability, input) {
  const token = req.get('X-Knowi-Capability-Token');
  const res = await fetch(`${GATEWAY_URL}/v1/capabilities`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Knowi-Capability-Token': token,
    },
    body: JSON.stringify({ capability, input }),
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

app.get('/api/opportunities', async (req, res) => {
  try {
    const { status, data } = await invoke(req, 'data.query', {
      binding: 'sales',
      limit: 200000,
    });
    if (status === 401) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (status !== 200) {
      return res.status(status).json(data);
    }
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const webRoot = new URL('../web', import.meta.url).pathname;
const indexHtmlPath = new URL('../web/index.html', import.meta.url).pathname;

app.use(express.static(webRoot));

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(indexHtmlPath);
});

const port = Number(process.env.PORT);
app.listen(port, '0.0.0.0');