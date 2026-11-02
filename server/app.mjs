import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '256kb' }));

// ---------------------------------------------------------------------------
// Managed PostgreSQL pool (KNOWI_DATABASE_CONFIG is an absolute path to a
// read-only JSON file; absent in preview).
// ---------------------------------------------------------------------------
let pool = null;
let dbReady = false;

function isDnsLabel(label) {
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label);
}

function isValidDnsName(name) {
  if (typeof name !== 'string') return false;
  if (name.length < 1 || name.length > 253) return false;
  if (name.endsWith('.')) return false;
  if (name.includes('@')) return false;
  if (name.includes(':')) return false;
  if (name.includes('_')) return false;
  if (name.includes('\n') || name.includes('\r') || name.includes('\t')) return false;
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(name)) return false;
  const labels = name.split('.');
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (!isDnsLabel(label)) return false;
  }
  return true;
}

function isPemBlock(s) {
  return /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/.test(s);
}

function validateConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return false;
  if (cfg.version !== 1) return false;
  if (cfg.engine !== 'postgres') return false;
  if (!Number.isSafeInteger(cfg.appId) || cfg.appId <= 0) return false;
  if (cfg.appId !== Number(process.env.KNOWI_APP_ID)) return false;
  if (typeof cfg.databaseRef !== 'string' || !/^db_[a-f0-9]{32}$/.test(cfg.databaseRef)) return false;
  if (!isValidDnsName(cfg.host)) return false;
  if (cfg.port !== 5432) return false;
  if (typeof cfg.database !== 'string' || !/^[a-z][a-z0-9_]{0,62}$/.test(cfg.database)) return false;
  if (typeof cfg.user !== 'string' || !/^[a-z][a-z0-9_]{0,31}$/.test(cfg.user)) return false;
  if (typeof cfg.password !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(cfg.password)) return false;
  if (!cfg.tls || typeof cfg.tls !== 'object') return false;
  if (cfg.tls.mode === 'disabled') {
    if (Object.keys(cfg.tls).length !== 1) return false;
  } else if (cfg.tls.mode === 'verify_identity') {
    if (!isValidDnsName(cfg.tls.serverName)) return false;
    if (cfg.tls.ca !== undefined) {
      if (typeof cfg.tls.ca !== 'string') return false;
      if (Buffer.byteLength(cfg.tls.ca, 'utf8') > 65536) return false;
      if (!isPemBlock(cfg.tls.ca)) return false;
    }
  } else {
    return false;
  }
  return true;
}

function initPool() {
  const cfgPath = process.env.KNOWI_DATABASE_CONFIG;
  if (!cfgPath) return;
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch {
    return;
  }
  if (!validateConfig(cfg)) return;

  let ssl;
  if (cfg.tls.mode === 'disabled') {
    ssl = false;
  } else {
    ssl = { rejectUnauthorized: true, servername: cfg.tls.serverName };
    if (cfg.tls.ca) ssl.ca = cfg.tls.ca;
  }

  pool = new Pool({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    ssl,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    query_timeout: 30000,
    statement_timeout: 30000,
    allowExitOnIdle: true,
  });

  pool.on('error', () => {});

  pool
    .query('SELECT 1')
    .then(() => {
      dbReady = true;
    })
    .catch(() => {
      dbReady = false;
    });
}

initPool();

// ---------------------------------------------------------------------------
// Small governed-capability helper (native fetch only).
// ---------------------------------------------------------------------------
async function invoke(req, capability, input) {
  const gateway = process.env.KNOWI_GATEWAY_URL;
  if (!gateway) {
    return { status: 503, body: { error: 'Gateway unavailable' } };
  }
  const token = req.get('X-Knowi-Capability-Token');
  const res = await fetch(`${gateway}/v1/capabilities`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-Knowi-Capability-Token': token } : {}),
    },
    body: JSON.stringify({ capability, input }),
  });
  let body;
  try {
    body = await res.json();
  } catch {
    body = { error: 'Invalid upstream response' };
  }
  return { status: res.status, body };
}

// ---------------------------------------------------------------------------
// API routes (registered before static middleware).
// ---------------------------------------------------------------------------
const STATUSES = ['To do', 'In progress', 'Done'];

function dbUnavailable(res) {
  res.status(503).json({ error: 'Database unavailable' });
}

function sanitizeTask(row) {
  return {
    id: row.id,
    title: row.title,
    owner: row.owner,
    status: row.status,
    created_at: row.created_at,
  };
}

app.get('/api/tasks', async (req, res) => {
  if (!pool || !dbReady) return dbUnavailable(res);
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT id, title, owner, status, created_at FROM tasks ORDER BY created_at DESC, id DESC LIMIT 500'
      );
      const tasks = result.rows.map(sanitizeTask);
      res.json({ tasks });
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to load tasks' });
  }
});

app.post('/api/tasks', async (req, res) => {
  if (!pool || !dbReady) return dbUnavailable(res);
  const { title, owner, status } = req.body || {};
  if (typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ error: 'Title is required' });
  }
  const ownerVal = typeof owner === 'string' ? owner.trim() : '';
  const statusVal = STATUSES.includes(status) ? status : 'To do';
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'INSERT INTO tasks (title, owner, status) VALUES ($1, $2, $3) RETURNING id, title, owner, status, created_at',
        [title.trim().slice(0, 200), ownerVal.slice(0, 120), statusVal]
      );
      res.status(201).json({ task: sanitizeTask(result.rows[0]) });
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to create task' });
  }
});

app.put('/api/tasks/:id', async (req, res) => {
  if (!pool || !dbReady) return dbUnavailable(res);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid task id' });
  }
  const { title, owner, status } = req.body || {};
  if (typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ error: 'Title is required' });
  }
  const ownerVal = typeof owner === 'string' ? owner.trim() : '';
  const statusVal = STATUSES.includes(status) ? status : 'To do';
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'UPDATE tasks SET title = $1, owner = $2, status = $3 WHERE id = $4 RETURNING id, title, owner, status, created_at',
        [title.trim().slice(0, 200), ownerVal.slice(0, 120), statusVal, id]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }
      res.json({ task: sanitizeTask(result.rows[0]) });
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to update task' });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  if (!pool || !dbReady) return dbUnavailable(res);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid task id' });
  }
  try {
    const client = await pool.connect();
    try {
      const result = await client.query('DELETE FROM tasks WHERE id = $1', [id]);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }
      res.json({ ok: true });
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// ---------------------------------------------------------------------------
// Static files + SPA fallback (after API routes).
// ---------------------------------------------------------------------------
const webRoot = path.resolve(__dirname, '../web');
const indexHtmlPath = path.join(webRoot, 'index.html');

app.use(express.static(webRoot));

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(indexHtmlPath);
});

const port = Number(process.env.PORT);
app.listen(port, '0.0.0.0');