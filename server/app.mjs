import express from 'express';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '../web');
const indexHtmlPath = path.join(webRoot, 'index.html');

const app = express();
app.use(express.json({ limit: '256kb' }));

// --- Database setup -------------------------------------------------------
let pool = null;
let dbReady = false;
let dbInitError = null;

function isSafeDnsName(value) {
  if (typeof value !== 'string') return false;
  if (value.length < 1 || value.length > 253) return false;
  if (value.endsWith('.')) return false;
  if (value.includes('_')) return false;
  if (value.includes('@')) return false;
  if (value.includes(':')) return false;
  if (value.includes('//')) return false;
  if (value.includes('[') || value.includes(']')) return false;
  if (value.includes(' ')) return false;
  if (value.includes('\t') || value.includes('\n') || value.includes('\r')) return false;
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
  const expectedAppId = Number(process.env.KNOWI_APP_ID);
  if (Number.isFinite(expectedAppId) && cfg.appId !== expectedAppId) return false;
  if (typeof cfg.databaseRef !== 'string' || !/^db_[a-f0-9]{32}$/.test(cfg.databaseRef)) return false;
  if (!isSafeDnsName(cfg.host)) return false;
  if (cfg.port !== 5432) return false;
  if (typeof cfg.database !== 'string' || !/^[a-z][a-z0-9_]{0,62}$/.test(cfg.database)) return false;
  if (typeof cfg.user !== 'string' || !/^[a-z][a-z0-9_]{0,31}$/.test(cfg.user)) return false;
  if (typeof cfg.password !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(cfg.password)) return false;
  if (!cfg.tls || typeof cfg.tls !== 'object') return false;
  if (cfg.tls.mode === 'disabled') {
    // ok
  } else if (cfg.tls.mode === 'verify_identity') {
    if (!isSafeDnsName(cfg.tls.serverName)) return false;
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

function initDb() {
  const cfgPath = process.env.KNOWI_DATABASE_CONFIG;
  if (!cfgPath) {
    dbReady = false;
    return;
  }
  try {
    const raw = fs.readFileSync(cfgPath, 'utf8');
    const cfg = JSON.parse(raw);
    if (!validateDbConfig(cfg)) {
      dbReady = false;
      return;
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
    dbReady = true;
  } catch (e) {
    dbReady = false;
    dbInitError = e;
  }
}

initDb();

function dbUnavailable(res) {
  res.status(503).json({ error: 'Database unavailable' });
}

// --- API routes -----------------------------------------------------------
app.get('/api/tasks', async (req, res) => {
  if (!dbReady || !pool) return dbUnavailable(res);
  try {
    const client = await pool.connect();
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
    res.status(500).json({ error: 'Failed to load tasks' });
  }
});

app.post('/api/tasks', async (req, res) => {
  if (!dbReady || !pool) return dbUnavailable(res);
  const { title, owner, status } = req.body || {};
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  const validStatuses = ['To do', 'In progress', 'Done'];
  const st = validStatuses.includes(status) ? status : 'To do';
  const own = typeof owner === 'string' ? owner : '';
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'INSERT INTO tasks (title, owner, status) VALUES ($1, $2, $3) RETURNING id, title, owner, status, created_at',
        [title.trim().slice(0, 200), own.slice(0, 120), st]
      );
      const r = result.rows[0];
      res.status(201).json({
        task: { id: r.id, title: r.title, owner: r.owner, status: r.status, created_at: r.created_at },
      });
    } finally {
      client.release();
    }
  } catch (e) {
    res.status(500).json({ error: 'Failed to create task' });
  }
});

app.patch('/api/tasks/:id', async (req, res) => {
  if (!dbReady || !pool) return dbUnavailable(res);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
  const { title, owner, status } = req.body || {};
  const validStatuses = ['To do', 'In progress', 'Done'];
  const st = validStatuses.includes(status) ? status : 'To do';
  const own = typeof owner === 'string' ? owner : '';
  const ttl = typeof title === 'string' ? title.trim().slice(0, 200) : null;
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `UPDATE tasks SET title = COALESCE($1, title), owner = COALESCE($2, owner), status = $3 WHERE id = $4 RETURNING id, title, owner, status, created_at`,
        [ttl, own, st, id]
      );
      if (result.rowCount === 0) return res.status(404).json({ error: 'Task not found' });
      const r = result.rows[0];
      res.json({
        task: { id: r.id, title: r.title, owner: r.owner, status: r.status, created_at: r.created_at },
      });
    } finally {
      client.release();
    }
  } catch (e) {
    res.status(500).json({ error: 'Failed to update task' });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  if (!dbReady || !pool) return dbUnavailable(res);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
  try {
    const client = await pool.connect();
    try {
      const result = await client.query('DELETE FROM tasks WHERE id = $1', [id]);
      if (result.rowCount === 0) return res.status(404).json({ error: 'Task not found' });
      res.json({ ok: true });
    } finally {
      client.release();
    }
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// --- Static + SPA fallback ------------------------------------------------
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
        { name: 'id', type: 'int', primaryKey: true, autoIncrement: true, nullable: false },
        { name: 'title', type: 'varchar', length: 200, nullable: false },
        { name: 'owner', type: 'varchar', length: 120, nullable: false, default: { kind: 'literal', value: '' } },
        { name: 'status', type: 'varchar', length: 20, nullable: false, default: { kind: 'literal', value: 'To do' } },
        { name: 'created_at', type: 'datetime', nullable: false, default: { kind: 'current_timestamp' } },
      ],
      indexes: [
        { name: 'idx_tasks_status', columns: ['status'], unique: false },
      ],
    },
  ],
};