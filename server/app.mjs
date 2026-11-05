import express from 'express';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..', 'web');
const indexHtmlPath = path.join(webRoot, 'index.html');

const app = express();
app.use(express.json({ limit: '256kb' }));

// ---------------------------------------------------------------------------
// Managed PostgreSQL pool (lazy, validated, single instance)
// ---------------------------------------------------------------------------
let pool = null;
let poolInitError = null;

function isSafeDnsName(value) {
  if (typeof value !== 'string') return false;
  if (value.length < 1 || value.length > 253) return false;
  if (value.endsWith('.')) return false;
  if (value.includes('@')) return false;
  if (value.includes(':')) return false;
  if (value.includes('_')) return false;
  if (value.includes('//')) return false;
  if (value.includes(' ')) return false;
  if (value.includes('\t') || value.includes('\n') || value.includes('\r')) return false;
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value)) return false;
  const labels = value.split('.');
  for (const label of labels) {
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label)) return false;
  }
  return true;
}

function isPemBlock(s) {
  return s.includes('-----BEGIN CERTIFICATE-----') && s.includes('-----END CERTIFICATE-----');
}

function validateDbConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return false;
  if (cfg.version !== 1) return false;
  if (cfg.engine !== 'postgres') return false;
  if (!Number.isSafeInteger(cfg.appId) || cfg.appId <= 0) return false;
  if (Number(process.env.KNOWI_APP_ID) !== cfg.appId) return false;
  if (typeof cfg.databaseRef !== 'string' || !/^db_[a-f0-9]{32}$/.test(cfg.databaseRef)) return false;
  if (typeof cfg.host !== 'string' || !isSafeDnsName(cfg.host)) return false;
  if (cfg.port !== 5432) return false;
  if (typeof cfg.database !== 'string' || !/^[a-z][a-z0-9_]{0,62}$/.test(cfg.database)) return false;
  if (typeof cfg.user !== 'string' || !/^[a-z][a-z0-9_]{0,31}$/.test(cfg.user)) return false;
  if (typeof cfg.password !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(cfg.password)) return false;
  if (!cfg.tls || typeof cfg.tls !== 'object') return false;
  if (cfg.tls.mode === 'disabled') {
    if (Object.keys(cfg.tls).length !== 1) return false;
  } else if (cfg.tls.mode === 'verify_identity') {
    if (typeof cfg.tls.serverName !== 'string' || !isSafeDnsName(cfg.tls.serverName)) return false;
    if (cfg.tls.ca !== undefined) {
      if (typeof cfg.tls.ca !== 'string') return false;
      const buf = Buffer.from(cfg.tls.ca, 'utf8');
      if (buf.length > 65536) return false;
      if (!isPemBlock(cfg.tls.ca)) return false;
    }
  } else {
    return false;
  }
  return true;
}

function getPool() {
  if (pool) return pool;
  if (poolInitError) throw poolInitError;
  const cfgPath = process.env.KNOWI_DATABASE_CONFIG;
  if (!cfgPath) {
    poolInitError = new Error('database config unavailable');
    throw poolInitError;
  }
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch (e) {
    poolInitError = new Error('database config unreadable');
    throw poolInitError;
  }
  if (!validateDbConfig(cfg)) {
    poolInitError = new Error('database config invalid');
    throw poolInitError;
  }
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
  return pool;
}

function dbAvailable() {
  try {
    getPool();
    return true;
  } catch (e) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------
app.get('/api/tasks', async (req, res) => {
  if (!dbAvailable()) {
    return res.status(503).json({ error: 'database unavailable' });
  }
  try {
    const client = await getPool().connect();
    try {
      const result = await client.query(
        'SELECT id, title, owner, status, created_at FROM tasks ORDER BY created_at DESC, id DESC LIMIT 5000'
      );
      const tasks = result.rows.map((r) => ({
        id: r.id,
        title: r.title,
        owner: r.owner,
        status: r.status,
        created_at: r.created_at,
      }));
      res.json({ tasks });
    } finally {
      client.release();
    }
  } catch (e) {
    res.status(503).json({ error: 'database unavailable' });
  }
});

app.post('/api/tasks', async (req, res) => {
  if (!dbAvailable()) {
    return res.status(503).json({ error: 'database unavailable' });
  }
  const { title, owner, status } = req.body || {};
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (typeof owner !== 'string' || !owner.trim()) {
    return res.status(400).json({ error: 'owner is required' });
  }
  if (typeof status !== 'string' || !status.trim()) {
    return res.status(400).json({ error: 'status is required' });
  }
  try {
    const client = await getPool().connect();
    try {
      const result = await client.query(
        'INSERT INTO tasks (title, owner, status) VALUES ($1, $2, $3) RETURNING id, title, owner, status, created_at',
        [title.trim(), owner.trim(), status.trim()]
      );
      const row = result.rows[0];
      res.status(201).json({
        task: {
          id: row.id,
          title: row.title,
          owner: row.owner,
          status: row.status,
          created_at: row.created_at,
        },
      });
    } finally {
      client.release();
    }
  } catch (e) {
    res.status(503).json({ error: 'database unavailable' });
  }
});

app.put('/api/tasks/:id', async (req, res) => {
  if (!dbAvailable()) {
    return res.status(503).json({ error: 'database unavailable' });
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid id' });
  }
  const { title, owner, status } = req.body || {};
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (typeof owner !== 'string' || !owner.trim()) {
    return res.status(400).json({ error: 'owner is required' });
  }
  if (typeof status !== 'string' || !status.trim()) {
    return res.status(400).json({ error: 'status is required' });
  }
  try {
    const client = await getPool().connect();
    try {
      const result = await client.query(
        'UPDATE tasks SET title = $1, owner = $2, status = $3 WHERE id = $4 RETURNING id, title, owner, status, created_at',
        [title.trim(), owner.trim(), status.trim(), id]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'task not found' });
      }
      const row = result.rows[0];
      res.json({
        task: {
          id: row.id,
          title: row.title,
          owner: row.owner,
          status: row.status,
          created_at: row.created_at,
        },
      });
    } finally {
      client.release();
    }
  } catch (e) {
    res.status(503).json({ error: 'database unavailable' });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  if (!dbAvailable()) {
    return res.status(503).json({ error: 'database unavailable' });
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'invalid id' });
  }
  try {
    const client = await getPool().connect();
    try {
      const result = await client.query('DELETE FROM tasks WHERE id = $1', [id]);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'task not found' });
      }
      res.json({ ok: true });
    } finally {
      client.release();
    }
  } catch (e) {
    res.status(503).json({ error: 'database unavailable' });
  }
});

// ---------------------------------------------------------------------------
// Static + SPA fallback
// ---------------------------------------------------------------------------
app.use(express.static(webRoot));
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(indexHtmlPath);
});

app.listen(Number(process.env.PORT), '0.0.0.0');

export const databaseSchema = {
  version: 1,
  tables: [
    {
      name: 'tasks',
      columns: [
        { name: 'id', type: 'int', autoIncrement: true, primaryKey: true, nullable: false },
        { name: 'title', type: 'varchar', length: 255, nullable: false },
        { name: 'owner', type: 'varchar', length: 255, nullable: false },
        { name: 'status', type: 'varchar', length: 32, nullable: false, default: { kind: 'literal', value: 'To do' } },
        { name: 'created_at', type: 'datetime', nullable: false, default: { kind: 'current_timestamp' } },
      ],
      indexes: [
        { name: 'idx_tasks_status', columns: ['status'], unique: false },
        { name: 'idx_tasks_created_at', columns: ['created_at'], unique: false },
      ],
    },
  ],
};