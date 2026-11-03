window.knowiReportReady = false;

(function () {
  'use strict';

  var PAGE_SIZE = 50;

  var state = {
    items: [],
    search: '',
    supplier: 'all',
    page: 1,
    loading: true,
    error: null,
  };

  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function cacheEls() {
    els.searchInput = $('searchInput');
    els.filterSelect = $('filterSelect');
    els.totalValue = $('totalValue');
    els.tableBody = $('tableBody');
    els.tableState = $('tableState');
    els.countItems = document.querySelector('[data-count="items"]');
    els.countSuppliers = document.querySelector('[data-count="suppliers"]');
    els.countRisk = document.querySelector('[data-count="risk"]');
    els.viewer = document.querySelector('[data-viewer]');
  }

  function fmtMoney(n) {
    return '$' + Number(n).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function fmtInt(n) {
    return Number(n).toLocaleString('en-US');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getViewerName() {
    try {
      var h = document.cookie.split('; ').find(function (c) {
        return c.indexOf('knowi_user=') === 0;
      });
      if (h) {
        var raw = decodeURIComponent(h.slice('knowi_user='.length));
        var obj = JSON.parse(raw);
        if (obj && obj.name) return obj.name;
      }
    } catch (e) {
      /* ignore */
    }
    return 'Viewer';
  }

  function getFiltered() {
    var q = state.search.trim().toLowerCase();
    return state.items.filter(function (it) {
      if (state.supplier !== 'all' && it.supplier !== state.supplier) return false;
      if (q && it.name.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function buildFilterOptions() {
    var seen = {};
    var suppliers = [];
    state.items.forEach(function (it) {
      if (!seen[it.supplier]) {
        seen[it.supplier] = true;
        suppliers.push(it.supplier);
      }
    });
    suppliers.sort(function (a, b) {
      return a < b ? -1 : a > b ? 1 : 0;
    });

    var sel = els.filterSelect;
    while (sel.options.length > 1) sel.remove(1);
    suppliers.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      sel.appendChild(opt);
    });
    sel.value = state.supplier;
  }

  function updateCounts() {
    var risk = 0;
    state.items.forEach(function (it) {
      if (it.quantity <= it.reorderPoint) risk++;
    });
    if (els.countItems) els.countItems.textContent = fmtInt(state.items.length);
    if (els.countSuppliers) els.countSuppliers.textContent = fmtInt(els.filterSelect.options.length - 1);
    if (els.countRisk) els.countRisk.textContent = fmtInt(risk);
  }

  function updateSummary() {
    var total = 0;
    getFiltered().forEach(function (it) {
      total += it.quantity * it.unitCost;
    });
    els.totalValue.textContent = fmtMoney(total);
  }

  function renderTable() {
    var filtered = getFiltered();
    var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;
    if (state.page < 1) state.page = 1;

    var start = (state.page - 1) * PAGE_SIZE;
    var end = Math.min(start + PAGE_SIZE, filtered.length);
    var slice = filtered.slice(start, end);

    var html = '';
    slice.forEach(function (it) {
      var atRisk = it.quantity <= it.reorderPoint;
      var rowClass = atRisk ? 'row-risk' : '';
      html +=
        '<tr class="' + rowClass + '" data-id="' + it.id + '">' +
          '<td class="cell-item">' + escapeHtml(it.name) + '</td>' +
          '<td class="cell-supplier">' + escapeHtml(it.supplier) + '</td>' +
          '<td class="cell-qty">' +
            '<input type="number" class="qty-input" min="0" step="1" value="' + it.quantity + '" ' +
              'aria-label="Quantity for ' + escapeHtml(it.name) + '" data-id="' + it.id + '" />' +
          '</td>' +
          '<td class="cell-reorder">' + fmtInt(it.reorderPoint) + '</td>' +
          '<td class="cell-cost">' + fmtMoney(it.unitCost) + '</td>' +
          '<td class="cell-restock">' +
            '<button type="button" class="btn-restock" data-id="' + it.id + '" ' +
              'aria-label="Restock ' + escapeHtml(it.name) + '">Restock</button>' +
          '</td>' +
        '</tr>';
    });

    if (filtered.length === 0) {
      els.tableBody.innerHTML = '';
      els.tableState.hidden = false;
      els.tableState.className = 'table-state state-empty';
      els.tableState.innerHTML =
        '<span class="state-icon" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" focusable="false">' +
            '<circle cx="11" cy="11" r="6" fill="none" stroke="#56666D" stroke-width="1.8"></circle>' +
            '<path d="M15.5 15.5L20 20" fill="none" stroke="#56666D" stroke-width="1.8" stroke-linecap="round"></path>' +
          '</svg>' +
        '</span>' +
        '<span class="state-text">No items match your search or filter.</span>';
    } else {
      els.tableBody.innerHTML = html;
      els.tableState.hidden = true;
      els.tableState.className = 'table-state';
      els.tableState.innerHTML = '';
    }

    updateSummary();
  }

  function renderSkeleton() {
    var html = '';
    for (var i = 0; i < 8; i++) {
      html +=
        '<tr class="row-skeleton">' +
          '<td><span class="skel skel-item"></span></td>' +
          '<td><span class="skel skel-supplier"></span></td>' +
          '<td><span class="skel skel-qty"></span></td>' +
          '<td><span class="skel skel-reorder"></span></td>' +
          '<td><span class="skel skel-cost"></span></td>' +
          '<td><span class="skel skel-btn"></span></td>' +
        '</tr>';
    }
    els.tableBody.innerHTML = html;
    els.tableState.hidden = true;
  }

  function showError(msg) {
    els.tableBody.innerHTML = '';
    els.tableState.hidden = false;
    els.tableState.className = 'table-state state-error';
    els.tableState.innerHTML =
      '<span class="state-icon" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" focusable="false">' +
          '<circle cx="12" cy="12" r="9" fill="none" stroke="#9C2F3C" stroke-width="1.8"></circle>' +
          '<path d="M12 7v6M12 16v.5" fill="none" stroke="#9C2F3C" stroke-width="1.8" stroke-linecap="round"></path>' +
        '</svg>' +
      '</span>' +
      '<span class="state-text">' + escapeHtml(msg) + '</span>';
  }

  function loadItems() {
    state.loading = true;
    state.error = null;
    renderSkeleton();
    fetch('api/items', { headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        state.items = (data && data.items) || [];
        state.loading = false;
        buildFilterOptions();
        updateCounts();
        renderTable();
        window.knowiReportReady = true;
      })
      .catch(function (err) {
        state.loading = false;
        state.error = err.message || 'Failed to load inventory.';
        showError(state.error);
        window.knowiReportReady = true;
      });
  }

  function onSearchInput() {
    state.search = els.searchInput.value;
    state.page = 1;
    renderTable();
  }

  function onFilterChange() {
    state.supplier = els.filterSelect.value;
    state.page = 1;
    renderTable();
  }

  function onQtyChange(e) {
    var input = e.target;
    if (!input.classList.contains('qty-input')) return;
    var id = Number(input.getAttribute('data-id'));
    var val = parseInt(input.value, 10);
    if (isNaN(val) || val < 0) val = 0;
    var item = state.items.find(function (it) { return it.id === id; });
    if (!item) return;
    item.quantity = val;
    var row = input.closest('tr');
    if (row) {
      row.classList.toggle('row-risk', val <= item.reorderPoint);
    }
    updateSummary();
    updateCounts();
  }

  function onRestock(e) {
    var btn = e.target.closest('.btn-restock');
    if (!btn) return;
    var id = Number(btn.getAttribute('data-id'));
    var item = state.items.find(function (it) { return it.id === id; });
    if (!item) return;
    var newQty = item.reorderPoint * 2;
    item.quantity = newQty;

    var row = btn.closest('tr');
    if (row) {
      row.classList.remove('row-risk');
      var input = row.querySelector('.qty-input');
      if (input) input.value = newQty;
    }
    updateSummary();
    updateCounts();
  }

  function bindEvents() {
    els.searchInput.addEventListener('input', onSearchInput);
    els.filterSelect.addEventListener('change', onFilterChange);
    els.tableBody.addEventListener('change', onQtyChange);
    els.tableBody.addEventListener('click', onRestock);
  }

  function init() {
    cacheEls();
    if (els.viewer) els.viewer.textContent = getViewerName();
    bindEvents();
    loadItems();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();