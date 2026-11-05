import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DAY = 86400000;
const NOW = Date.now();
function addDays(base, n) {
  const d = base instanceof Date ? base : new Date(base);
  return new Date(d.getTime() + n * DAY).toISOString();
}

const ITEMS = [
  'Cordless Drill', 'Circular Saw', 'Ladder (24 ft)', 'Pressure Washer', 'Concrete Mixer',
  'Scaffolding Kit', 'Tile Cutter', 'Heat Gun', 'Wet/Dry Vacuum', 'Generator (5 kW)',
  'Angle Grinder', 'Table Saw', 'Air Compressor', 'Floor Sander', 'Paint Sprayer',
  'Stud Finder', 'Level (48 in)', 'Hammer Drill', 'Track Saw', 'Post Hole Digger',
  'Rototiller', 'Snow Blower', 'Chain Saw', 'Log Splitter', 'Welding Machine',
  'Pipe Wrench Set', 'Carpenter Square', 'Tape Measure (50 ft)', 'Workbench', 'Tool Chest'
];

const CUSTOMERS = [
  'Ava Thompson', 'Liam Chen', 'Noah Patel', 'Emma Rodriguez', 'Olivia Kim',
  'Ethan Brooks', 'Mia Nguyen', 'Lucas Garcia', 'Sophia Miller', 'Mason Davis',
  'Isabella Wright', 'James Foster', 'Charlotte Lee', 'Benjamin Cruz', 'Amelia Turner',
  'Henry Adams', 'Harper Wilson', 'Jack Morgan', 'Evelyn Scott', 'Daniel Reyes',
  'Grace Bennett', 'Ryan Cooper', 'Chloe Simmons', 'Nathan Price', 'Layla Murphy',
  'Owen Bailey', 'Zoe Coleman', 'Caleb Howard', 'Nora Ellis', 'Wyatt Parker',
  'Hazel Foster', 'Julian Ross', 'Violet Hayes', 'Gabriel Reed', 'Aria Coleman',
  'Leo Bennett', 'Stella Ward', 'Miles Grant', 'Ruby Ellis', 'Ezra Parker'
];

function buildRentals() {
  const rentals = [];
  for (let i = 0; i < 40; i++) {
    const k = 1 + (i % 30);
    const start = addDays(NOW, -k);
    const due = addDays(NOW, k);
    let status;
    if (i % 3 === 0) status = 'Returned';
    else if (i % 3 === 1) status = 'Active';
    else status = 'Overdue';
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

const app = express();
app.use(express.json({ limit: '256kb' }));

app.get('/api/rentals', (req, res) => {
  res.json({ rentals: buildRentals() });
});

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