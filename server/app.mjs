import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '256kb' }));

const webRoot = path.resolve(__dirname, '../web');
const indexHtmlPath = path.join(webRoot, 'index.html');

const items = [
  { id: 1, item: 'Cable Kit', supplier: 'North Supply', quantity: 42, reorderPoint: 10, unitCost: 18 },
  { id: 2, item: 'Power Adapter', supplier: 'Voltworks', quantity: 120, reorderPoint: 30, unitCost: 24 },
  { id: 3, item: 'USB-C Hub', supplier: 'North Supply', quantity: 8, reorderPoint: 15, unitCost: 55 },
  { id: 4, item: 'HDMI Cable', supplier: 'CableWorks', quantity: 200, reorderPoint: 50, unitCost: 12 },
  { id: 5, item: 'Display Stand', supplier: 'ErgoForm', quantity: 15, reorderPoint: 8, unitCost: 39 },
  { id: 6, item: 'Laptop Sleeve', supplier: 'CarryOn', quantity: 60, reorderPoint: 20, unitCost: 28 },
  { id: 7, item: 'Webcam', supplier: 'OptiView', quantity: 5, reorderPoint: 12, unitCost: 89 },
  { id: 8, item: 'Headset', supplier: 'SoundCore', quantity: 34, reorderPoint: 10, unitCost: 72 },
  { id: 9, item: 'Keyboard', supplier: 'KeyCraft', quantity: 48, reorderPoint: 15, unitCost: 65 },
  { id: 10, item: 'Mouse', supplier: 'KeyCraft', quantity: 90, reorderPoint: 25, unitCost: 32 },
  { id: 11, item: 'Monitor Arm', supplier: 'ErgoForm', quantity: 12, reorderPoint: 6, unitCost: 48 },
  { id: 12, item: 'Desk Mat', supplier: 'SurfaceCo', quantity: 110, reorderPoint: 30, unitCost: 19 },
  { id: 13, item: 'Notebook', supplier: 'PaperTrail', quantity: 250, reorderPoint: 60, unitCost: 6 },
  { id: 14, item: 'Pen Set', supplier: 'PaperTrail', quantity: 180, reorderPoint: 40, unitCost: 9 },
  { id: 15, item: 'Sticky Notes', supplier: 'PaperTrail', quantity: 320, reorderPoint: 80, unitCost: 4 },
  { id: 16, item: 'Whiteboard Marker', supplier: 'PaperTrail', quantity: 140, reorderPoint: 35, unitCost: 3 },
  { id: 17, item: 'Ergonomic Chair', supplier: 'ErgoForm', quantity: 6, reorderPoint: 4, unitCost: 240 },
  { id: 18, item: 'Standing Desk', supplier: 'ErgoForm', quantity: 3, reorderPoint: 2, unitCost: 480 },
  { id: 19, item: 'Desk Lamp', supplier: 'Lumen', quantity: 28, reorderPoint: 10, unitCost: 45 },
  { id: 20, item: 'LED Strip', supplier: 'Lumen', quantity: 75, reorderPoint: 20, unitCost: 22 },
  { id: 21, item: 'Surge Protector', supplier: 'Voltworks', quantity: 55, reorderPoint: 15, unitCost: 27 },
  { id: 22, item: 'Battery Pack', supplier: 'Voltworks', quantity: 40, reorderPoint: 12, unitCost: 38 },
  { id: 23, item: 'Charging Dock', supplier: 'Voltworks', quantity: 22, reorderPoint: 8, unitCost: 62 },
  { id: 24, item: 'Phone Mount', supplier: 'CarryOn', quantity: 65, reorderPoint: 18, unitCost: 16 },
  { id: 25, item: 'Tablet Case', supplier: 'CarryOn', quantity: 38, reorderPoint: 12, unitCost: 34 },
  { id: 26, item: 'Screen Protector', supplier: 'OptiView', quantity: 130, reorderPoint: 30, unitCost: 11 },
  { id: 27, item: 'Microphone', supplier: 'SoundCore', quantity: 18, reorderPoint: 8, unitCost: 95 },
  { id: 28, item: 'Audio Interface', supplier: 'SoundCore', quantity: 9, reorderPoint: 5, unitCost: 140 },
  { id: 29, item: 'Cable Organizer', supplier: 'CableWorks', quantity: 95, reorderPoint: 25, unitCost: 8 },
  { id: 30, item: 'Label Printer', supplier: 'OptiView', quantity: 7, reorderPoint: 4, unitCost: 110 },
  { id: 31, item: 'Ink Cartridge', supplier: 'OptiView', quantity: 44, reorderPoint: 15, unitCost: 26 },
  { id: 32, item: 'Toner Cartridge', supplier: 'OptiView', quantity: 16, reorderPoint: 8, unitCost: 58 },
  { id: 33, item: 'Paper Ream', supplier: 'PaperTrail', quantity: 210, reorderPoint: 50, unitCost: 14 },
  { id: 34, item: 'Binder Clips', supplier: 'PaperTrail', quantity: 160, reorderPoint: 40, unitCost: 5 },
  { id: 35, item: 'Stapler', supplier: 'PaperTrail', quantity: 52, reorderPoint: 15, unitCost: 12 },
  { id: 36, item: 'Scissors', supplier: 'PaperTrail', quantity: 70, reorderPoint: 20, unitCost: 7 },
  { id: 37, item: 'Tape Dispenser', supplier: 'PaperTrail', quantity: 85, reorderPoint: 22, unitCost: 6 },
  { id: 38, item: 'Glue Stick', supplier: 'PaperTrail', quantity: 190, reorderPoint: 45, unitCost: 3 },
  { id: 39, item: 'Highlighter Set', supplier: 'PaperTrail', quantity: 125, reorderPoint: 30, unitCost: 8 },
  { id: 40, item: 'Easel Pad', supplier: 'PaperTrail', quantity: 33, reorderPoint: 10, unitCost: 17 }
];

app.get('/api/items', (req, res) => {
  res.json({ items });
});

app.post('/api/items/:id/restock', (req, res) => {
  const id = Number(req.params.id);
  const item = items.find((i) => i.id === id);
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }
  item.quantity = item.reorderPoint * 2;
  res.json({ item: item.item, quantity: item.quantity });
});

app.post('/api/items/:id/quantity', (req, res) => {
  const id = Number(req.params.id);
  const item = items.find((i) => i.id === id);
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }
  const { quantity } = req.body || {};
  const q = Number(quantity);
  if (!Number.isFinite(q) || q < 0) {
    return res.status(400).json({ error: 'Invalid quantity' });
  }
  item.quantity = Math.floor(q);
  res.json({ item: item.item, quantity: item.quantity });
});

app.use(express.static(webRoot));

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(indexHtmlPath);
});

const port = Number(process.env.PORT);
app.listen(port, '0.0.0.0');