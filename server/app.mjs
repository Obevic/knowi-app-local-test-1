import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '256kb' }));

const webRoot = path.resolve(__dirname, '../web');
const indexHtmlPath = path.join(webRoot, 'index.html');

const items = [
  { id: 1, name: 'A4 Copy Paper', supplier: 'Staples', quantity: 120, reorderPoint: 40, unitCost: 4.25 },
  { id: 2, name: 'Ballpoint Pens (Blue)', supplier: 'Office Depot', quantity: 300, reorderPoint: 100, unitCost: 0.35 },
  { id: 3, name: 'Sticky Notes 3x3', supplier: 'Staples', quantity: 85, reorderPoint: 50, unitCost: 2.10 },
  { id: 4, name: 'Toner Cartridge HP 26A', supplier: 'CDW', quantity: 12, reorderPoint: 15, unitCost: 89.99 },
  { id: 5, name: 'USB-C Cable 6ft', supplier: 'Amazon Business', quantity: 45, reorderPoint: 20, unitCost: 12.50 },
  { id: 6, name: 'Whiteboard Markers (Set)', supplier: 'Office Depot', quantity: 60, reorderPoint: 25, unitCost: 8.75 },
  { id: 7, name: 'HDMI Adapter', supplier: 'CDW', quantity: 8, reorderPoint: 10, unitCost: 19.99 },
  { id: 8, name: 'Desk Organizer', supplier: 'Amazon Business', quantity: 22, reorderPoint: 10, unitCost: 24.00 },
  { id: 9, name: 'Paper Clips (Box)', supplier: 'Staples', quantity: 150, reorderPoint: 60, unitCost: 3.40 },
  { id: 10, name: 'Monitor Stand', supplier: 'CDW', quantity: 5, reorderPoint: 8, unitCost: 45.00 },
  { id: 11, name: 'Notebook 8.5x11', supplier: 'Office Depot', quantity: 200, reorderPoint: 75, unitCost: 1.85 },
  { id: 12, name: 'Stapler (Heavy Duty)', supplier: 'Staples', quantity: 14, reorderPoint: 6, unitCost: 28.50 },
  { id: 13, name: 'Webcam 1080p', supplier: 'CDW', quantity: 3, reorderPoint: 5, unitCost: 65.00 },
  { id: 14, name: 'Keyboard (Wireless)', supplier: 'Amazon Business', quantity: 18, reorderPoint: 10, unitCost: 39.99 },
  { id: 15, name: 'Mouse (Ergonomic)', supplier: 'Amazon Business', quantity: 25, reorderPoint: 12, unitCost: 32.50 },
  { id: 16, name: 'Binder Clips (Assorted)', supplier: 'Staples', quantity: 90, reorderPoint: 40, unitCost: 4.75 },
  { id: 17, name: 'Label Printer Tape', supplier: 'Office Depot', quantity: 7, reorderPoint: 10, unitCost: 14.25 },
  { id: 18, name: 'Desk Lamp (LED)', supplier: 'CDW', quantity: 11, reorderPoint: 5, unitCost: 55.00 },
  { id: 19, name: 'Cable Management Kit', supplier: 'Amazon Business', quantity: 30, reorderPoint: 15, unitCost: 18.99 },
  { id: 20, name: 'Ergonomic Chair', supplier: 'CDW', quantity: 2, reorderPoint: 3, unitCost: 299.00 },
  { id: 21, name: 'Standing Desk Mat', supplier: 'Amazon Business', quantity: 16, reorderPoint: 8, unitCost: 42.00 },
  { id: 22, name: 'Screen Cleaner Kit', supplier: 'Staples', quantity: 40, reorderPoint: 20, unitCost: 9.50 },
  { id: 23, name: 'Power Strip (6-outlet)', supplier: 'CDW', quantity: 9, reorderPoint: 12, unitCost: 22.99 },
  { id: 24, name: 'HDMI Cable 10ft', supplier: 'Amazon Business', quantity: 28, reorderPoint: 15, unitCost: 15.50 },
  { id: 25, name: 'USB Hub (4-port)', supplier: 'CDW', quantity: 13, reorderPoint: 8, unitCost: 27.99 },
  { id: 26, name: 'Desk Pad (Large)', supplier: 'Amazon Business', quantity: 19, reorderPoint: 10, unitCost: 34.00 },
  { id: 27, name: 'Monitor Arm (Dual)', supplier: 'CDW', quantity: 4, reorderPoint: 6, unitCost: 120.00 },
  { id: 28, name: 'Headset (Noise Cancel)', supplier: 'Amazon Business', quantity: 6, reorderPoint: 5, unitCost: 89.99 },
  { id: 29, name: 'Whiteboard (48x36)', supplier: 'Office Depot', quantity: 3, reorderPoint: 4, unitCost: 75.00 },
  { id: 30, name: 'Dry Erase Board Eraser', supplier: 'Staples', quantity: 35, reorderPoint: 15, unitCost: 6.25 },
  { id: 31, name: 'File Folders (100ct)', supplier: 'Staples', quantity: 110, reorderPoint: 50, unitCost: 12.00 },
  { id: 32, name: 'Box Cutter (Safety)', supplier: 'Office Depot', quantity: 20, reorderPoint: 10, unitCost: 7.50 },
  { id: 33, name: 'Tape Dispenser', supplier: 'Staples', quantity: 27, reorderPoint: 12, unitCost: 5.99 },
  { id: 34, name: 'Scissors (Heavy Duty)', supplier: 'Office Depot', quantity: 15, reorderPoint: 8, unitCost: 11.50 },
  { id: 35, name: 'Highlighters (Set of 4)', supplier: 'Staples', quantity: 55, reorderPoint: 25, unitCost: 6.75 },
  { id: 36, name: 'Pencil (HB)', supplier: 'Office Depot', quantity: 500, reorderPoint: 200, unitCost: 0.25 },
  { id: 37, name: 'Eraser (Pink)', supplier: 'Staples', quantity: 180, reorderPoint: 80, unitCost: 0.45 },
  { id: 38, name: 'Ruler (12-inch)', supplier: 'Office Depot', quantity: 42, reorderPoint: 20, unitCost: 2.50 },
  { id: 39, name: 'Protractor', supplier: 'Staples', quantity: 33, reorderPoint: 15, unitCost: 3.25 },
  { id: 40, name: 'Compass (Drafting)', supplier: 'Office Depot', quantity: 10, reorderPoint: 5, unitCost: 8.99 },
  { id: 41, name: 'Graph Paper (Pad)', supplier: 'Staples', quantity: 65, reorderPoint: 30, unitCost: 4.50 },
  { id: 42, name: 'Manila Folders (50ct)', supplier: 'Office Depot', quantity: 48, reorderPoint: 25, unitCost: 9.75 },
  { id: 43, name: 'Paper Shredder (Small)', supplier: 'CDW', quantity: 1, reorderPoint: 2, unitCost: 149.00 },
  { id: 44, name: 'Label Maker (Portable)', supplier: 'Office Depot', quantity: 4, reorderPoint: 3, unitCost: 35.00 },
  { id: 45, name: 'Desk Drawer (Rolling)', supplier: 'CDW', quantity: 2, reorderPoint: 3, unitCost: 85.00 },
  { id: 46, name: 'Cable Ties (100ct)', supplier: 'Amazon Business', quantity: 70, reorderPoint: 30, unitCost: 5.50 },
  { id: 47, name: 'Surge Protector (8-outlet)', supplier: 'CDW', quantity: 7, reorderPoint: 10, unitCost: 32.99 },
  { id: 48, name: 'USB Flash Drive 64GB', supplier: 'Amazon Business', quantity: 38, reorderPoint: 20, unitCost: 13.99 },
  { id: 49, name: 'External SSD 1TB', supplier: 'CDW', quantity: 5, reorderPoint: 4, unitCost: 99.99 },
  { id: 50, name: 'Portable Monitor 15.6"', supplier: 'CDW', quantity: 2, reorderPoint: 3, unitCost: 249.00 },
  { id: 51, name: 'Laptop Stand (Aluminum)', supplier: 'Amazon Business', quantity: 12, reorderPoint: 6, unitCost: 48.00 },
  { id: 52, name: 'Bluetooth Speaker (Small)', supplier: 'Amazon Business', quantity: 9, reorderPoint: 5, unitCost: 39.99 },
  { id: 53, name: 'Desk Fan (USB)', supplier: 'Amazon Business', quantity: 14, reorderPoint: 8, unitCost: 16.50 },
  { id: 54, name: 'Humidifier (Small)', supplier: 'Amazon Business', quantity: 6, reorderPoint: 4, unitCost: 45.00 },
  { id: 55, name: 'Air Purifier (Compact)', supplier: 'CDW', quantity: 3, reorderPoint: 2, unitCost: 129.00 },
  { id: 56, name: 'Desk Plant (Artificial)', supplier: 'Amazon Business', quantity: 17, reorderPoint: 8, unitCost: 22.00 },
  { id: 57, name: 'Cork Board (Small)', supplier: 'Office Depot', quantity: 8, reorderPoint: 5, unitCost: 18.50 },
  { id: 58, name: 'Magnetic Whiteboard', supplier: 'Office Depot', quantity: 4, reorderPoint: 3, unitCost: 65.00 },
  { id: 59, name: 'Easel (Portable)', supplier: 'Office Depot', quantity: 2, reorderPoint: 2, unitCost: 55.00 },
  { id: 60, name: 'Conference Table (6-seat)', supplier: 'CDW', quantity: 1, reorderPoint: 1, unitCost: 450.00 },
  { id: 61, name: 'Office Chair (Task)', supplier: 'CDW', quantity: 4, reorderPoint: 3, unitCost: 189.00 },
  { id: 62, name: 'Filing Cabinet (3-drawer)', supplier: 'CDW', quantity: 2, reorderPoint: 2, unitCost: 220.00 },
  { id: 63, name: 'Bookshelf (5-shelf)', supplier: 'CDW', quantity: 3, reorderPoint: 2, unitCost: 150.00 },
  { id: 64, name: 'Credenza (Storage)', supplier: 'CDW', quantity: 1, reorderPoint: 1, unitCost: 380.00 },
  { id: 65, name: 'Meeting Room TV 55"', supplier: 'CDW', quantity: 1, reorderPoint: 1, unitCost: 650.00 },
  { id: 66, name: 'Video Conferencing Kit', supplier: 'CDW', quantity: 2, reorderPoint: 2, unitCost: 320.00 },
  { id: 67, name: 'Wireless Presenter', supplier: 'CDW', quantity: 5, reorderPoint: 3, unitCost: 75.00 },
  { id: 68, name: 'Laser Pointer', supplier: 'Amazon Business', quantity: 11, reorderPoint: 6, unitCost: 14.99 },
  { id: 69, name: 'Document Camera', supplier: 'CDW', quantity: 1, reorderPoint: 1, unitCost: 299.00 },
  { id: 70, name: 'Whiteboard Marker (Red)', supplier: 'Staples', quantity: 48, reorderPoint: 20, unitCost: 1.25 },
  { id: 71, name: 'Whiteboard Marker (Black)', supplier: 'Staples', quantity: 52, reorderPoint: 20, unitCost: 1.25 },
  { id: 72, name: 'Whiteboard Marker (Blue)', supplier: 'Staples', quantity: 44, reorderPoint: 20, unitCost: 1.25 },
  { id: 73, name: 'Whiteboard Marker (Green)', supplier: 'Staples', quantity: 38, reorderPoint: 20, unitCost: 1.25 },
  { id: 74, name: 'Dry Erase Board (Small)', supplier: 'Office Depot', quantity: 6, reorderPoint: 4, unitCost: 35.00 },
  { id: 75, name: 'Magnetic Markers (Set)', supplier: 'Office Depot', quantity: 15, reorderPoint: 8, unitCost: 12.50 },
  { id: 76, name: 'Board Eraser (Magnetic)', supplier: 'Staples', quantity: 22, reorderPoint: 10, unitCost: 4.50 },
  { id: 77, name: 'Toner Cartridge HP 58A', supplier: 'CDW', quantity: 6, reorderPoint: 8, unitCost: 74.99 },
  { id: 78, name: 'Toner Cartridge HP 203A', supplier: 'CDW', quantity: 4, reorderPoint: 6, unitCost: 94.99 },
  { id: 79, name: 'Ink Cartridge (Color)', supplier: 'CDW', quantity: 9, reorderPoint: 5, unitCost: 29.99 },
  { id: 80, name: 'Ink Cartridge (Black)', supplier: 'CDW', quantity: 11, reorderPoint: 6, unitCost: 24.99 },
  { id: 81, name: 'Receipt Paper Roll', supplier: 'Staples', quantity: 30, reorderPoint: 15, unitCost: 6.50 },
  { id: 82, name: 'Thermal Paper (Roll)', supplier: 'Staples', quantity: 25, reorderPoint: 12, unitCost: 8.75 },
  { id: 83, name: 'Label Paper (A4)', supplier: 'Staples', quantity: 40, reorderPoint: 20, unitCost: 11.50 },
  { id: 84, name: 'Envelope (A4)', supplier: 'Staples', quantity: 100, reorderPoint: 50, unitCost: 0.85 },
  { id: 85, name: 'Envelope (Letter)', supplier: 'Staples', quantity: 120, reorderPoint: 60, unitCost: 0.45 },
  { id: 86, name: 'Stamps (Assorted)', supplier: 'Office Depot', quantity: 18, reorderPoint: 10, unitCost: 7.50 },
  { id: 87, name: 'Rubber Stamp (Custom)', supplier: 'Office Depot', quantity: 5, reorderPoint: 3, unitCost: 25.00 },
  { id: 88, name: 'Ink Pad (Stamp)', supplier: 'Office Depot', quantity: 14, reorderPoint: 8, unitCost: 5.50 },
  { id: 89, name: 'Paperweight (Glass)', supplier: 'Amazon Business', quantity: 8, reorderPoint: 4, unitCost: 12.00 },
  { id: 90, name: 'Desk Bell', supplier: 'Amazon Business', quantity: 6, reorderPoint: 3, unitCost: 9.50 },
  { id: 91, name: 'Candle (Scented)', supplier: 'Amazon Business', quantity: 12, reorderPoint: 6, unitCost: 14.00 },
  { id: 92, name: 'Incense (Set)', supplier: 'Amazon Business', quantity: 16, reorderPoint: 8, unitCost: 11.50 },
  { id: 93, name: 'Aromatherapy Diffuser', supplier: 'Amazon Business', quantity: 7, reorderPoint: 4, unitCost: 38.00 },
  { id: 94, name: 'Essential Oil (Lavender)', supplier: 'Amazon Business', quantity: 10, reorderPoint: 5, unitCost: 16.50 },
  { id: 95, name: 'Essential Oil (Eucalyptus)', supplier: 'Amazon Business', quantity: 9, reorderPoint: 5, unitCost: 16.50 },
  { id: 96, name: 'Hand Sanitizer (Large)', supplier: 'Staples', quantity: 20, reorderPoint: 10, unitCost: 8.50 },
  { id: 97, name: 'Disinfectant Wipes (Box)', supplier: 'Staples', quantity: 35, reorderPoint: 15, unitCost: 6.75 },
  { id: 98, name: 'Paper Towels (Roll)', supplier: 'Staples', quantity: 45, reorderPoint: 20, unitCost: 4.25 },
  { id: 99, name: 'Trash Bags (30ct)', supplier: 'Staples', quantity: 28, reorderPoint: 12, unitCost: 7.50 },
  { id: 100, name: 'Recycling Bin (Small)', supplier: 'Office Depot', quantity: 5, reorderPoint: 3, unitCost: 15.00 }
];

app.get('/api/items', (req, res) => {
  res.json({ items });
});

app.use(express.static(webRoot));

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(indexHtmlPath);
});

const port = Number(process.env.PORT);
app.listen(port, '0.0.0.0');