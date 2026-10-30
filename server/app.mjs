import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '256kb' }));

// In-memory item ledger. No managed database is configured for this app, so
// the dataset is seeded in memory and served read-only.
const items = [
  { id: 1, name: 'Quarterly revenue review', category: 'Finance', owner: 'A. Rivera', status: 'Done', updated: '2026-08-28' },
  { id: 2, name: 'Onboarding email sequence', category: 'Marketing', owner: 'J. Chen', status: 'On track', updated: '2026-09-01' },
  { id: 3, name: 'API rate-limit rollout', category: 'Engineering', owner: 'M. Osei', status: 'Waiting', updated: '2026-08-30' },
  { id: 4, name: 'Vendor contract renewal', category: 'Operations', owner: 'L. Novak', status: 'Due soon', updated: '2026-09-03' },
  { id: 5, name: 'Accessibility audit', category: 'Engineering', owner: 'S. Patel', status: 'At risk', updated: '2026-08-25' },
  { id: 6, name: 'Brand refresh brief', category: 'Marketing', owner: 'A. Rivera', status: 'Done', updated: '2026-08-20' },
  { id: 7, name: 'Payroll run — August', category: 'Finance', owner: 'L. Novak', status: 'Done', updated: '2026-08-15' },
  { id: 8, name: 'Data warehouse migration', category: 'Engineering', owner: 'M. Osei', status: 'On track', updated: '2026-09-02' },
  { id: 9, name: 'Customer interview synthesis', category: 'Research', owner: 'J. Chen', status: 'Waiting', updated: '2026-08-29' },
  { id: 10, name: 'Security patch window', category: 'Engineering', owner: 'S. Patel', status: 'Due soon', updated: '2026-09-04' },
  { id: 11, name: 'Q3 hiring plan', category: 'Operations', owner: 'L. Novak', status: 'On track', updated: '2026-08-27' },
  { id: 12, name: 'Churn analysis report', category: 'Finance', owner: 'A. Rivera', status: 'At risk', updated: '2026-08-24' },
  { id: 13, name: 'Localization pass — FR', category: 'Marketing', owner: 'J. Chen', status: 'Done', updated: '2026-08-18' },
  { id: 14, name: 'Load test — checkout', category: 'Engineering', owner: 'M. Osei', status: 'On track', updated: '2026-09-01' },
  { id: 15, name: 'Board deck draft', category: 'Operations', owner: 'L. Novak', status: 'Waiting', updated: '2026-08-26' },
  { id: 16, name: 'Support SLA review', category: 'Operations', owner: 'S. Patel', status: 'Done', updated: '2026-08-12' },
  { id: 17, name: 'Feature flag cleanup', category: 'Engineering', owner: 'M. Osei', status: 'On track', updated: '2026-08-31' },
  { id: 18, name: 'Pricing page A/B test', category: 'Marketing', owner: 'A. Rivera', status: 'Due soon', updated: '2026-09-03' },
  { id: 19, name: 'Compliance attestation', category: 'Finance', owner: 'L. Novak', status: 'At risk', updated: '2026-08-22' },
  { id: 20, name: 'Mobile nav redesign', category: 'Engineering', owner: 'S. Patel', status: 'On track', updated: '2026-09-02' },
  { id: 21, name: 'Newsletter — September', category: 'Marketing', owner: 'J. Chen', status: 'Waiting', updated: '2026-08-30' },
  { id: 22, name: 'Inventory sync fix', category: 'Operations', owner: 'M. Osei', status: 'Done', updated: '2026-08-19' },
  { id: 23, name: 'SOC 2 evidence collection', category: 'Finance', owner: 'L. Novak', status: 'On track', updated: '2026-09-01' },
  { id: 24, name: 'Design system tokens', category: 'Engineering', owner: 'S. Patel', status: 'Done', updated: '2026-08-16' },
  { id: 25, name: 'Partner outreach list', category: 'Marketing', owner: 'A. Rivera', status: 'Due soon', updated: '2026-09-04' },
  { id: 26, name: 'Backup restore drill', category: 'Engineering', owner: 'M. Osei', status: 'On track', updated: '2026-08-29' },
  { id: 27, name: 'Expense policy update', category: 'Finance', owner: 'L. Novak', status: 'Waiting', updated: '2026-08-23' },
  { id: 28, name: 'Search relevance tuning', category: 'Engineering', owner: 'S. Patel', status: 'At risk', updated: '2026-08-21' },
  { id: 29, name: 'Customer success check-ins', category: 'Operations', owner: 'J. Chen', status: 'On track', updated: '2026-09-02' },
  { id: 30, name: 'Annual security review', category: 'Finance', owner: 'A. Rivera', status: 'Due soon', updated: '2026-09-03' },
  { id: 31, name: 'Localization pass — DE', category: 'Marketing', owner: 'J. Chen', status: 'On track', updated: '2026-08-31' },
  { id: 32, name: 'Kubernetes node upgrade', category: 'Engineering', owner: 'M. Osei', status: 'Waiting', updated: '2026-08-27' },
  { id: 33, name: 'Referral program launch', category: 'Marketing', owner: 'A. Rivera', status: 'On track', updated: '2026-09-01' },
  { id: 34, name: 'Data retention policy', category: 'Finance', owner: 'L. Novak', status: 'Done', updated: '2026-08-14' },
  { id: 35, name: 'On-call rotation update', category: 'Engineering', owner: 'S. Patel', status: 'On track', updated: '2026-08-30' },
  { id: 36, name: 'Q3 budget forecast', category: 'Finance', owner: 'A. Rivera', status: 'Due soon', updated: '2026-09-04' },
  { id: 37, name: 'Accessibility WCAG fixes', category: 'Engineering', owner: 'S. Patel', status: 'At risk', updated: '2026-08-25' },
  { id: 38, name: 'Vendor onboarding — Q3', category: 'Operations', owner: 'L. Novak', status: 'Waiting', updated: '2026-08-28' },
  { id: 39, name: 'Email deliverability test', category: 'Marketing', owner: 'J. Chen', status: 'On track', updated: '2026-09-02' },
  { id: 40, name: 'Incident postmortem — 0819', category: 'Engineering', owner: 'M. Osei', status: 'Done', updated: '2026-08-20' },
  { id: 41, name: 'Customer health scoring', category: 'Operations', owner: 'J. Chen', status: 'On track', updated: '2026-09-01' },
  { id: 42, name: 'Tax filing — Q3', category: 'Finance', owner: 'L. Novak', status: 'Due soon', updated: '2026-09-03' },
  { id: 43, name: 'Feature flag audit', category: 'Engineering', owner: 'M. Osei', status: 'Waiting', updated: '2026-08-29' },
  { id: 44, name: 'Brand asset library', category: 'Marketing', owner: 'A. Rivera', status: 'Done', updated: '2026-08-17' },
  { id: 45, name: 'Capacity planning — Q4', category: 'Operations', owner: 'L. Novak', status: 'On track', updated: '2026-09-02' },
  { id: 46, name: 'Dependency vulnerability scan', category: 'Engineering', owner: 'S. Patel', status: 'At risk', updated: '2026-08-24' },
  { id: 47, name: 'Pricing tier review', category: 'Finance', owner: 'A. Rivera', status: 'Waiting', updated: '2026-08-26' },
  { id: 48, name: 'Support macro library', category: 'Operations', owner: 'J. Chen', status: 'On track', updated: '2026-09-01' },
  { id: 49, name: 'Localization pass — ES', category: 'Marketing', owner: 'J. Chen', status: 'Due soon', updated: '2026-09-04' },
  { id: 50, name: 'Database index optimization', category: 'Engineering', owner: 'M. Osei', status: 'On track', updated: '2026-08-31' },
  { id: 51, name: 'Annual leave planning', category: 'Operations', owner: 'L. Novak', status: 'Waiting', updated: '2026-08-27' },
  { id: 52, name: 'Churn win-back campaign', category: 'Marketing', owner: 'A. Rivera', status: 'At risk', updated: '2026-08-23' },
  { id: 53, name: 'API deprecation notice', category: 'Engineering', owner: 'S. Patel', status: 'On track', updated: '2026-09-02' },
  { id: 54, name: 'Reimbursement batch — Aug', category: 'Finance', owner: 'L. Novak', status: 'Done', updated: '2026-08-15' },
  { id: 55, name: 'Customer feedback loop', category: 'Operations', owner: 'J. Chen', status: 'On track', updated: '2026-09-01' },
  { id: 56, name: 'Security header hardening', category: 'Engineering', owner: 'M. Osei', status: 'Waiting', updated: '2026-08-28' },
  { id: 57, name: 'Q3 marketing budget', category: 'Finance', owner: 'A. Rivera', status: 'Due soon', updated: '2026-09-03' },
  { id: 58, name: 'Design QA — mobile', category: 'Engineering', owner: 'S. Patel', status: 'On track', updated: '2026-09-02' },
  { id: 59, name: 'Partner portal access', category: 'Operations', owner: 'L. Novak', status: 'At risk', updated: '2026-08-25' },
  { id: 60, name: 'Localization pass — JA', category: 'Marketing', owner: 'J. Chen', status: 'Waiting', updated: '2026-08-30' },
  { id: 61, name: 'Load balancer failover test', category: 'Engineering', owner: 'M. Osei', status: 'On track', updated: '2026-09-01' },
  { id: 62, name: 'Compliance training — Q3', category: 'Finance', owner: 'L. Novak', status: 'Done', updated: '2026-08-18' },
  { id: 63, name: 'Customer success metrics', category: 'Operations', owner: 'J. Chen', status: 'On track', updated: '2026-09-02' },
  { id: 64, name: 'Feature parity matrix', category: 'Engineering', owner: 'S. Patel', status: 'Waiting', updated: '2026-08-29' },
  { id: 65, name: 'Brand voice guidelines', category: 'Marketing', owner: 'A. Rivera', status: 'On track', updated: '2026-09-01' },
  { id: 66, name: 'Payroll run — September', category: 'Finance', owner: 'L. Novak', status: 'Due soon', updated: '2026-09-04' },
  { id: 67, name: 'Incident runbook update', category: 'Engineering', owner: 'M. Osei', status: 'At risk', updated: '2026-08-24' },
  { id: 68, name: 'Vendor performance review', category: 'Operations', owner: 'L. Novak', status: 'Waiting', updated: '2026-08-27' },
  { id: 69, name: 'Email template refresh', category: 'Marketing', owner: 'J. Chen', status: 'On track', updated: '2026-09-02' },
  { id: 70, name: 'Data pipeline monitoring', category: 'Engineering', owner: 'S. Patel', status: 'On track', updated: '2026-09-01' },
  { id: 71, name: 'Q3 revenue forecast', category: 'Finance', owner: 'A. Rivera', status: 'Waiting', updated: '2026-08-28' },
  { id: 72, name: 'Accessibility contrast fixes', category: 'Engineering', owner: 'S. Patel', status: 'Due soon', updated: '2026-09-03' },
  { id: 73, name: 'Customer onboarding video', category: 'Marketing', owner: 'J. Chen', status: 'On track', updated: '2026-09-02' },
  { id: 74, name: 'Backup policy review', category: 'Operations', owner: 'L. Novak', status: 'Done', updated: '2026-08-16' },
  { id: 75, name: 'API versioning strategy', category: 'Engineering', owner: 'M. Osei', status: 'Waiting', updated: '2026-08-29' },
  { id: 76, name: 'Tax reconciliation — Q3', category: 'Finance', owner: 'A. Rivera', status: 'At risk', updated: '2026-08-23' },
  { id: 77, name: 'Support escalation path', category: 'Operations', owner: 'J. Chen', status: 'On track', updated: '2026-09-01' },
  { id: 78, name: 'Localization pass — PT', category: 'Marketing', owner: 'J. Chen', status: 'Waiting', updated: '2026-08-30' },
  { id: 79, name: 'Kubernetes cost optimization', category: 'Engineering', owner: 'M. Osei', status: 'On track', updated: '2026-09-02' },
  { id: 80, name: 'Annual leave — team sync', category: 'Operations', owner: 'L. Novak', status: 'Due soon', updated: '2026-09-04' }
];

// GET /api/items
// Serves the in-memory item ledger as a stable JSON shape consumed by the
// frontend ledger table and the client-side CSV export.
app.get('/api/items', (req, res) => {
  res.json({ items });
});

// Resolve the web root relative to this service file so the app works whether
// it is deployed from the service directory or a nested build layout.
const webRoot = path.resolve(__dirname, 'web');
const indexHtmlPath = path.join(webRoot, 'index.html');

// Serve the static frontend (index.html, app.css, app.js) from the web root.
app.use(express.static(webRoot));

// SPA fallback: after API routes and static files, serve index.html for any
// non-API GET/HEAD request. Unknown /api/* routes return a 404 JSON body.
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(indexHtmlPath);
});

const port = Number(process.env.PORT);
app.listen(port, '0.0.0.0');