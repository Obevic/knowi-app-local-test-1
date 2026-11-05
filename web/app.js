window.knowiReportReady = false;

(function () {
  'use strict';

  var body = document.getElementById('rentalsBody');
  var searchInput = document.getElementById('searchInput');
  var statusSelect = document.getElementById('statusSelect');
  var overdueCountEl = document.getElementById('overdueCount');
  var navCountEl = document.getElementById('navCount');
  var loadingState = document.getElementById('loadingState');
  var emptyState = document.getElementById('emptyState');
  var errorState = document.getElementById('errorState');
  var retryBtn = document.getElementById('retryBtn');

  var allRentals = [];
  var statusOptions = [];
  var searchTimer = null;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var day = d.getDate();
    var month = months[d.getMonth()];
    var year = d.getFullYear();
    return month + ' ' + day + ', ' + year;
  }

  function statusClass(status) {
    if (status === 'Returned') return 'pill pill-returned';
    if (status === 'Overdue') return 'pill pill-overdue';
    return 'pill pill-active';
  }

  function buildStatusOptions() {
    var seen = {};
    var list = [];
    for (var i = 0; i < allRentals.length; i++) {
      var s = allRentals[i].status;
      if (!seen[s]) {
        seen[s] = true;
        list.push(s);
      }
    }
    list.sort(function (a, b) { return a.localeCompare(b); });
    statusOptions = list;

    var current = statusSelect.value;
    statusSelect.innerHTML = '';
    var allOpt = document.createElement('option');
    allOpt.value = 'All';
    allOpt.textContent = 'All';
    statusSelect.appendChild(allOpt);
    for (var j = 0; j < list.length; j++) {
      var opt = document.createElement('option');
      opt.value = list[j];
      opt.textContent = list[j];
      statusSelect.appendChild(opt);
    }
    if (current && list.indexOf(current) !== -1) {
      statusSelect.value = current;
    } else {
      statusSelect.value = 'All';
    }
  }

  function updateCounts() {
    var overdue = 0;
    for (var i = 0; i < allRentals.length; i++) {
      if (allRentals[i].status === 'Overdue') overdue++;
    }
    overdueCountEl.textContent = String(overdue);
    navCountEl.textContent = String(allRentals.length);
  }

  function getFiltered() {
    var term = (searchInput.value || '').trim().toLowerCase();
    var status = statusSelect.value;
    var out = [];
    for (var i = 0; i < allRentals.length; i++) {
      var r = allRentals[i];
      if (status !== 'All' && r.status !== status) continue;
      if (term) {
        var hay = (r.item + ' ' + r.customer).toLowerCase();
        if (hay.indexOf(term) === -1) continue;
      }
      out.push(r);
    }
    return out;
  }

  function renderRows(rows) {
    if (!rows.length) {
      body.innerHTML = '';
      loadingState.hidden = true;
      errorState.hidden = true;
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      html +=
        '<tr>' +
          '<td class="cell-item">' + escapeHtml(r.item) + '</td>' +
          '<td class="cell-customer">' + escapeHtml(r.customer) + '</td>' +
          '<td class="cell-date">' + formatDate(r.start) + '</td>' +
          '<td class="cell-date">' + formatDate(r.due) + '</td>' +
          '<td class="cell-status"><span class="' + statusClass(r.status) + '">' + escapeHtml(r.status) + '</span></td>' +
        '</tr>';
    }
    body.innerHTML = html;
  }

  function render() {
    var rows = getFiltered();
    renderRows(rows);
  }

  function showError() {
    loadingState.hidden = true;
    emptyState.hidden = true;
    errorState.hidden = false;
  }

  function load() {
    loadingState.hidden = false;
    emptyState.hidden = true;
    errorState.hidden = true;
    body.innerHTML = '';

    fetch('api/rentals', { headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        allRentals = (data && data.rentals) ? data.rentals : [];
        buildStatusOptions();
        updateCounts();
        loadingState.hidden = true;
        render();
        window.knowiReportReady = true;
      })
      .catch(function () {
        showError();
        window.knowiReportReady = true;
      });
  }

  function onSearchInput() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 120);
  }

  if (searchInput) searchInput.addEventListener('input', onSearchInput);
  if (statusSelect) statusSelect.addEventListener('change', render);
  if (retryBtn) retryBtn.addEventListener('click', load);

  load();
})();