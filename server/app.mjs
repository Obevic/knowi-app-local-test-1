import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, '..', 'web');
const indexHtmlPath = path.join(webRoot, 'index.html');

const app = express();

async function invoke(req, capability, input) {
  const token = req.headers['x-knowi-capability-token'];
  const response = await fetch(`${process.env.KNOWI_GATEWAY_URL}/v1/capabilities`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Knowi-Capability-Token': token || ''
    },
    body: JSON.stringify({ capability, input })
  });
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  return { status: response.status, body };
}

function parseViewer(req) {
  const header = req.headers['x-knowi-app-user'];
  if (!header) return null;
  try {
    const json = Buffer.from(header, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    return {
      id: parsed.id ?? null,
      name: parsed.name ?? null,
      email: parsed.email ?? null
    };
  } catch {
    return null;
  }
}

app.use(express.json({ limit: '256kb' }));

const SALES_FIELDS = ['AE_Name', 'Amount', 'Company', 'Created_Date', 'Opportunity_ID', 'Probability', 'Product', 'Region', 'SDR_Name', 'Stage'];

app.get('/api/session', (req, res) => {
  const viewer = parseViewer(req);
  res.json(viewer || {});
});

app.get('/api/sales', async (req, res) => {
  try {
    let columns = [];
    let rows = [];
    let offset = 0;
    let truncated = false;
    const maxIterations = 10;

    for (let i = 0; i < maxIterations; i++) {
      const result = await invoke(req, 'data.query', {
        binding: 'sales',
        fields: SALES_FIELDS,
        limit: 1000,
        offset,
        sort: [{ field: 'Created_Date', direction: 'desc' }]
      });

      if (result.status < 200 || result.status >= 300) {
        return res.status(result.status).json(result.body);
      }

      columns = result.body.columns || columns;
      rows = rows.concat(result.body.rows || []);
      truncated = !!result.body.truncated;

      if (!truncated || result.body.nextOffset === undefined) {
        truncated = false;
        break;
      }
      offset = result.body.nextOffset;
    }

    res.json({ columns, rows, truncated });
  } catch (err) {
    res.status(502).json({ error: 'Failed to load sales data' });
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
  console.log(`Sales Opportunities dashboard listening on port ${port}`);
});
