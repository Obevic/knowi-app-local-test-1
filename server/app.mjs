import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 8080;

// Resolve the web root (../web relative to this service file)
const webRoot = path.resolve(__dirname, '..', 'web');
const indexHtmlPath = path.join(webRoot, 'index.html');

// Parse JSON bodies (no API routes use it, but keep it available and bounded)
app.use(express.json({ limit: '256kb' }));

// No /api/* routes are defined for this app.
// Ensure unknown /api/* requests return a clean 404 rather than the SPA fallback.
app.use('/api/', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Serve static web files (GET and HEAD / return index.html)
app.use(express.static(webRoot));

// SPA fallback for client-side routes (GET/HEAD only, never /api/*)
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(indexHtmlPath);
});

app.listen(PORT, '0.0.0.0');