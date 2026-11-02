import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, '../web');
const indexHtmlPath = path.join(webRoot, 'index.html');

const app = express();
app.use(express.json({ limit: '256kb' }));

async function invoke(req, capability, input) {
  const token = req.headers['x-knowi-capability-token'];
  const upstream = await fetch(`${process.env.KNOWI_GATEWAY_URL}/v1/capabilities`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Knowi-Capability-Token': token
    },
    body: JSON.stringify({ capability, input })
  });
  let data = {};
  try { data = await upstream.json(); } catch (e) {}
  return { status: upstream.status, body: data };
}

function parseViewer(req) {
  const header = req.headers['x-knowi-app-user'];
  if (!header) return null;
  try {
    const json = Buffer.from(header, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    return { id: parsed.id, name: parsed.name, email: parsed.email };
  } catch (e) {
    return null;
  }
}

const FIELDS = ['Opportunity_ID', 'Company', 'Stage', 'Region', 'Product', 'AE_Name', 'SDR_Name', 'Amount', 'Probability', 'Created_Date'];

app.get('/api/me', (req, res) => {
  res.json({ user: parseViewer(req) });
});

app.get('/api/opportunities', async (req, res) => {
  try {
    let columns = null;
    let rows = [];
    let offset = 0;
    const limit = 2000;
    const maxIterations = 10;

    for (let i = 0; i < maxIterations; i++) {
      const result = await invoke(req, 'data.query', {
        binding: 'sales',
        fields: FIELDS,
        limit,
        offset
      });

      if (result.status === 401) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      if (result.status < 200 || result.status >= 300) {
        return res.status(result.status).json(result.body || { error: 'Query failed' });
      }

      const data = result.body;
      if (!columns) columns = data.columns;
      rows = rows.concat(data.rows || []);

      if (data.truncated && data.nextOffset !== undefined && data.nextOffset !== null) {
        offset = data.nextOffset;
      } else {
        break;
      }
    }

    res.json({ columns: columns || FIELDS, rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load opportunities' });
  }
});

app.use(express.static(webRoot));

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(indexHtmlPath);
});

const port = Number(process.env.PORT);
app.listen(port, '0.0.0.0');
