import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '../web');
const indexHtmlPath = path.join(webRoot, 'index.html');

const app = express();
app.use(express.json({ limit: '256kb' }));

function decodeAppUser(header) {
  if (!header) return null;
  try {
    const json = Buffer.from(header, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object') {
      return {
        name: typeof parsed.name === 'string' ? parsed.name : null,
        email: typeof parsed.email === 'string' ? parsed.email : null,
      };
    }
  } catch (err) {
    return null;
  }
  return null;
}

app.get('/api/session', (req, res) => {
  const user = decodeAppUser(req.headers['x-knowi-app-user']);
  if (user) {
    res.json({ name: user.name, email: user.email });
  } else {
    res.json({ name: null, email: null });
  }
});

app.use(express.static(webRoot));

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(indexHtmlPath);
});

const port = Number(process.env.PORT);
app.listen(port, '0.0.0.0', () => {
  console.log(`Inventory Desk listening on port ${port}`);
});
