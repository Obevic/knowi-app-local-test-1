window.knowiReportReady = false;

(function () {
  'use strict';

  var PAGE_SIZE = 50;
  var RESTOCK_BUFFER = 5;

  var allItems = [];
  var visibleCount = PAGE_SIZE;
  var searchValue = '';
  var filterValue = 'All';

  var searchInput = document.getElementById('searchInput');
  var filterSelect = document.getElementById('filterSelect');
  var totalValueEl = document.getElementById('totalValue');
  var itemsBody = document.getElementById('itemsBody');
  var showMoreBtn = document.getElementById('showMoreBtn');

  function formatCurrency(value) {
    return '$' + Number(value).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function getFilteredItems() {
    var q = searchValue.trim().toLowerCase();
    return allItems.filter(function (item) {
      var matchesSearch = !q || item.name.toLowerCase().indexOf(q) !== -1;
      var matchesFilter = filterValue === 'All' || item.supplier === filterValue;
      return matchesSearch && matchesFilter;
    });
  }

  function updateTotal() {
    var total = 0;
    for (var i = 0; i < allItems.length; i++) {
      total += allItems[i].quantity * allItems[i].unitCost;
    }
    totalValueEl.textContent = formatCurrency(total);
  }

  function buildFilterOptions() {
    var seen = {};
    var suppliers = [];
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

  function renderRows() {
    var filtered = getFilteredItems();
    var visible = filtered.slice(0, visibleCount);

    itemsBody.innerHTML = '';

    if (filtered.length === 0) {
      var emptyRow = document.createElement('tr');
      emptyRow.className = 'state-row';
      var emptyCell = document.createElement('td');
      emptyCell.colSpan = 6;
      emptyCell.className = 'state-cell';
      emptyCell.textContent = 'No items match your search or filter.';
      emptyRow.appendChild(emptyCell);
      itemsBody.appendChild(emptyRow);
      showMoreBtn.hidden = true;
      return;
    }

    for (var i = 0; i < visible.length; i++) {
      (function (item, index) {
        var row = document.createElement('tr');
        row.className = 'item-row';

        var nameCell = document.createElement('td');
        nameCell.className = 'cell-item';
        nameCell.textContent = item.name;
        row.appendChild(nameCell);

        var supplierCell = document.createElement('td');
        supplierCell.className = 'cell-supplier';
        supplierCell.textContent = item.supplier;
        row.appendChild(supplierCell);

        var qtyCell = document.createElement('td');
        qtyCell.className = 'cell-qty';
        var qtyInput = document.createElement('input');
        qtyInput.type = 'number';
        qtyInput.min = '0';
        qtyInput.step = '1';
        qtyInput.value = String(item.quantity);
        qtyInput.className = 'qty-input';
        qtyInput.setAttribute('aria-label', 'Quantity for ' + item.name);
        qtyInput.addEventListener('input', function () {
          var v = parseInt(this.value, 10);
          item.quantity = isNaN(v) || v < 0 ? 0 : v;
          updateTotal();
        });
        qtyCell.appendChild(qtyInput);
        row.appendChild(qtyCell);

        var reorderCell = document.createElement('td');
        reorderCell.className = 'cell-reorder';
        reorderCell.textContent = String(item.reorderPoint);
        row.appendChild(reorderCell);

        var costCell = document.createElement('td');
        costCell.className = 'cell-cost';
        costCell.textContent = formatCurrency(item.unitCost);
        row.appendChild(costCell);

        var restockCell = document.createElement('td');
        restockCell.className = 'cell-restock';
        var restockBtn = document.createElement('button');
        restockBtn.type = 'button';
        restockBtn.className = 'restock-btn';
        restockBtn.textContent = 'Restock';
        restockBtn.setAttribute('aria-label', 'Restock ' + item.name);
        restockBtn.addEventListener('click', function () {
          item.quantity = item.reorderPoint + RESTOCK_BUFFER;
          qtyInput.value = String(item.quantity);
          updateTotal();
        });
        restockCell.appendChild(restockBtn);
        row.appendChild(restockCell);

        itemsBody.appendChild(row);
      })(visible[i], i);
    }

    showMoreBtn.hidden = filtered.length <= visibleCount;
  }

  function loadItems() {
    fetch('api/items')
      .then(function (res) {
        if (!res.ok) {
          throw new Error('Failed to load inventory');
        }
        return res.json();
      })
      .then(function (data) {
        allItems = data.items || [];
        buildFilterOptions();
        updateTotal();
        renderRows();
        window.knowiReportReady = true;
      })
      .catch(function (err) {
        itemsBody.innerHTML = '';
        var row = document.createElement('tr');
        row.className = 'state-row';
        var cell = document.createElement('td');
        cell.colSpan = 6;
        cell.className = 'state-cell';
        cell.textContent = 'Could not load inventory. Please try again later.';
        row.appendChild(cell);
        itemsBody.appendChild(row);
        showMoreBtn.hidden = true;
        window.knowiReportReady = true;
      });
  }

  searchInput.addEventListener('input', function () {
    searchValue = this.value;
    visibleCount = PAGE_SIZE;
    renderRows();
  });

  filterSelect.addEventListener('change', function () {
    filterValue = this.value;
    visibleCount = PAGE_SIZE;
    renderRows();
  });

  showMoreBtn.addEventListener('click', function () {
    visibleCount += PAGE_SIZE;
    renderRows();
  });

  loadItems();
})();