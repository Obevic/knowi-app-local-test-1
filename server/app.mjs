import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, '..', 'web');
const indexHtmlPath = path.join(webRoot, 'index.html');

const app = express();
app.use(express.json({ limit: '256kb' }));

async function invoke(req, capability, input) {
  const token = req.get('X-Knowi-Capability-Token');
  const response = await fetch(`${process.env.KNOWI_GATEWAY_URL}/v1/capabilities`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Knowi-Capability-Token': token || ''
    },
    body: JSON.stringify({ capability, input })
  });
  const result = await response.json();
  if (!response.ok) {
    const message = (result && result.error) || `Capability ${capability} failed`;
    throw new Error(message);
  }
  return result;
}

app.use(express.static(webRoot));

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(indexHtmlPath);
});

const port = Number(process.env.PORT);
app.listen(port, '0.0.0.0');
