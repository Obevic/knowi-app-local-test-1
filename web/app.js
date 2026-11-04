window.knowiReportReady = false;

(function () {
  'use strict';

  var allItems = [];
  var PAGE_SIZE = 50;
  var currentPage = 1;

  var searchInput = document.getElementById('search-input');
  var filterSelect = document.getElementById('filter-select');
  var totalValue = document.getElementById('total-value');
  var itemsBody = document.getElementById('items-body');
  var itemsTable = document.getElementById('items-table');
  var tableWrap = document.querySelector('.table-wrap');
  var loadingState = document.getElementById('loading-state');
  var emptyState = document.getElementById('empty-state');
  var errorState = document.getElementById('error-state');
  var retryBtn = document.getElementById('retry-btn');
  var showMoreBtn = null;

  function formatCurrency(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildFilterOptions() {
    var suppliers = [];
    var seen = {};
    for (var i = 0; i < allItems.length; i++) {
      var s = allItems[i].supplier;
      if (!seen[s]) {
        seen[s] = true;
        suppliers.push(s);
      }
    }
    suppliers.sort(function (a, b) {
      return a < b ? -1 : a > b ? 1 : 0;
    });

    filterSelect.innerHTML = '';
    var allOpt = document.createElement('option');
    allOpt.value = 'All';
    allOpt.textContent = 'All';
    filterSelect.appendChild(allOpt);

    for (var j = 0; j < suppliers.length; j++) {
      var opt = document.createElement('option');
      opt.value = suppliers[j];
      opt.textContent = suppliers[j];
      filterSelect.appendChild(opt);
    }
  }

  function getFilteredItems() {
    var term = (searchInput.value || '').trim().toLowerCase();
    var filter = filterSelect.value || 'All';

    return allItems.filter(function (it) {
      if (filter !== 'All' && it.supplier !== filter) return false;
      if (term && it.item.toLowerCase().indexOf(term) === -1) return false;
      return true;
    });
  }

  function computeTotal() {
    var total = 0;
    for (var i = 0; i < allItems.length; i++) {
      total += allItems[i].quantity * allItems[i].unitCost;
    }
    return total;
  }

  function updateTotal() {
    totalValue.textContent = formatCurrency(computeTotal());
  }

  function showLoading() {
    loadingState.hidden = false;
    emptyState.hidden = true;
    errorState.hidden = true;
    if (tableWrap) tableWrap.hidden = true;
    if (showMoreBtn) showMoreBtn.hidden = true;
  }

  function showError() {
    loadingState.hidden = true;
    emptyState.hidden = true;
    errorState.hidden = false;
    if (tableWrap) tableWrap.hidden = true;
    if (showMoreBtn) showMoreBtn.hidden = true;
  }

  function renderRows(filtered) {
    itemsBody.innerHTML = '';
    var end = Math.min(currentPage * PAGE_SIZE, filtered.length);
    for (var i = 0; i < end; i++) {
      itemsBody.appendChild(buildRow(filtered[i]));
    }
  }

  function buildRow(it) {
    var tr = document.createElement('tr');
    tr.dataset.id = it.id;

    var tdItem = document.createElement('td');
    tdItem.className = 'cell-item';
    tdItem.textContent = it.item;

    var tdSupplier = document.createElement('td');
    tdSupplier.className = 'cell-supplier';
    tdSupplier.textContent = it.supplier;

    var tdQty = document.createElement('td');
    tdQty.className = 'cell-qty';
    var qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.min = '0';
    qtyInput.step = '1';
    qtyInput.value = it.quantity;
    qtyInput.className = 'qty-input';
    qtyInput.setAttribute('aria-label', 'Quantity for ' + it.item);
    qtyInput.addEventListener('change', function () {
      var v = parseInt(qtyInput.value, 10);
      if (isNaN(v) || v < 0) {
        qtyInput.value = it.quantity;
        return;
      }
      qtyInput.disabled = true;
      fetch('api/items/' + it.id + '/quantity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: v })
      })
        .then(function (r) {
          if (!r.ok) throw new Error('bad status');
          return r.json();
        })
        .then(function (data) {
          it.quantity = data.quantity;
          qtyInput.value = data.quantity;
          updateTotal();
        })
        .catch(function () {
          qtyInput.value = it.quantity;
        })
        .finally(function () {
          qtyInput.disabled = false;
        });
    });
    tdQty.appendChild(qtyInput);

    var tdReorder = document.createElement('td');
    tdReorder.className = 'cell-reorder';
    tdReorder.textContent = it.reorderPoint;

    var tdCost = document.createElement('td');
    tdCost.className = 'cell-cost';
    tdCost.textContent = formatCurrency(it.unitCost);

    var tdRestock = document.createElement('td');
    tdRestock.className = 'cell-restock';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-restock';
    btn.textContent = 'Restock';
    btn.setAttribute('aria-label', 'Restock ' + it.item);
    btn.addEventListener('click', function () {
      btn.disabled = true;
      fetch('api/items/' + it.id + '/restock', { method: 'POST' })
        .then(function (r) {
          if (!r.ok) throw new Error('bad status');
          return r.json();
        })
        .then(function (data) {
          it.quantity = data.quantity;
          qtyInput.value = data.quantity;
          updateTotal();
        })
        .catch(function () {})
        .finally(function () {
          btn.disabled = false;
        });
    });
    tdRestock.appendChild(btn);

    tr.appendChild(tdItem);
    tr.appendChild(tdSupplier);
    tr.appendChild(tdQty);
    tr.appendChild(tdReorder);
    tr.appendChild(tdCost);
    tr.appendChild(tdRestock);
    return tr;
  }

  function renderShowMore(filtered) {
    if (showMoreBtn) {
      showMoreBtn.remove();
      showMoreBtn = null;
    }
    var shown = Math.min(currentPage * PAGE_SIZE, filtered.length);
    if (shown < filtered.length) {
      showMoreBtn = document.createElement('button');
      showMoreBtn.type = 'button';
      showMoreBtn.className = 'btn btn-show-more';
      showMoreBtn.textContent = 'Show more';
      showMoreBtn.addEventListener('click', function () {
        currentPage += 1;
        renderRows(filtered);
        renderShowMore(filtered);
      });
      itemsTable.parentNode.appendChild(showMoreBtn);
    }
  }

  function render() {
    var filtered = getFilteredItems();
    currentPage = 1;
    updateTotal();

    if (filtered.length === 0) {
      if (tableWrap) tableWrap.hidden = true;
      emptyState.hidden = false;
      return;
    }

    emptyState.hidden = true;
    if (tableWrap) tableWrap.hidden = false;
    renderRows(filtered);
    renderShowMore(filtered);
  }

  function loadItems() {
    showLoading();
    fetch('api/items')
      .then(function (r) {
        if (!r.ok) throw new Error('bad status');
        return r.json();
      })
      .then(function (data) {
        allItems = data.items || [];
        buildFilterOptions();
        render();
        loadingState.hidden = true;
        window.knowiReportReady = true;
      })
      .catch(function () {
        showError();
        window.knowiReportReady = true;
      });
  }

  searchInput.addEventListener('input', render);
  filterSelect.addEventListener('change', render);
  retryBtn.addEventListener('click', loadItems);

  loadItems();
})();