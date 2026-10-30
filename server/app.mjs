// serverJs — Knowi Apps backend service for "victor-hello-2026-09-04-13-31"
// ---------------------------------------------------------------------------
// Purpose:
//   A minimal, self-contained Node 22 ESM service that serves the Inventory
//   Tracker single-page app. The app is UI-only: all inventory data lives in
//   the browser's localStorage (key 'victor-inventory-items'), so this service
//   performs no data reads/writes and exposes no /api/* routes. It only:
//     1. Serves the static web assets from ../web (index.html, app.css, app.js).
//     2. Provides a safe SPA fallback so client-side routes resolve to index.html
//        without ever masking an unknown /api/* path.
//
// Runtime contract (managed runtime):
//   - Listens on Number(process.env.PORT) at 0.0.0.0 (PORT=8080 in production).
//   - NODE_ENV=production, KNOWI_APP_ID / KNOWI_APP_VERSION_ID / KNOWI_APP_MODE /
//     KNOWI_GATEWAY_URL are supplied by the platform and are never logged or
//     returned to the client.
//   - No managed database is configured for this app, so pg is not imported and
//     no SQL is executed.
//
// Express 5 (path-to-regexp v8) notes:
//   - No wildcard/regex-string routes are used (avoids startup crashes).
//   - JSON body parsing is registered with a 256kb limit for any future /api/*
//     routes; none are defined here.
// ---------------------------------------------------------------------------

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve the web root relative to this file so the service works regardless
// of the current working directory. The web assets live in ../web.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..', 'web');
const indexHtmlPath = path.join(webRoot, 'index.html');

// Create the Express application instance.
const app = express();

// Parse JSON request bodies with a conservative size limit. This is registered
// up front so any future /api/* route can rely on req.body being populated.
app.use(express.json({ limit: '256kb' }));

// ---------------------------------------------------------------------------
// /api/* routes
// ---------------------------------------------------------------------------
// This app is UI-only and intentionally defines no /api/* routes. All inventory
// state is owned by the browser via localStorage. If a route were added later,
// it would be registered here, before the static middleware, so it is never
// shadowed by the SPA fallback.

// ---------------------------------------------------------------------------
// Static assets
// ---------------------------------------------------------------------------
// Serve the web assets. GET and HEAD / resolve to index.html via Express's
// default index handling for the static directory.
app.use(express.static(webRoot));

// ---------------------------------------------------------------------------
// SPA fallback
// ---------------------------------------------------------------------------
// For any non-API GET/HEAD request that did not match a static file, send
// index.html so client-side routing works. Unknown /api/* paths return a JSON
// 404 so they are never hidden behind the SPA fallback. Non-GET/HEAD requests
// fall through to Express's default 404 handling.
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return next();
  }
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(indexHtmlPath);
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
// Listen on the platform-provided port. Do not choose another port, spawn a
// second listener, or exit after startup.
const port = Number(process.env.PORT);
app.listen(port, '0.0.0.0');