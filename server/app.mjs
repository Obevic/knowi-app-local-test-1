import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// Startup self-check: must run before the service starts listening.
// EXPENSE_LIMIT is intentionally not set here and has no default; operations
// configures it later.
if (process.env.EXPENSE_LIMIT === undefined || process.env.EXPENSE_LIMIT === '') {
  throw new Error('Startup self-check failed: EXPENSE_LIMIT is not configured');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '../web');
const indexHtmlPath = path.join(webRoot, 'index.html');

const app = express();
app.use(express.json({ limit: '256kb' }));

// ---- In-memory sample data (no managed database) ----
const CATEGORIES = ['Software', 'Travel', 'Meals', 'Equipment', 'Marketing', 'Utilities'];

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildSampleExpenses() {
  const now = new Date();
  const notes = [
    'Team offsite',
    'Client lunch',
    'Annual subscription',
    'Conference ticket',
    'New monitor',
    'Ad spend',
    'Office supplies',
    'Flight booking',
    'Hotel stay',
    'Dinner with client',
    'Software license',
    'Domain renewal',
    'Cloud hosting',
    'Design tool',
    'Team lunch',
    'Workshop',
    'Cable and stand',
    'Print materials',
    'Coffee and snacks',
    'Webinar platform',
    'Storage upgrade',
    'Branding refresh',
    'Office rent share',
    'Internet bill',
    'Electricity',
    'Water bill',
    'Cleaning service',
    'Recruiting fee',
    'Training course',
    'Miscellaneous'
  ];

  const expenses = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const category = CATEGORIES[i % CATEGORIES.length];
    const amount = Math.round((Math.random() * 480 + 20) * 100) / 100;
    expenses.push({
      id: i + 1,
      date: isoDate(d),
      category,
      amount,
      note: notes[i % notes.length]
    });
  }
  return expenses;
}

const expenses = buildSampleExpenses();
let nextId = expenses.length + 1;

// ---- Routes (registered before static middleware) ----
app.get('/api/me', (req, res) => {
  const raw = req.get('X-Knowi-App-User');
  if (!raw) {
    return res.json({ name: null, email: null });
  }
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    res.json({ name: parsed.name || null, email: parsed.email || null });
  } catch {
    res.json({ name: null, email: null });
  }
});

app.get('/api/expenses', (req, res) => {
  const sorted = [...expenses].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
  const categories = [...new Set(expenses.map((e) => e.category))].sort();
  res.json({ expenses: sorted, categories });
});

app.post('/api/expenses', (req, res) => {
  const body = req.body || {};
  const date = typeof body.date === 'string' ? body.date.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  const amount = Number(body.amount);
  const note = typeof body.note === 'string' ? body.note.trim() : '';

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'A valid date is required.' });
  }
  if (!category) {
    return res.status(400).json({ error: 'A category is required.' });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'A positive amount is required.' });
  }

  const expense = { id: nextId++, date, category, amount: Math.round(amount * 100) / 100, note };
  expenses.unshift(expense);
  res.status(201).json({ expense });
});

// ---- Static + SPA fallback (after /api routes) ----
app.use(express.static(webRoot));
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(indexHtmlPath);
});

const port = Number(process.env.PORT);
app.listen(port, '0.0.0.0');