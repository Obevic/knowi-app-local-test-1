window.knowiReportReady = false;

(function () {
  'use strict';

  var PAGE_SIZE = 50;
  var REORDER_BUFFER = 10;

  var items = [];
  var visibleCount = PAGE_SIZE;
  var searchQuery = '';
  var supplierFilter = 'All';
  var restockTimers = {};

  var searchInput = document.getElementById('searchInput');
  var filterSelect = document.getElementById('filterSelect');
  var totalValueEl = document.getElementById('totalValue');
  var tableBody = document.getElementById('tableBody');
  var rowCountEl = document.getElementById('rowCount');
  var showMoreBtn = document.getElementById('showMore');
  var navCountEl = document.getElementById('navCount');
  var reorderCountEl = document.getElementById('reorderCount');
  var stateBox = document.getElementById('stateBox');
  var stateText = document.getElementById('stateText');
  var viewerNameEl = document.getElementById('viewerName');
  var viewerEmailEl = document.getElementById('viewerEmail');

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function generateItems() {
    var rng = mulberry32(20261103);
    var suppliers = [
      'Northwind Traders',
      'Apex Components',
      'Blue Harbor Supply',
      'Cedar & Pine Co.',
      'Delta Logistics',
      'Evergreen Goods',
      'Falcon Industrial',
      'Granite Ridge',
      'Harbor Lane',
      'Ironwood Mfg.'
    ];
    var categories = [
      'Fasteners', 'Electrical', 'Packaging', 'Office', 'Safety',
      'Hardware', 'Adhesives', 'Tools', 'Cleaning', 'Labels'
    ];
    var adjectives = [
      'Standard', 'Heavy-Duty', 'Compact', 'Premium', 'Industrial',
      'Eco', 'Pro', 'Ultra', 'Basic', 'Reinforced'
    ];
    var nouns = [
      'Bolt', 'Screw', 'Bracket', 'Cable', 'Gasket', 'Washer',
      'Hinge', 'Strap', 'Seal', 'Clip', 'Bearing', 'Valve',
      'Gasket', 'Rivet', 'Pin', 'Sleeve', 'Grommet', 'Bushing',
      'Spacer', 'Anchor'
    ];
    var units = ['pcs', 'box', 'roll', 'set', 'pack', 'unit', 'meter', 'sheet'];

    var used = {};
    var list = [];
    var guard = 0;
    while (list.length < 120 && guard < 5000) {
      guard++;
      var cat = categories[Math.floor(rng() * categories.length)];
      var adj = adjectives[Math.floor(rng() * adjectives.length)];
      var noun = nouns[Math.floor(rng() * nouns.length)];
      var name = adj + ' ' + noun;
      if (used[name]) continue;
      used[name] = true;

      var reorderPoint = 10 + Math.floor(rng() * 90);
      var quantity = Math.floor(rng() * (reorderPoint * 3 + 40));
      var unitCost = Math.round((0.4 + rng() * 48) * 100) / 100;

      list.push({
        id: 'itm-' + (list.length + 1),
        name: name,
        category: cat,
        supplier: suppliers[Math.floor(rng() * suppliers.length)],
        quantity: quantity,
        reorderPoint: reorderPoint,
        unitCost: unitCost,
        unit: units[Math.floor(rng() * units.length)]
      });
    }
    return list;
  }

  function fmtMoney(n) {
    return '$' + Number(n).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function fmtInt(n) {
    return Number(n).toLocaleString('en-US');
  }

  function statusOf(item) {
    if (item.quantity <= item.reorderPoint) return 'at-risk';
    if (item.quantity <= item.reorderPoint * 1.5) return 'due-soon';
    return 'on-track';
  }

  function statusLabel(key) {
    if (key === 'at-risk') return 'At risk';
    if (key === 'due-soon') return 'Due soon';
    return 'On track';
  }

  function buildFilterOptions() {
    var seen = {};
    var opts = ['All'];
    for (var i = 0; i < items.length; i++) {
      var s = items[i].supplier;
      if (!seen[s]) {
        seen[s] = true;
        opts.push(s);
      }
    }
    opts.sort(function (a, b) {
      if (a === 'All') return -1;
      if (b === 'All') return 1;
      return a.localeCompare(b);
    });
    filterSelect.innerHTML = '';
    for (var j = 0; j < opts.length; j++) {
      var opt = document.createElement('option');
      opt.value = opts[j];
      opt.textContent = opts[j];
      filterSelect.appendChild(opt);
    }
    filterSelect.value = supplierFilter;
  }

  function getFiltered() {
    var q = searchQuery.trim().toLowerCase();
    return items.filter(function (it) {
      if (supplierFilter !== 'All' && it.supplier !== supplierFilter) return false;
      if (q && it.name.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function updateTotal() {
    var total = 0;
    for (var i = 0; i < items.length; i++) {
      total += items[i].quantity * items[i].unitCost;
    }
    totalValueEl.textContent = fmtMoney(total);
  }

  function updateCounts() {
    var reorder = 0;
    for (var i = 0; i < items.length; i++) {
      if (items[i].quantity <= items[i].reorderPoint) reorder++;
    }
    navCountEl.textContent = fmtInt(items.length);
    reorderCountEl.textContent = fmtInt(reorder);
  }

  function makeRow(item, index) {
    var tr = document.createElement('tr');
    tr.className = 'inv-row';
    tr.dataset.id = item.id;

    var tdItem = document.createElement('td');
    tdItem.className = 'cell-item';
    var nameEl = document.createElement('span');
    nameEl.className = 'item-name';
    nameEl.textContent = item.name;
    tdItem.appendChild(nameEl);
    var statusKey = statusOf(item);
    var badge = document.createElement('span');
    badge.className = 'status-badge status-' + statusKey;
    badge.textContent = statusLabel(statusKey);
    tdItem.appendChild(badge);

    var tdSup = document.createElement('td');
    tdSup.className = 'cell-supplier';
    tdSup.textContent = item.supplier;

    var tdQty = document.createElement('td');
    tdQty.className = 'cell-qty';
    var qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.min = '0';
    qtyInput.step = '1';
    qtyInput.className = 'qty-input';
    qtyInput.value = String(item.quantity);
    qtyInput.setAttribute('aria-label', 'Quantity for ' + item.name);
    qtyInput.addEventListener('input', function () {
      var v = parseInt(qtyInput.value, 10);
      if (isNaN(v) || v < 0) v = 0;
      item.quantity = v;
      updateTotal();
      updateRowStatus(tr, item);
      updateCounts();
    });
    tdQty.appendChild(qtyInput);

    var tdReorder = document.createElement('td');
    tdReorder.className = 'cell-reorder';
    tdReorder.textContent = fmtInt(item.reorderPoint);

    var tdCost = document.createElement('td');
    tdCost.className = 'cell-cost';
    tdCost.textContent = fmtMoney(item.unitCost);

    var tdRestock = document.createElement('td');
    tdRestock.className = 'cell-restock';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-restock';
    btn.textContent = 'Restock';
    btn.setAttribute('aria-label', 'Restock ' + item.name);
    btn.addEventListener('click', function () {
      doRestock(item, qtyInput, btn);
    });
    tdRestock.appendChild(btn);

    tr.appendChild(tdItem);
    tr.appendChild(tdSup);
    tr.appendChild(tdQty);
    tr.appendChild(tdReorder);
    tr.appendChild(tdCost);
    tr.appendChild(tdRestock);
    return tr;
  }

  function updateRowStatus(tr, item) {
    var badge = tr.querySelector('.status-badge');
    if (!badge) return;
    var key = statusOf(item);
    badge.className = 'status-badge status-' + key;
    badge.textContent = statusLabel(key);
  }

  function doRestock(item, qtyInput, btn) {
    item.quantity = item.reorderPoint + REORDER_BUFFER;
    qtyInput.value = String(item.quantity);
    updateTotal();
    updateRowStatus(btn.closest('tr'), item);
    updateCounts();

    btn.classList.add('is-restocked');
    btn.textContent = 'Restocked';
    btn.disabled = true;
    if (restockTimers[item.id]) clearTimeout(restockTimers[item.id]);
    restockTimers[item.id] = setTimeout(function () {
      btn.classList.remove('is-restocked');
      btn.textContent = 'Restock';
      btn.disabled = false;
      delete restockTimers[item.id];
    }, 1400);
  }

  function renderTable() {
    var filtered = getFiltered();
    var visible = filtered.slice(0, visibleCount);

    tableBody.innerHTML = '';
    var frag = document.createDocumentFragment();
    for (var i = 0; i < visible.length; i++) {
      frag.appendChild(makeRow(filtered[i], i));
    }
    tableBody.appendChild(frag);

    rowCountEl.textContent = fmtInt(filtered.length) + (filtered.length === 1 ? ' item' : ' items');

    if (filtered.length > visibleCount) {
      showMoreBtn.hidden = false;
      showMoreBtn.textContent = 'Show more (' + fmtInt(filtered.length - visibleCount) + ' remaining)';
    } else {
      showMoreBtn.hidden = true;
    }

    if (filtered.length === 0) {
      stateBox.hidden = false;
      stateText.textContent = 'No items match your search or filter. Try clearing the search or choosing a different supplier.';
    } else {
      stateBox.hidden = true;
    }
  }

  function render() {
    buildFilterOptions();
    updateTotal();
    updateCounts();
    renderTable();
  }

  function initViewer() {
    var name = 'Signed in';
    var email = '—';
    try {
      var res = fetch('api/viewer', { method: 'GET', headers: { 'Accept': 'application/json' } });
      res.then(function (r) {
        if (!r.ok) return null;
        return r.json();
      }).then(function (data) {
        if (data && data.name) {
          name = data.name;
          email = data.email || '—';
        }
        viewerNameEl.textContent = name;
        viewerEmailEl.textContent = email;
      }).catch(function () {
        viewerNameEl.textContent = name;
        viewerEmailEl.textContent = email;
      });
    } catch (e) {
      viewerNameEl.textContent = name;
      viewerEmailEl.textContent = email;
    }
  }

  function init() {
    items = generateItems();
    render();
    initViewer();

    searchInput.addEventListener('input', function () {
      searchQuery = searchInput.value;
      visibleCount = PAGE_SIZE;
      renderTable();
    });

    filterSelect.addEventListener('change', function () {
      supplierFilter = filterSelect.value;
      visibleCount = PAGE_SIZE;
      renderTable();
    });

    showMoreBtn.addEventListener('click', function () {
      visibleCount += PAGE_SIZE;
      renderTable();
    });

    window.knowiReportReady = true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();