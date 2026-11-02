window.knowiReportReady = false;

(function () {
  'use strict';

  var items = [
    { id: 1, name: 'A4 Copy Paper', supplier: 'Bright Paper Co.', qty: 120, reorder: 40, unitCost: 4.25 },
    { id: 2, name: 'Ballpoint Pens (Blue)', supplier: 'Inkwell Supply', qty: 8, reorder: 25, unitCost: 0.85 },
    { id: 3, name: 'Sticky Notes 3x3', supplier: 'Inkwell Supply', qty: 64, reorder: 30, unitCost: 2.10 },
    { id: 4, name: 'Toner Cartridge 26X', supplier: 'Bright Paper Co.', qty: 3, reorder: 6, unitCost: 89.00 },
    { id: 5, name: 'USB-C Cable 2m', supplier: 'Circuit Works', qty: 45, reorder: 20, unitCost: 11.50 },
    { id: 6, name: 'Wireless Mouse', supplier: 'Circuit Works', qty: 12, reorder: 10, unitCost: 24.99 },
    { id: 7, name: 'Ergonomic Chair', supplier: 'Forma Office', qty: 5, reorder: 4, unitCost: 320.00 },
    { id: 8, name: 'Standing Desk Mat', supplier: 'Forma Office', qty: 18, reorder: 8, unitCost: 34.00 },
    { id: 9, name: 'Whiteboard Markers', supplier: 'Inkwell Supply', qty: 2, reorder: 12, unitCost: 1.40 },
    { id: 10, name: 'HDMI Adapter', supplier: 'Circuit Works', qty: 30, reorder: 15, unitCost: 18.75 },
    { id: 11, name: 'Desk Lamp LED', supplier: 'Forma Office', qty: 9, reorder: 6, unitCost: 42.00 },
    { id: 12, name: 'Cable Ties (100pk)', supplier: 'Circuit Works', qty: 55, reorder: 20, unitCost: 6.30 },
    { id: 13, name: 'Letter Envelopes', supplier: 'Bright Paper Co.', qty: 200, reorder: 100, unitCost: 0.12 },
    { id: 14, name: 'Monitor Stand', supplier: 'Forma Office', qty: 7, reorder: 5, unitCost: 55.00 }
  ];

  var searchInput = document.getElementById('searchInput');
  var filterSelect = document.getElementById('filterSelect');
  var totalValue = document.getElementById('totalValue');
  var tableBody = document.getElementById('tableBody');
  var tableEmpty = document.getElementById('tableEmpty');
  var navCount = document.getElementById('navCount');
  var supplierCount = document.getElementById('supplierCount');

  function fmt(n) {
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function buildFilter() {
    var suppliers = [];
    var seen = {};
    items.forEach(function (it) {
      if (!seen[it.supplier]) {
        seen[it.supplier] = true;
        suppliers.push(it.supplier);
      }
    });
    suppliers.sort();
    filterSelect.innerHTML = '';
    var all = document.createElement('option');
    all.value = '';
    all.textContent = 'All suppliers';
    filterSelect.appendChild(all);
    suppliers.forEach(function (s) {
      var o = document.createElement('option');
      o.value = s;
      o.textContent = s;
      filterSelect.appendChild(o);
    });
    supplierCount.textContent = String(suppliers.length);
  }

  function render() {
    var q = (searchInput.value || '').trim().toLowerCase();
    var sup = filterSelect.value;

    var filtered = items.filter(function (it) {
      var okName = !q || it.name.toLowerCase().indexOf(q) !== -1;
      var okSup = !sup || it.supplier === sup;
      return okName && okSup;
    });

    var total = 0;
    filtered.forEach(function (it) {
      total += it.qty * it.unitCost;
    });
    totalValue.textContent = fmt(total);

    tableBody.innerHTML = '';
    if (filtered.length === 0) {
      tableEmpty.hidden = false;
      return;
    }
    tableEmpty.hidden = true;

    filtered.forEach(function (it) {
      var low = it.qty <= it.reorder;
      var tr = document.createElement('tr');
      if (low) tr.className = 'row-low';

      var tdItem = document.createElement('td');
      tdItem.className = 'cell-item';
      tdItem.textContent = it.name;

      var tdSup = document.createElement('td');
      tdSup.textContent = it.supplier;

      var tdQty = document.createElement('td');
      var qtyInput = document.createElement('input');
      qtyInput.type = 'number';
      qtyInput.className = 'qtyInput';
      qtyInput.setAttribute('data-id', String(it.id));
      qtyInput.value = String(it.qty);
      qtyInput.min = '0';
      qtyInput.step = '1';
      qtyInput.setAttribute('aria-label', 'Quantity for ' + it.name);
      tdQty.appendChild(qtyInput);

      var tdReorder = document.createElement('td');
      tdReorder.textContent = String(it.reorder);

      var tdCost = document.createElement('td');
      tdCost.textContent = fmt(it.unitCost);

      var tdRestock = document.createElement('td');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'restockBtn';
      btn.setAttribute('data-id', String(it.id));
      btn.textContent = 'Restock';
      btn.setAttribute('aria-label', 'Restock ' + it.name);
      tdRestock.appendChild(btn);

      tr.appendChild(tdItem);
      tr.appendChild(tdSup);
      tr.appendChild(tdQty);
      tr.appendChild(tdReorder);
      tr.appendChild(tdCost);
      tr.appendChild(tdRestock);
      tableBody.appendChild(tr);
    });
  }

  function updateTotal() {
    var q = (searchInput.value || '').trim().toLowerCase();
    var sup = filterSelect.value;
    var total = 0;
    items.forEach(function (it) {
      var okName = !q || it.name.toLowerCase().indexOf(q) !== -1;
      var okSup = !sup || it.supplier === sup;
      if (okName && okSup) total += it.qty * it.unitCost;
    });
    totalValue.textContent = fmt(total);
  }

  function onQtyChange(e) {
    var id = Number(e.target.getAttribute('data-id'));
    var val = Number(e.target.value);
    if (isNaN(val) || val < 0) val = 0;
    var it = items.find(function (x) { return x.id === id; });
    if (!it) return;
    it.qty = val;
    updateTotal();
    var tr = e.target.closest('tr');
    if (tr) {
      if (val <= it.reorder) tr.classList.add('row-low');
      else tr.classList.remove('row-low');
    }
  }

  function onRestock(e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    var id = Number(btn.getAttribute('data-id'));
    var it = items.find(function (x) { return x.id === id; });
    if (!it) return;
    it.qty = it.reorder * 2;
    render();
  }

  function init() {
    buildFilter();
    navCount.textContent = String(items.length);
    render();

    searchInput.addEventListener('input', render);
    filterSelect.addEventListener('change', render);
    tableBody.addEventListener('input', onQtyChange);
    tableBody.addEventListener('click', onRestock);

    window.knowiReportReady = true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();