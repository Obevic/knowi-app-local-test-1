import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, '..', 'web');
const indexHtmlPath = path.join(webRoot, 'index.html');

const app = express();
app.use(express.json({ limit: '256kb' }));

function parseViewer(req) {
  const header = req.headers['x-knowi-app-user'];
  if (!header || typeof header !== 'string') return null;
  try {
    const json = Buffer.from(header, 'base64url').toString('utf8');
    const data = JSON.parse(json);
    if (data && typeof data === 'object') {
      return { id: data.id, name: data.name, email: data.email };
    }
  } catch (err) {
    return null;
  }
  return null;
}

app.get('/api/me', (req, res) => {
  const viewer = parseViewer(req);
  res.json({ viewer });
});

app.use(express.static(webRoot));

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(indexHtmlPath);
});

const port = Number(process.env.PORT);
app.listen(port, '0.0.0.0');
