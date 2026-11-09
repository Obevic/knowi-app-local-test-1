import express from 'express';

const app = express();
app.use(express.json({ limit: '256kb' }));

const CATEGORIES = ['Password reset', 'Account lockout', 'Hardware', 'Software', 'Network', 'Access request'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const STATUSES = ['Open', 'In progress', 'Resolved'];

const SUBJECTS = [
  'Cannot reset password',
  'Locked out of account',
  'Monitor not turning on',
  'Laptop keyboard failing',
  'Printer not printing',
  'Software update failed',
  'Application crashes on launch',
  'No internet connection',
  'Slow network speed',
  'Request admin access',
  'Need VPN access',
  'Email not syncing',
  'Password expired',
  'Account locked after failed attempts',
  'Mouse not working',
  'Keyboard not responding',
  'External drive not detected',
  'Monitor flickering',
  'Webcam not detected',
  'Headset not working',
  'Outlook not opening',
  'Excel formula error',
  'Word document corrupted',
  'Zoom not connecting',
  'Slack notifications missing',
  'Wi-Fi keeps disconnecting',
  'Cannot reach internal site',
  'DNS resolution failing',
  'Request access to shared drive',
  'Need database access',
  'Request new user account',
  'Cannot log in to portal',
  'Two-factor code not arriving',
  'SSO login failing',
  'Monitor cable loose',
  'Laptop battery not charging',
  'Docking station not working',
  'Software license expired',
  'Browser not loading pages',
  'Network drive not mapping'
];

const REQUESTERS = [
  'Ava Chen', 'Liam Patel', 'Noah Kim', 'Emma Rossi', 'Olivia Novak',
  'Ethan Brooks', 'Mia Torres', 'Lucas Weber', 'Sofia Marino', 'Jack O\'Connor',
  'Lily Zhang', 'Henry Silva', 'Grace Ito', 'Owen Fischer', 'Chloe Dubois',
  'Mason Reyes', 'Isla Costa', 'Leo Andersson', 'Ruby Nakamura', 'Finn O\'Brien',
  'Nora Lindqvist', 'Caleb Moreau', 'Hazel Petrov', 'Jude Almeida', 'Ivy Kowalski',
  'Theo Bergström', 'Mila Haddad', 'Rex Tanaka', 'Lena Vasquez', 'Oscar Lindgren',
  'Daisy Fontaine', 'Nico Romano', 'Tess O\'Leary', 'Ravi Kapoor', 'Elsie Marchetti',
  'Dylan Osei', 'Freya Lindholm', 'Kai Yamamoto', 'Bella Costa', 'Arjun Mehta'
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
  const rand = mulberry32(11091756);
  const now = Date.now();
  const DAY = 86400000;
  const tickets = [];
  for (let i = 0; i < 40; i++) {
    const id = 1000 + i;
    const subject = SUBJECTS[i % SUBJECTS.length];
    const requester = REQUESTERS[i % REQUESTERS.length];
    const category = CATEGORIES[i % CATEGORIES.length];
    const priority = PRIORITIES[Math.floor(rand() * PRIORITIES.length)];
    const status = STATUSES[Math.floor(rand() * STATUSES.length)];
    const created = new Date(now - Math.floor(rand() * 14 * DAY) - Math.floor(rand() * DAY)).toISOString();
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