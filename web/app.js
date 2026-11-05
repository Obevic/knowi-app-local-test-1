window.knowiReportReady = false;

(function () {
  'use strict';

  var body = document.getElementById('rentalBody');
  var searchInput = document.getElementById('search');
  var statusFilter = document.getElementById('statusFilter');
  var overdueCount = document.getElementById('overdueCount');
  var overdueBadge = document.getElementById('overdueBadge');
  var navCount = document.getElementById('navCount');
  var tableEmpty = document.getElementById('tableEmpty');
  var skeleton = document.getElementById('loadingSkeleton');
  var viewerName = document.getElementById('viewerName');

  var allRentals = [];
  var filtered = [];
  var searchTerm = '';
  var statusValue = '';

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function statusClass(status) {
    if (status === 'Overdue') return 'pill pill-overdue';
    if (status === 'Returned') return 'pill pill-returned';
    return 'pill pill-active';
  }

  function applyFilters() {
    var term = searchTerm.trim().toLowerCase();
    filtered = allRentals.filter(function (r) {
      if (statusValue && r.status !== statusValue) return false;
      if (term) {
        var hay = (r.item + ' ' + r.customer).toLowerCase();
        if (hay.indexOf(term) === -1) return false;
      }
      return true;
    });
  }

  function render() {
    applyFilters();

    var overdue = 0;
    for (var i = 0; i < allRentals.length; i++) {
      if (allRentals[i].status === 'Overdue') overdue++;
    }
    overdueCount.textContent = String(overdue);
    overdueBadge.classList.toggle('is-zero', overdue === 0);
    navCount.textContent = String(allRentals.length);

    if (filtered.length === 0) {
      body.innerHTML = '';
      tableEmpty.hidden = false;
    } else {
      tableEmpty.hidden = true;
      var html = '';
      for (var j = 0; j < filtered.length; j++) {
        var r = filtered[j];
        html +=
          '<tr>' +
          '<td class="cell-item">' + escapeHtml(r.item) + '</td>' +
          '<td class="cell-customer">' + escapeHtml(r.customer) + '</td>' +
          '<td class="cell-date">' + fmtDate(r.start) + '</td>' +
          '<td class="cell-date">' + fmtDate(r.due) + '</td>' +
          '<td class="cell-status"><span class="' + statusClass(r.status) + '">' + escapeHtml(r.status) + '</span></td>' +
          '</tr>';
      }
      body.innerHTML = html;
    }
  }

  function buildStatusOptions() {
    var seen = {};
    var order = [];
    for (var i = 0; i < allRentals.length; i++) {
      var s = allRentals[i].status;
      if (!seen[s]) {
        seen[s] = true;
        order.push(s);
      }
    }
    var html = '<option value="">All statuses</option>';
    for (var j = 0; j < order.length; j++) {
      html += '<option value="' + escapeHtml(order[j]) + '">' + escapeHtml(order[j]) + '</option>';
    }
    statusFilter.innerHTML = html;
  }

  function showSkeleton() {
    if (skeleton) skeleton.hidden = false;
  }

  function hideSkeleton() {
    if (skeleton) skeleton.hidden = true;
  }

  function load() {
    showSkeleton();
    fetch('api/rentals', { headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (res.status === 401) {
          hideSkeleton();
          window.knowiReportReady = true;
          return;
        }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        hideSkeleton();
        if (!data || !Array.isArray(data.rentals)) {
          allRentals = [];
        } else {
          allRentals = data.rentals;
        }
        buildStatusOptions();
        render();
        window.knowiReportReady = true;
      })
      .catch(function () {
        hideSkeleton();
        allRentals = [];
        buildStatusOptions();
        render();
        window.knowiReportReady = true;
      });
  }

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      searchTerm = searchInput.value;
      render();
    });
  }

  if (statusFilter) {
    statusFilter.addEventListener('change', function () {
      statusValue = statusFilter.value;
      render();
    });
  }

  if (viewerName) {
    var u = window.__knowiUser;
    if (u && u.name) viewerName.textContent = u.name;
  }

  load();
})();