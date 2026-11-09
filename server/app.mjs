import express from 'express';
import crypto from 'node:crypto';

const app = express();
app.use(express.json({ limit: '256kb' }));

const CATEGORIES = ['Password reset', 'Account lockout', 'Hardware', 'Software', 'Network', 'Access request'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const STATUSES = ['Open', 'In progress', 'Resolved'];

const SUBJECTS = [
  'Cannot reset password',
  'Locked out of account',
  'Monitor not turning on',
  'Laptop keyboard not working',
  'Printer not printing',
  'Software update failed',
  'Application crashes on launch',
  'No internet connection',
  'Slow network speed',
  'Cannot access shared drive',
  'Request admin access',
  'Email not syncing',
  'Wi-Fi keeps disconnecting',
  'Mouse not responding',
  'Screen flickering',
  'Need new monitor',
  'Request VPN access',
  'Cannot log in to portal',
  'Password expired',
  'Two-factor code not arriving',
  'USB drive not recognized',
  'Webcam not working',
  'Microphone not working',
  'Request software license',
  'Cannot install application',
  'Request database access',
  'Cannot access email',
  'Request new laptop',
  'Cannot connect to printer',
  'Request cloud storage access',
  'Cannot access intranet',
  'Request new monitor',
  'Cannot access shared folder',
  'Request new keyboard',
  'Cannot access VPN',
  'Request new mouse',
  'Cannot access network drive',
  'Request new headset',
  'Cannot access email server',
  'Request new webcam'
];

const REQUESTERS = [
  'Alice Johnson', 'Bob Smith', 'Carol Williams', 'David Brown', 'Emma Davis',
  'Frank Miller', 'Grace Wilson', 'Henry Moore', 'Ivy Taylor', 'Jack Anderson',
  'Karen Thomas', 'Liam Jackson', 'Mia White', 'Noah Harris', 'Olivia Martin',
  'Peter Thompson', 'Quinn Garcia', 'Rachel Martinez', 'Sam Rodriguez', 'Tina Lewis'
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTickets() {
  const rand = mulberry32(11091807);
  const now = Date.now();
  const tickets = [];
  for (let i = 0; i < 40; i++) {
    const id = 1000 + i;
    const subject = SUBJECTS[i % SUBJECTS.length];
    const requester = REQUESTERS[Math.floor(rand() * REQUESTERS.length)];
    const category = CATEGORIES[Math.floor(rand() * CATEGORIES.length)];
    const priority = PRIORITIES[Math.floor(rand() * PRIORITIES.length)];
    const status = STATUSES[Math.floor(rand() * STATUSES.length)];
    const created = new Date(now - Math.floor(rand() * 14 * 24 * 60 * 60 * 1000)).toISOString();
    tickets.push({ id, subject, requester, category, priority, status, created });
  }
  return tickets;
}

const tickets = buildTickets();

function getViewer(req) {
  const raw = req.get('X-Knowi-App-User');
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    return { name: parsed.name || null, email: parsed.email || null };
  } catch {
    return null;
  }
}

app.get('/api/me', (req, res) => {
  res.json(getViewer(req));
});

app.get('/api/tickets', (req, res) => {
  const categories = [...new Set(tickets.map(t => t.category))];
  const statuses = [...new Set(tickets.map(t => t.status))];
  const priorities = [...new Set(tickets.map(t => t.priority))];
  res.json({ tickets, categories, statuses, priorities });
});

app.post('/api/tickets/:id/status', (req, res) => {
  const id = Number(req.params.id);
  const ticket = tickets.find(t => t.id === id);
  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found' });
  }
  const status = req.body && req.body.status;
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  ticket.status = status;
  res.json({ ticket });
});

const webRoot = new URL('../web', import.meta.url).pathname;
const indexHtmlPath = new URL('../web/index.html', import.meta.url).pathname;

app.use(express.static(webRoot));

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(indexHtmlPath);
});

const port = Number(process.env.PORT);
app.listen(port, '0.0.0.0');