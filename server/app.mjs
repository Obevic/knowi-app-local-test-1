import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const { Pool } = pg;

const app = express();
app.use(express.json({ limit: '256kb' }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const webRoot = join(__dirname, '..', 'web');
const indexHtmlPath = join(webRoot, 'index.html');

const STATUSES = ['To do', 'In progress', 'Done'];

// ---- Database setup (managed PostgreSQL) ----
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
  for (const label of labels) {
    if (!isDnsLabel(label)) return false;
  }
  return true;
}

function isValidPemCa(ca) {
  if (typeof ca !== 'string') return false;
  const bytes = Buffer.byteLength(ca, 'utf8');
  if (bytes > 65536) return false;
  const blocks = ca.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
  if (!blocks || blocks.length < 1) return false;
  return true;
}

function initDatabase() {
  const configPath = process.env.KNOWI_DATABASE_CONFIG;
  if (!configPath) {
    return;
  }
  let cfg;
  try {
    cfg = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    return;
  }
  if (!cfg || typeof cfg !== 'object') return;

  const appId = Number(process.env.KNOWI_APP_ID);
  if (cfg.version !== 1) return;
  if (cfg.engine !== 'postgres') return;
  if (!Number.isSafeInteger(cfg.appId) || cfg.appId <= 0 || cfg.appId !== appId) return;
  if (typeof cfg.databaseRef !== 'string' || !/^db_[a-f0-9]{32}$/.test(cfg.databaseRef)) return;
  if (!isValidDnsName(cfg.host)) return;
  if (cfg.port !== 5432) return;
  if (typeof cfg.database !== 'string' || !/^[a-z][a-z0-9_]{0,62}$/.test(cfg.database)) return;
  if (typeof cfg.user !== 'string' || !/^[a-z][a-z0-9_]{0,31}$/.test(cfg.user)) return;
  if (typeof cfg.password !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(cfg.password)) return;

  let ssl = false;
  if (cfg.tls && typeof cfg.tls === 'object') {
    if (cfg.tls.mode === 'disabled') {
      ssl = false;
    } else if (cfg.tls.mode === 'verify_identity') {
      if (!isValidDnsName(cfg.tls.serverName)) return;
      if (cfg.tls.ca !== undefined && !isValidPemCa(cfg.tls.ca)) return;
      const sslOpts = { rejectUnauthorized: true, servername: cfg.tls.serverName };
      if (cfg.tls.ca !== undefined) sslOpts.ca = cfg.tls.ca;
      ssl = sslOpts;
    } else {
      return;
    }
  } else {
    return;
  }

  try {
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
  } catch {
    pool = null;
    dbReady = false;
  }
}

initDatabase();

function dbUnavailable(res) {
  return res.status(503).json({ error: 'Database unavailable' });
}

function rowToTask(row) {
  return {
    id: row.id,
    title: row.title,
    owner: row.owner,
    status: row.status,
    created_at: row.created_at,
  };
}

// ---- API routes ----
app.get('/api/tasks', async (req, res) => {
  if (!dbReady || !pool) return dbUnavailable(res);
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT id, title, owner, status, created_at FROM tasks ORDER BY created_at DESC, id DESC LIMIT 5000'
      );
      const tasks = result.rows.map(rowToTask);
      res.json({ tasks });
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to load tasks' });
  }
});

app.post('/api/tasks', async (req, res) => {
  if (!dbReady || !pool) return dbUnavailable(res);
  const { title, owner, status } = req.body || {};
  if (typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'Title is required' });
  }
  if (typeof owner !== 'string' || owner.trim() === '') {
    return res.status(400).json({ error: 'Owner is required' });
  }
  if (typeof status !== 'string' || !STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'INSERT INTO tasks (title, owner, status) VALUES ($1, $2, $3) RETURNING id, title, owner, status, created_at',
        [title.trim(), owner.trim(), status]
      );
      res.status(201).json({ task: rowToTask(result.rows[0]) });
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to create task' });
  }
});

app.patch('/api/tasks/:id', async (req, res) => {
  if (!dbReady || !pool) return dbUnavailable(res);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  const { title, owner, status } = req.body || {};
  if (typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'Title is required' });
  }
  if (typeof owner !== 'string' || owner.trim() === '') {
    return res.status(400).json({ error: 'Owner is required' });
  }
  if (typeof status !== 'string' || !STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'UPDATE tasks SET title = $1, owner = $2, status = $3 WHERE id = $4 RETURNING id, title, owner, status, created_at',
        [title.trim(), owner.trim(), status, id]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }
      res.json({ task: rowToTask(result.rows[0]) });
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to update task' });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  if (!dbReady || !pool) return dbUnavailable(res);
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid id' });
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

// ---- Static + SPA fallback ----
app.use(express.static(webRoot));
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(indexHtmlPath);
});

const PORT = Number(process.env.PORT);
app.listen(PORT, '0.0.0.0');

export const databaseSchema = {
  version: 1,
  tables: [
    {
      name: 'tasks',
      columns: [
        { name: 'id', type: 'int', autoIncrement: true, primaryKey: true, nullable: false },
        { name: 'title', type: 'varchar', length: 255, nullable: false },
        { name: 'owner', type: 'varchar', length: 120, nullable: false },
        { name: 'status', type: 'varchar', length: 20, nullable: false, default: { kind: 'literal', value: 'To do' } },
        { name: 'created_at', type: 'datetime', nullable: false, default: { kind: 'current_timestamp' } },
      ],
      indexes: [
        { name: 'idx_tasks_status', columns: ['status'] },
        { name: 'idx_tasks_created_at', columns: ['created_at'] },
      ],
    },
  ],
};