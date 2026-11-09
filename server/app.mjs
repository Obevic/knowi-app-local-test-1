import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Startup self-check: EXPENSE_LIMIT should be configured by operations.
// No default is set here. If unset, log a warning and continue so the app
// still builds and runs; operations can configure it later.
const expenseLimit = process.env.EXPENSE_LIMIT !== undefined ? Number(process.env.EXPENSE_LIMIT) : 500;
if (Number.isNaN(expenseLimit)) {
  console.warn('Startup self-check: EXPENSE_LIMIT is not a valid number; using default 500');
}

const app = express();
app.use(express.json({ limit: '256kb' }));

// In-memory sample data (no managed database for this app).
let nextId = 1;
function makeExpense(date, category, amount, note) {
  return { id: nextId++, date, category, amount, note };
}

const expenses = [
  makeExpense('2025-01-02', 'Software', 49.0, 'Figma team plan'),
  makeExpense('2025-01-03', 'Travel', 120.5, 'Airport transfer'),
  makeExpense('2025-01-05', 'Meals', 32.75, 'Client lunch'),
  makeExpense('2025-01-07', 'Software', 120.0, 'Slack upgrade'),
  makeExpense('2025-01-08', 'Office', 85.0, 'Standing desk mat'),
  makeExpense('2025-01-09', 'Travel', 210.0, 'Flight to NYC'),
  makeExpense('2025-01-10', 'Meals', 18.4, 'Team coffee'),
  makeExpense('2025-01-11', 'Software', 29.99, 'Notion seats'),
  makeExpense('2025-01-12', 'Office', 42.0, 'Whiteboard markers'),
  makeExpense('2025-01-13', 'Travel', 95.0, 'Hotel night'),
  makeExpense('2025-01-14', 'Meals', 54.2, 'Dinner after demo'),
  makeExpense('2025-01-15', 'Software', 75.0, 'CI minutes overage'),
  makeExpense('2025-01-16', 'Office', 130.0, 'Ergonomic chair'),
  makeExpense('2025-01-17', 'Travel', 60.0, 'Rideshare'),
  makeExpense('2025-01-18', 'Meals', 27.9, 'Lunch'),
  makeExpense('2025-01-19', 'Software', 15.0, 'Domain renewal'),
  makeExpense('2025-01-20', 'Office', 22.0, 'Cables and adapters'),
  makeExpense('2025-01-21', 'Travel', 180.0, 'Train tickets'),
  makeExpense('2025-01-22', 'Meals', 41.0, 'Team pizza'),
  makeExpense('2025-01-23', 'Software', 99.0, 'Monitoring add-on'),
  makeExpense('2025-01-24', 'Office', 65.0, 'Monitor arm'),
  makeExpense('2025-01-25', 'Travel', 140.0, 'Hotel night'),
  makeExpense('2025-01-26', 'Meals', 19.5, 'Breakfast'),
  makeExpense('2025-01-27', 'Software', 34.0, 'Design tool add-on'),
  makeExpense('2025-01-28', 'Office', 12.0, 'Notebooks'),
  makeExpense('2025-01-29', 'Travel', 75.0, 'Parking'),
  makeExpense('2025-01-30', 'Meals', 60.0, 'Offsite lunch'),
  makeExpense('2025-01-31', 'Software', 200.0, 'Annual license'),
  makeExpense('2025-01-31', 'Office', 48.0, 'Desk plant'),
  makeExpense('2025-01-31', 'Travel', 33.0, 'Taxi home'),
];

// --- API routes (registered before static middleware) ---

app.get('/api/me', (req, res) => {
  const raw = req.get('X-Knowi-App-User');
  if (!raw) {
    return res.json({ name: null, email: null });
  }
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded);
    res.json({ name: parsed.name ?? null, email: parsed.email ?? null });
  } catch {
    res.json({ name: null, email: null });
  }
});

app.get('/api/expenses', (req, res) => {
  res.json({ expenses });
});

app.post('/api/expenses', (req, res) => {
  const { date, category, amount, note } = req.body || {};
  if (!date || !category || amount === undefined || amount === null) {
    return res.status(400).json({ error: 'date, category and amount are required' });
  }
  const expense = makeExpense(date, category, Number(amount), note || '');
  expenses.push(expense);
  res.status(201).json({ expense });
});

// --- Static files + SPA fallback ---

const webRoot = path.join(__dirname, '..', 'web');
const indexHtmlPath = path.join(webRoot, 'index.html');

app.use(express.static(webRoot));

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(indexHtmlPath);
});

const port = Number(process.env.PORT);
app.listen(port, '0.0.0.0');