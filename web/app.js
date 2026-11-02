window.knowiReportReady = false;

const STATUS = {
  risk: { label: 'At risk', fg: '#9C2F3C', bg: '#F5E3E5' },
  due: { label: 'Due soon', fg: '#7F5410', bg: '#F6ECD9' },
  ok: { label: 'On track', fg: '#276B5D', bg: '#E4F0EC' },
};

function seedInventory() {
  const names = [
    'Cable Kit', 'USB-C Cable', 'Adapter Hub', 'Sensor Pack', 'Docking Station',
    'Power Cable', 'Display Arm', 'Router Unit', 'Wireless Mouse', 'Mechanical Keyboard',
    'Webcam Mount', 'Surge Protector', 'HDMI Switch', 'Laptop Stand',
  ];
  const quantities = [11, 10, 22, 3, 14, 2, 8, 11, 17, 6, 4, 19, 1, 9];
  const reorderPoints = [10, 10, 8, 6, 4, 5, 8, 3, 6, 6, 5, 4, 3, 5];
  const unitCosts = [40, 12, 55, 95, 170, 18, 110, 220, 28, 75, 22, 33, 60, 48];
  const suppliers = [
    'North Supply', 'North Supply', 'West Supply', 'East Supply', 'West Supply',
    'East Supply', 'North Supply', 'West Supply', 'South Supply', 'South Supply',
    'East Supply', 'North Supply', 'West Supply', 'South Supply',
  ];
  return names.map((name, i) => ({
    id: `item-${i}`,
    item: name,
    supplier: suppliers[i],
    quantity: quantities[i],
    reorderPoint: reorderPoints[i],
    unitCost: unitCosts[i],
  }));
}

function statusFor(row) {
  if (row.quantity < row.reorderPoint) return STATUS.risk;
  if (row.quantity === row.reorderPoint) return STATUS.due;
  return STATUS.ok;
}

function formatCurrency(n) {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

const state = {
  rows: seedInventory(),
  search: '',
  supplier: 'All',
  page: 0,
};

const PAGE_SIZE = 50;

function getFiltered() {
  const q = state.search.trim().toLowerCase();
  return state.rows.filter((r) => {
    const matchesSearch = !q || r.item.toLowerCase().includes(q);
    const matchesSupplier = state.supplier === 'All' || r.supplier === state.supplier;
    return matchesSearch && matchesSupplier;
  });
}

function computeTotal() {
  return state.rows.reduce((sum, r) => sum + r.quantity * r.unitCost, 0);
}

function barSvg(row, color) {
  const ratio = Math.max(0, Math.min(1, row.quantity / (row.reorderPoint * 2 || 1)));
  const width = 56;
  const height = 6;
  const filled = Math.round(width * ratio);
  return `<svg class="stock-bar" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Stock level relative to reorder point">
    <rect x="0" y="0" width="${width}" height="${height}" rx="3" fill="#EAEFEF"></rect>
    <rect x="0" y="0" width="${filled}" height="${height}" rx="3" fill="${color}"></rect>
  </svg>`;
}

function renderSupplierOptions() {
  const select = document.getElementById('supplier-filter');
  const current = state.supplier;
  const uniqueSuppliers = Array.from(new Set(state.rows.map((r) => r.supplier))).sort();
  select.innerHTML = '';
  const allOpt = document.createElement('option');
  allOpt.value = 'All';
  allOpt.textContent = 'All suppliers';
  select.appendChild(allOpt);
  uniqueSuppliers.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    select.appendChild(opt);
  });
  select.value = current;
}

function renderTotal() {
  document.getElementById('total-value').textContent = formatCurrency(computeTotal());
}

function renderNavCount() {
  document.getElementById('nav-count').textContent = String(state.rows.length);
}

function renderTable() {
  const tbody = document.getElementById('inventory-body');
  const emptyState = document.getElementById('empty-state');
  const filtered = getFiltered();
  const pageRows = filtered.slice(0, (state.page + 1) * PAGE_SIZE);

  tbody.innerHTML = '';

  if (filtered.length === 0) {
    emptyState.hidden = false;
    document.getElementById('table-wrap').hidden = true;
    document.getElementById('show-more').hidden = true;
    return;
  }

  emptyState.hidden = true;
  document.getElementById('table-wrap').hidden = false;

  pageRows.forEach((row) => {
    const status = statusFor(row);
    const tr = document.createElement('tr');
    tr.className = 'inventory-row';

    const itemCell = document.createElement('td');
    itemCell.className = 'cell-item';
    itemCell.innerHTML = `
      <div class="item-name">${escapeHtml(row.item)}</div>
      <div class="item-status-row">
        <span class="status-pill" style="color:${status.fg};background:${status.bg}">${status.label}</span>
        ${barSvg(row, status.fg)}
      </div>
    `;
    tr.appendChild(itemCell);

    const supplierCell = document.createElement('td');
    supplierCell.textContent = row.supplier;
    tr.appendChild(supplierCell);

    const qtyCell = document.createElement('td');
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.min = '0';
    qtyInput.className = 'qty-input';
    qtyInput.value = String(row.quantity);
    qtyInput.setAttribute('aria-label', `Quantity for ${row.item}`);
    qtyInput.addEventListener('change', (e) => {
      const val = Math.max(0, Math.floor(Number(e.target.value) || 0));
      row.quantity = val;
      e.target.value = String(val);
      renderTotal();
      renderTable();
    });
    qtyCell.appendChild(qtyInput);
    tr.appendChild(qtyCell);

    const reorderCell = document.createElement('td');
    reorderCell.className = 'num-cell';
    reorderCell.textContent = String(row.reorderPoint);
    tr.appendChild(reorderCell);

    const costCell = document.createElement('td');
    costCell.className = 'num-cell';
    costCell.textContent = formatCurrency(row.unitCost);
    tr.appendChild(costCell);

    const restockCell = document.createElement('td');
    const restockBtn = document.createElement('button');
    restockBtn.type = 'button';
    restockBtn.className = 'btn-restock';
    restockBtn.textContent = 'Restock';
    restockBtn.addEventListener('click', () => {
      row.quantity = row.reorderPoint * 2;
      renderTotal();
      renderTable();
      announce(`${row.item} restocked to ${row.quantity} units`);
    });
    restockCell.appendChild(restockBtn);
    tr.appendChild(restockCell);

    tbody.appendChild(tr);
  });

  const showMore = document.getElementById('show-more');
  if (filtered.length > pageRows.length) {
    showMore.hidden = false;
  } else {
    showMore.hidden = true;
  }
}

function announce(message) {
  const live = document.getElementById('live-region');
  live.textContent = message;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderAll() {
  renderSupplierOptions();
  renderNavCount();
  renderTotal();
  renderTable();
}

function initControls() {
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', (e) => {
    state.search = e.target.value;
    state.page = 0;
    renderTable();
  });

  const supplierSelect = document.getElementById('supplier-filter');
  supplierSelect.addEventListener('change', (e) => {
    state.supplier = e.target.value;
    state.page = 0;
    renderTable();
  });

  document.getElementById('show-more-btn').addEventListener('click', () => {
    state.page += 1;
    renderTable();
  });
}

async function loadSession() {
  const viewerEl = document.getElementById('viewer-name');
  const viewerSub = document.getElementById('viewer-sub');
  try {
    const res = await fetch('api/session');
    if (res.status === 401) {
      viewerEl.textContent = 'Session expired';
      viewerSub.innerHTML = '<a href="login">Sign in again</a>';
      return;
    }
    if (!res.ok) throw new Error('Session request failed');
    const data = await res.json();
    if (data.name) {
      viewerEl.textContent = data.name;
      viewerSub.textContent = data.email || 'Signed in';
    } else {
      viewerEl.textContent = 'Preview viewer';
      viewerSub.textContent = 'Not signed in';
    }
  } catch (err) {
    viewerEl.textContent = 'Preview viewer';
    viewerSub.textContent = 'Not signed in';
  }
}

function init() {
  initControls();
  renderAll();
  loadSession();
  window.knowiReportReady = true;
}

document.addEventListener('DOMContentLoaded', init);
