import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DAY = 86400000;
const NOW = Date.now();
function addDays(base, n) {
  const d = base instanceof Date ? base : new Date(base);
  return new Date(d.getTime() + n * DAY).toISOString();
}

const ITEMS = [
  'Cordless Drill', 'Circular Saw', 'Ladder 12ft', 'Pressure Washer', 'Concrete Mixer',
  'Scaffolding Kit', 'Tile Cutter', 'Heat Gun', 'Wet/Dry Vacuum', 'Angle Grinder',
  'Stud Finder', 'Level 48in', 'Workbench', 'Generator 2000W', 'Air Compressor',
  'Paint Sprayer', 'Floor Sander', 'Post Hole Digger', 'Trencher', 'Welding Machine',
  'Track Saw', 'Miter Saw', 'Belt Sander', 'Router', 'Impact Driver',
  'Hammer Drill', 'Tile Leveler', 'Caulk Gun', 'Heat Mat', 'Pipe Wrench'
];

const CUSTOMERS = [
  'Ava Thompson', 'Liam Chen', 'Noah Patel', 'Emma Rodriguez', 'Olivia Kim',
  'Mason Garcia', 'Sophia Nguyen', 'Ethan Brooks', 'Isabella Moore', 'Lucas Rivera',
  'Mia Johnson', 'James Wilson', 'Charlotte Davis', 'Benjamin Lee', 'Amelia Clark',
  'Henry Walker', 'Harper Hall', 'Jack Allen', 'Evelyn Young', 'Daniel King',
  'Grace Wright', 'Owen Scott', 'Chloe Green', 'Ryan Adams', 'Layla Baker',
  'Nathan Hill', 'Zoe Carter', 'Caleb Mitchell', 'Aria Roberts', 'Wyatt Turner'
];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildRentals() {
  const rand = mulberry32(20261105);
  const rentals = [];
  for (let i = 0; i < 40; i++) {
    const k = 1 + Math.floor(rand() * 30);
    const start = addDays(NOW, -k);
    const due = addDays(NOW, k);
    let status = due < new Date(NOW).toISOString() ? 'Overdue' : 'Active';
    if (rand() < 0.3) status = 'Returned';
    rentals.push({
      id: i + 1,
      item: ITEMS[i % ITEMS.length],
      customer: CUSTOMERS[i % CUSTOMERS.length],
      start,
      due,
      status
    });
  }
  return rentals;
}

const rentals = buildRentals();

const app = express();
app.use(express.json({ limit: '256kb' }));

app.get('/api/rentals', (req, res) => {
  res.json({ rentals });
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..', 'web');
const indexHtmlPath = path.join(webRoot, 'index.html');

app.use(express.static(webRoot));

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(indexHtmlPath);
});

const port = Number(process.env.PORT);
app.listen(port, '0.0.0.0');