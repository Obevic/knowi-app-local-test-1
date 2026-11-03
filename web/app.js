window.knowiReportReady = false;

const ITEMS = [
  { id: 'cable-kit', name: 'Cable Kit', supplier: 'North Supply', quantity: 11, reorderPoint: 10, unitCost: 40 },
  { id: 'usb-c-cable', name: 'USB-C Cable', supplier: 'North Supply', quantity: 10, reorderPoint: 10, unitCost: 12 },
  { id: 'adapter-hub', name: 'Adapter Hub', supplier: 'West Supply', quantity: 22, reorderPoint: 8, unitCost: 55 },
  { id: 'sensor-pack', name: 'Sensor Pack', supplier: 'East Supply', quantity: 3, reorderPoint: 6, unitCost: 95 },
  { id: 'docking-station', name: 'Docking Station', supplier: 'West Supply', quantity: 14, reorderPoint: 4, unitCost: 170 },
  { id: 'power-cable', name: 'Power Cable', supplier: 'East Supply', quantity: 2, reorderPoint: 5, unitCost: 18 },
  { id: 'display-arm', name: 'Display Arm', supplier: 'North Supply', quantity: 8, reorderPoint: 8, unitCost: 110 },
  { id: 'router-unit', name: 'Router Unit', supplier: 'West Supply', quantity: 11, reorderPoint: 3, unitCost: 220 },
];

const state = {
  items: ITEMS.map((item) => ({ ...item })),
  search: '',
  supplier: 'All',
  toast: null,
};

const money = (value) =>
  '$' + Math.round(value).toLocaleString('en-US');

function getSupplierOptions() {
  const suppliers = Array.from(new Set(state.items.map((item) => item.supplier))).sort();
  return ['All', ...suppliers];
}

function getFilteredItems() {
  const query = state.search.trim().toLowerCase();
  return state.items.filter((item) => {
    const matchesSearch = query === '' || item.name.toLowerCase().includes(query);
    const matchesSupplier = state.supplier === 'All' || item.supplier === state.supplier;
    return matchesSearch && matchesSupplier;
  });
}

function getTotalStockValue() {
  return state.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
}

function renderFilterOptions() {
  const select = document.getElementById('supplier-filter');
  const options = getSupplierOptions();
  const current = state.supplier;
  select.innerHTML = '';
  for (const option of options) {
    const el = document.createElement('option');
    el.value = option;
    el.textContent = option;
    if (option === current) el.selected = true;
    select.appendChild(el);
  }
}

function renderTotal() {
  document.getElementById('total-stock-value').textContent = money(getTotalStockValue());
}

function renderTable() {
  const tbody = document.getElementById('items-tbody');
  const emptyState = document.getElementById('empty-state');
  const filtered = getFilteredItems();

  tbody.innerHTML = '';

  if (filtered.length === 0) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  for (const item of filtered) {
    const row = document.createElement('tr');
    const lowStock = item.quantity <= item.reorderPoint;
    if (lowStock) row.classList.add('row-at-risk');

    const nameCell = document.createElement('td');
    nameCell.className = 'cell-name';
    const nameWrap = document.createElement('div');
    nameWrap.className = 'item-name-wrap';
    const nameEl = document.createElement('span');
    nameEl.className = 'item-name';
    nameEl.textContent = item.name;
    nameWrap.appendChild(nameEl);
    if (lowStock) {
      const badge = document.createElement('span');
      badge.className = 'badge badge-risk';
      badge.textContent = 'Needs restock';
      nameWrap.appendChild(badge);
    }
    nameCell.appendChild(nameWrap);

    const supplierCell = document.createElement('td');
    supplierCell.textContent = item.supplier;

    const quantityCell = document.createElement('td');
    const quantityInput = document.createElement('input');
    quantityInput.type = 'number';
    quantityInput.min = '0';
    quantityInput.className = 'quantity-input';
    quantityInput.value = String(item.quantity);
    quantityInput.setAttribute('aria-label', `Quantity for ${item.name}`);
    quantityInput.addEventListener('input', (event) => {
      const value = Number(event.target.value);
      item.quantity = Number.isFinite(value) && value >= 0 ? value : 0;
      renderTotal();
      renderRowState(row, item);
    });
    quantityCell.appendChild(quantityInput);

    const reorderCell = document.createElement('td');
    reorderCell.className = 'cell-numeric';
    reorderCell.textContent = String(item.reorderPoint);

    const costCell = document.createElement('td');
    costCell.className = 'cell-numeric';
    costCell.textContent = money(item.unitCost);

    const restockCell = document.createElement('td');
    const restockBtn = document.createElement('button');
    restockBtn.type = 'button';
    restockBtn.className = 'btn-restock';
    restockBtn.textContent = 'Restock';
    restockBtn.addEventListener('click', () => {
      const target = item.reorderPoint * 2 + 10;
      item.quantity = target;
      quantityInput.value = String(target);
      renderTotal();
      renderRowState(row, item);
      showToast(`Restocked ${item.name} to ${target} units.`);
    });
    restockCell.appendChild(restockBtn);

    row.appendChild(nameCell);
    row.appendChild(supplierCell);
    row.appendChild(quantityCell);
    row.appendChild(reorderCell);
    row.appendChild(costCell);
    row.appendChild(restockCell);
    tbody.appendChild(row);
  }
}

function renderRowState(row, item) {
  const lowStock = item.quantity <= item.reorderPoint;
  row.classList.toggle('row-at-risk', lowStock);
  const nameWrap = row.querySelector('.item-name-wrap');
  let badge = nameWrap.querySelector('.badge-risk');
  if (lowStock && !badge) {
    badge = document.createElement('span');
    badge.className = 'badge badge-risk';
    badge.textContent = 'Needs restock';
    nameWrap.appendChild(badge);
  } else if (!lowStock && badge) {
    badge.remove();
  }
}

let toastTimer = null;
function showToast(message) {
  const toastEl = document.getElementById('toast');
  toastEl.textContent = message;
  toastEl.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, 3200);
}

function attachControls() {
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', (event) => {
    state.search = event.target.value;
    renderTable();
  });

  const supplierSelect = document.getElementById('supplier-filter');
  supplierSelect.addEventListener('change', (event) => {
    state.supplier = event.target.value;
    renderTable();
  });
}

function init() {
  renderFilterOptions();
  renderTotal();
  renderTable();
  attachControls();
  window.knowiReportReady = true;
}

init();
