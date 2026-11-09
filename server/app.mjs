import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '../web');
const indexHtmlPath = path.join(webRoot, 'index.html');

const app = express();
app.use(express.json({ limit: '256kb' }));

// In-memory sample data (no persistence)
const expenses = [];
(function seed() {
  const cats = ['Software', 'Travel', 'Meals', 'Equipment', 'Marketing', 'Office'];
  const notes = [
    'Annual subscription renewal',
    'Client dinner',
    'Flight to conference',
    'New monitor for design team',
    'Team offsite catering',
    'Monthly cloud hosting',
    'Ad campaign boost',
    'Standing desks',
    'Lunch with prospects',
    'Hotel for sales trip',
    'Domain and SSL renewal',
    'Office snacks restock',
    'Printed brochures',
    'Conference badge fees',
    'Rideshare to airport',
    'Software license upgrade',
    'Team lunch',
    'Webinar platform fee',
    'Replacement keyboard',
    'Client gift',
    'Monthly SaaS tool',
    'Office chair',
    'Marketing event booth',
    'Coffee and pastries',
    'Flight for onboarding',
    'Storage add-on',
    'Whiteboard and markers',
    'Dinner with partner',
    'Annual insurance',
    'Laptop for new hire'
  ];
  const now = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 2);
    const cat = cats[i % cats.length];
    const amount = Math.round((Math.random() * 480 + 20) * 100) / 100;
    expenses.push({
      id: i + 1,
      date: d.toISOString().slice(0, 10),
      category: cat,
      amount,
      note: notes[i % notes.length]
    });
  }
})();

function getViewer(req) {
  const raw = req.headers['x-knowi-app-user'];
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const obj = JSON.parse(json);
    return { name: obj.name || null, email: obj.email || null };
  } catch {
    return null;
  }
}

app.get('/api/me', (req, res) => {
  const v = getViewer(req);
  res.json(v ? { name: v.name, email: v.email } : null);
});

app.get('/api/expenses', (req, res) => {
  const sorted = [...expenses].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
  const categories = [...new Set(expenses.map((e) => e.category))].sort();
  const latest = sorted[0] ? sorted[0].date : new Date().toISOString().slice(0, 10);
  const monthLabel = new Date(latest + 'T00:00:00').toLocaleString('en-US', { month: 'long', year: 'numeric' });
  res.json({ expenses: sorted, categories, monthLabel });
});

app.post('/api/expenses', (req, res) => {
  const { date, category, amount, note } = req.body || {};
  if (!date || !category || amount === undefined || amount === null || amount === '') {
    return res.status(400).json({ error: 'date, category and amount are required' });
  }
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }
  const expense = {
    id: expenses.length ? Math.max(...expenses.map((e) => e.id)) + 1 : 1,
    date,
    category: String(category),
    amount: amt,
    note: note ? String(note) : ''
  };
  expenses.unshift(expense);
  res.json({ expense });
});

app.use(express.static(webRoot));
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(indexHtmlPath);
});

app.listen(Number(process.env.PORT), '0.0.0.0');