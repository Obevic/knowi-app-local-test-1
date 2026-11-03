import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 8080;

app.use(express.json({ limit: '256kb' }));

const webRoot = path.resolve(__dirname, '../web');
const indexHtmlPath = path.join(webRoot, 'index.html');

app.use(express.static(webRoot));

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(indexHtmlPath);
});

app.listen(PORT, '0.0.0.0');