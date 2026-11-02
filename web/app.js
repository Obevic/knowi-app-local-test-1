window.knowiReportReady = false;

(function () {
  'use strict';

  var COLUMNS = [
    'AE_Name',
    'Amount',
    'Company',
    'Created_Date',
    'Opportunity_ID',
    'Probability',
    'Product',
    'Region',
    'SDR_Name',
    'Stage'
  ];

  var FILTER_FIELDS = ['Stage', 'Region', 'Product', 'AE_Name', 'SDR_Name', 'Company'];

  var state = {
    columns: [],
    rows: [],
    filtered: [],
    filterValues: {},
    page: 1,
    pageSize: 50,
    loading: false,
    loaded: false
  };

  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function cacheEls() {
    els.app = $('app');
    els.sidebar = $('sidebar');
    els.navCount = $('nav-count');
    els.viewerName = $('viewer-name');
    els.summary = $('summary');
    els.statCount = $('stat-count');
    els.statTotal = $('stat-total');
    els.statAvgAmount = $('stat-avg-amount');
    els.statAvgProb = $('stat-avg-prob');
    els.filters = $('filters');
    els.clearFilters = $('clear-filters');
    els.tableWrap = $('table-wrap');
    els.ledger = $('ledger');
    els.ledgerBody = $('ledger-body');
    els.pager = $('pager');
    els.pageSize = $('page-size');
    els.prevPage = $('prev-page');
    els.nextPage = $('next-page');
    els.showing = $('showing');
    els.loading = $('loading');
    els.empty = $('empty');
    els.error = $('error');
    els.sessionExpired = $('session-expired');
    els.loginLink = $('login-link');
  }

  function filterSelects() {
    return Array.prototype.slice.call(document.querySelectorAll('.filter-select[data-field]'));
  }

  function setStates() {
    var showLoading = state.loading;
    var showSession = els.sessionExpired && !els.sessionExpired.hidden;
    var showEmpty = !state.loading && !showSession && state.loaded && state.filtered.length === 0;
    var showData = !state.loading && !showSession && state.loaded && state.filtered.length > 0;

    els.loading.hidden = !showLoading;
    els.sessionExpired.hidden = !showSession;
    els.empty.hidden = !showEmpty;
    els.error.hidden = !(state.error && !showLoading && !showSession);

    var showContent = showData || showEmpty;
    els.summary.hidden = !showContent;
    els.filters.hidden = !showContent;
    els.tableWrap.hidden = !showData;
    els.pager.hidden = !showData;
  }

  function fmtInt(n) {
    return Math.round(n).toLocaleString('en-US');
  }

  function fmtMoney(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function fmtDate(v) {
    if (v === null || v === undefined || v === '') return '—';
    var d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }

  function stageClass(stage) {
    var s = String(stage || '').toLowerCase();
    if (s.indexOf('won') !== -1 || s.indexOf('closed') !== -1 || s.indexOf('done') !== -1 || s.indexOf('complete') !== -1) {
      return 'stage-done';
    }
    if (s.indexOf('lost') !== -1 || s.indexOf('miss') !== -1 || s.indexOf('risk') !== -1 || s.indexOf('cancel') !== -1) {
      return 'stage-risk';
    }
    if (s.indexOf('late') !== -1 || s.indexOf('due') !== -1 || s.indexOf('overdue') !== -1 || s.indexOf('pending') !== -1) {
      return 'stage-late';
    }
    if (s.indexOf('wait') !== -1 || s.indexOf('hold') !== -1 || s.indexOf('review') !== -1 || s.indexOf('approv') !== -1) {
      return 'stage-wait';
    }
    return 'stage-neutral';
  }

  function updateSummary() {
    var rows = state.filtered;
    var count = rows.length;
    var total = 0;
    var probSum = 0;
    var probCount = 0;
    var amountCount = 0;

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var amt = Number(r.Amount);
      if (!isNaN(amt)) {
        total += amt;
        amountCount++;
      }
      var prob = Number(r.Probability);
      if (!isNaN(prob)) {
        probSum += prob;
        probCount++;
      }
    }

    var avgAmount = amountCount ? total / amountCount : 0;
    var avgProb = probCount ? probSum / probCount : 0;

    els.statCount.textContent = fmtInt(count);
    els.statTotal.textContent = fmtMoney(total);
    els.statAvgAmount.textContent = fmtMoney(avgAmount);
    els.statAvgProb.textContent = (avgProb * 100).toFixed(1) + '%';
  }

  function renderTable() {
    var start = (state.page - 1) * state.pageSize;
    var end = Math.min(start + state.pageSize, state.filtered.length);
    var slice = state.filtered.slice(start, end);

    var html = '';
    for (var i = 0; i < slice.length; i++) {
      var r = slice[i];
      var stage = r.Stage == null ? '' : String(r.Stage);
      var stageCell = stage
        ? '<span class="stage-pill ' + stageClass(stage) + '">' + escapeHtml(stage) + '</span>'
        : '<span class="stage-pill stage-empty">—</span>';
      var amt = Number(r.Amount);
      var prob = Number(r.Probability);

      html +=
        '<tr>' +
        '<td class="cell-id">' + escapeHtml(r.Opportunity_ID == null ? '' : String(r.Opportunity_ID)) + '</td>' +
        '<td class="cell-company">' + escapeHtml(r.Company == null ? '' : String(r.Company)) + '</td>' +
        '<td>' + escapeHtml(r.Product == null ? '' : String(r.Product)) + '</td>' +
        '<td>' + stageCell + '</td>' +
        '<td>' + escapeHtml(r.Region == null ? '' : String(r.Region)) + '</td>' +
        '<td>' + escapeHtml(r.AE_Name == null ? '' : String(r.AE_Name)) + '</td>' +
        '<td>' + escapeHtml(r.SDR_Name == null ? '' : String(r.SDR_Name)) + '</td>' +
        '<td class="num">' + (isNaN(amt) ? '—' : fmtMoney(amt)) + '</td>' +
        '<td class="num">' + (isNaN(prob) ? '—' : (prob * 100).toFixed(0) + '%') + '</td>' +
        '<td class="cell-date">' + fmtDate(r.Created_Date) + '</td>' +
        '</tr>';
    }
    els.ledgerBody.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function updatePager() {
    var total = state.filtered.length;
    var start = total === 0 ? 0 : (state.page - 1) * state.pageSize + 1;
    var end = Math.min(state.page * state.pageSize, total);
    els.showing.textContent = 'Showing ' + start + '–' + end + ' of ' + total;

    var maxPage = Math.max(1, Math.ceil(total / state.pageSize));
    els.prevPage.disabled = state.page <= 1;
    els.nextPage.disabled = state.page >= maxPage;
  }

  function applyFilters() {
    var rows = state.rows;
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var ok = true;
      for (var j = 0; j < FILTER_FIELDS.length; j++) {
        var f = FILTER_FIELDS[j];
        var val = state.filterValues[f];
        if (val) {
          var cell = r[f] == null ? '' : String(r[f]);
          if (cell !== val) {
            ok = false;
            break;
          }
        }
      }
      if (ok) out.push(r);
    }
    state.filtered = out;
    state.page = 1;
    updateSummary();
    renderTable();
    updatePager();
    setStates();
  }

  function buildFilterOptions() {
    var selects = filterSelects();
    for (var i = 0; i < selects.length; i++) {
      var sel = selects[i];
      var field = sel.getAttribute('data-field');
      var values = uniqueValues(field);
      var current = state.filterValues[field] || '';
      var html = '<option value="">All</option>';
      for (var j = 0; j < values.length; j++) {
        var v = values[j];
        html += '<option value="' + escapeHtml(v) + '"' + (v === current ? ' selected' : '') + '>' + escapeHtml(v) + '</option>';
      }
      sel.innerHTML = html;
    }
  }

  function uniqueValues(field) {
    var seen = {};
    var out = [];
    for (var i = 0; i < state.rows.length; i++) {
      var v = state.rows[i][field];
      if (v === null || v === undefined || v === '') continue;
      var key = String(v);
      if (!seen[key]) {
        seen[key] = true;
        out.push(key);
      }
    }
    out.sort(function (a, b) {
      return a.localeCompare(b);
    });
    return out;
  }

  function showSessionExpired() {
    state.loading = false;
    state.loaded = false;
    els.sessionExpired.hidden = false;
    els.loading.hidden = true;
    els.empty.hidden = true;
    els.error.hidden = true;
    els.summary.hidden = true;
    els.filters.hidden = true;
    els.tableWrap.hidden = true;
    els.pager.hidden = true;
  }

  function showError() {
    state.loading = false;
    state.loaded = false;
    state.error = true;
    els.error.hidden = false;
    els.loading.hidden = true;
    els.empty.hidden = true;
    els.sessionExpired.hidden = true;
    els.summary.hidden = true;
    els.filters.hidden = true;
    els.tableWrap.hidden = true;
    els.pager.hidden = true;
  }

  function loadData() {
    state.loading = true;
    state.error = false;
    setStates();
    return fetch('api/opportunities', { headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (res.status === 401) {
          showSessionExpired();
          return;
        }
        if (!res.ok) throw new Error('bad status');
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        state.columns = data.columns || COLUMNS;
        state.rows = (data.rows || []).map(function (row) {
          var obj = {};
          for (var i = 0; i < state.columns.length; i++) {
            obj[state.columns[i]] = row[i];
          }
          return obj;
        });
        state.loaded = true;
        state.loading = false;
        els.navCount.textContent = fmtInt(state.rows.length);
        buildFilterOptions();
        applyFilters();
        window.knowiReportReady = true;
      })
      .catch(function () {
        showError();
      });
  }

  function onFilterChange(e) {
    var field = e.target.getAttribute('data-field');
    if (!field) return;
    state.filterValues[field] = e.target.value;
    applyFilters();
  }

  function clearFilters() {
    var selects = filterSelects();
    for (var i = 0; i < selects.length; i++) {
      selects[i].value = '';
      state.filterValues[selects[i].getAttribute('data-field')] = '';
    }
    applyFilters();
  }

  function onPageSizeChange(e) {
    state.pageSize = parseInt(e.target.value, 10) || 50;
    state.page = 1;
    renderTable();
    updatePager();
  }

  function onPrev() {
    if (state.page > 1) {
      state.page--;
      renderTable();
      updatePager();
    }
  }

  function onNext() {
    var maxPage = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
    if (state.page < maxPage) {
      state.page++;
      renderTable();
      updatePager();
    }
  }

  function init() {
    cacheEls();
    els.pageSize.value = '50';

    var selects = filterSelects();
    for (var i = 0; i < selects.length; i++) {
      selects[i].addEventListener('change', onFilterChange);
    }
    els.clearFilters.addEventListener('click', clearFilters);
    els.pageSize.addEventListener('change', onPageSizeChange);
    els.prevPage.addEventListener('click', onPrev);
    els.nextPage.addEventListener('click', onNext);

    loadData();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();