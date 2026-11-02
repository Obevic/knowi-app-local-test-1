import express from "express";
import { Pool } from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "../web");
const indexHtmlPath = path.join(webRoot, "index.html");

const ALLOWED_STATUSES = ["To do", "In progress", "Done"];

function isValidDnsName(name) {
  if (typeof name !== "string") return false;
  if (name.length < 1 || name.length > 253) return false;
  if (name.endsWith(".")) return false;
  if (/[\x00-\x1F\x7F]/.test(name)) return false;
  if (name.includes("@") || name.includes(":") || name.includes("[") || name.includes("]")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(name)) return false;
  const labels = name.split(".");
  for (const label of labels) {
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label)) return false;
  }
  return true;
}

function validateTls(tls) {
  if (!tls || typeof tls !== "object") return false;
  if (tls.mode === "disabled") {
    return Object.keys(tls).length === 1;
  }
  if (tls.mode === "verify_identity") {
    const keys = Object.keys(tls);
    for (const k of keys) {
      if (k !== "mode" && k !== "serverName" && k !== "ca") return false;
    }
    if (!keys.includes("serverName") || !isValidDnsName(tls.serverName)) return false;
    if ("ca" in tls) {
      if (typeof tls.ca !== "string") return false;
      if (Buffer.byteLength(tls.ca, "utf8") > 65536) return false;
      const blocks = tls.ca.split(/(?<=-----END CERTIFICATE-----)\r?\n?/).filter((b) => b.trim().length > 0);
      if (blocks.length === 0) return false;
      for (const b of blocks) {
        if (!/^-----BEGIN CERTIFICATE-----\r?\n[\s\S]+-----END CERTIFICATE-----\r?\n?$/.test(b)) return false;
      }
    }
    return true;
  }
  return false;
}

function validateDbConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return false;
  const expectedKeys = ["version", "engine", "appId", "databaseRef", "host", "port", "database", "user", "password", "tls"];
  const actualKeys = Object.keys(cfg);
  if (actualKeys.length !== expectedKeys.length) return false;
  for (const k of expectedKeys) if (!actualKeys.includes(k)) return false;

  if (cfg.version !== 1) return false;
  if (cfg.engine !== "postgres") return false;
  if (!Number.isSafeInteger(cfg.appId) || cfg.appId <= 0) return false;
  if (cfg.appId !== Number(process.env.KNOWI_APP_ID)) return false;
  if (typeof cfg.databaseRef !== "string" || !/^db_[a-f0-9]{32}$/.test(cfg.databaseRef)) return false;
  if (!isValidDnsName(cfg.host)) return false;
  if (cfg.port !== 5432) return false;
  if (typeof cfg.database !== "string" || !/^[a-z][a-z0-9_]{0,62}$/.test(cfg.database)) return false;
  if (typeof cfg.user !== "string" || !/^[a-z][a-z0-9_]{0,31}$/.test(cfg.user)) return false;
  if (typeof cfg.password !== "string" || cfg.password.length !== 43 || !/^[A-Za-z0-9_-]{43}$/.test(cfg.password)) return false;
  if (!validateTls(cfg.tls)) return false;
  return true;
}

function loadPool() {
  const configPath = process.env.KNOWI_DATABASE_CONFIG;
  if (!configPath) return null;
  let raw;
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch {
    return null;
  }
  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!validateDbConfig(cfg)) return null;

  const ssl =
    cfg.tls.mode === "disabled"
      ? false
      : {
          rejectUnauthorized: true,
          servername: cfg.tls.serverName,
          ...(cfg.tls.ca ? { ca: cfg.tls.ca } : {})
        };

  return new Pool({
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
    allowExitOnIdle: true
  });
}

const pool = loadPool();

const app = express();
app.use(express.json({ limit: "256kb" }));

app.get("/api/session", (req, res) => {
  const header = req.get("X-Knowi-App-User");
  if (!header) {
    res.json({ user: null });
    return;
  }
  try {
    const json = Buffer.from(header, "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    res.json({ user: { id: parsed.id, name: parsed.name, email: parsed.email } });
  } catch {
    res.json({ user: null });
  }
});

app.get("/api/tasks", async (req, res) => {
  if (!pool) {
    res.status(503).json({ error: "Database unavailable" });
    return;
  }
  try {
    const result = await pool.query(
      "SELECT id, title, owner, status, created_at FROM tasks ORDER BY created_at DESC, id DESC LIMIT 500"
    );
    res.json({ tasks: result.rows });
  } catch {
    res.status(503).json({ error: "Database unavailable" });
  }
});

function validateTaskInput(body) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const owner = typeof body.owner === "string" ? body.owner.trim() : "";
  const status = body.status;
  if (!title || title.length > 200) return { error: "Title is required and must be 200 characters or fewer." };
  if (!owner || owner.length > 120) return { error: "Owner is required and must be 120 characters or fewer." };
  if (!ALLOWED_STATUSES.includes(status)) return { error: "Status must be To do, In progress, or Done." };
  return { title, owner, status };
}

app.post("/api/tasks", async (req, res) => {
  if (!pool) {
    res.status(503).json({ error: "Database unavailable" });
    return;
  }
  const parsed = validateTaskInput(req.body || {});
  if (parsed.error) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      "INSERT INTO tasks (title, owner, status) VALUES ($1, $2, $3) RETURNING id, title, owner, status, created_at",
      [parsed.title, parsed.owner, parsed.status]
    );
    res.status(201).json({ task: result.rows[0] });
  } catch {
    res.status(503).json({ error: "Database unavailable" });
  } finally {
    if (client) client.release();
  }
});

app.put("/api/tasks/:id", async (req, res) => {
  if (!pool) {
    res.status(503).json({ error: "Database unavailable" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid task id" });
    return;
  }
  const parsed = validateTaskInput(req.body || {});
  if (parsed.error) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      "UPDATE tasks SET title = $1, owner = $2, status = $3, updated_at = NOW() WHERE id = $4 RETURNING id, title, owner, status, created_at",
      [parsed.title, parsed.owner, parsed.status, id]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json({ task: result.rows[0] });
  } catch {
    res.status(503).json({ error: "Database unavailable" });
  } finally {
    if (client) client.release();
  }
});

app.delete("/api/tasks/:id", async (req, res) => {
  if (!pool) {
    res.status(503).json({ error: "Database unavailable" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid task id" });
    return;
  }
  let client;
  try {
    client = await pool.connect();
    const result = await client.query("DELETE FROM tasks WHERE id = $1", [id]);
    if (result.rowCount === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.status(204).end();
  } catch {
    res.status(503).json({ error: "Database unavailable" });
  } finally {
    if (client) client.release();
  }
});

app.use(express.static(webRoot));

app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "Not found" });
  res.sendFile(indexHtmlPath);
});

const port = Number(process.env.PORT);
app.listen(port, "0.0.0.0");
