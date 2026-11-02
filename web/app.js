window.knowiReportReady = false;

(function () {
  'use strict';

  var PAGE_SIZE = 50;

  var state = {
    columns: [],
    rows: [],
    idx: {},
    filters: { Stage: '', Region: '', Product: '', AE_Name: '', SDR_Name: '' },
    page: 1,
    filtered: [],
    loading: false,
    error: false,
  };

  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function cacheEls() {
    els.summary = $('summary');
    els.ledgerLoading = $('ledger-loading');
    els.ledgerError = $('ledger-error');
    els.ledgerEmpty = $('ledger-empty');
    els.ledgerTableWrap = $('ledger-table-wrap');
    els.ledgerBody = $('ledger-body');
    els.ledgerPager = $('ledger-pager');
    els.ledgerCount = $('ledger-count');
    els.pagerIndicator = $('pager-indicator');
    els.btnPrev = $('btn-prev');
    els.btnNext = $('btn-next');
    els.btnClear = $('btn-clear');
    els.btnEmptyClear = $('btn-empty-clear');
    els.btnRetry = $('btn-retry');
    els.statCount = $('stat-count');
    els.statCountFoot = $('stat-count-foot');
    els.statTotal = $('stat-total');
    els.statAvgAmount = $('stat-avg-amount');
    els.statAvgProb = $('stat-avg-prob');
    els.statNewest = $('stat-newest');
    els.pillAll = $('pill-all');
    els.pillStage = $('pill-stage');
    els.pillRegion = $('pill-region');
    els.viewerName = $('viewer-name');
    els.pageSub = $('page-sub');
  }

  function parseUser() {
    var h = document.documentElement.getAttribute('data-knowi-user');
    if (!h) return null;
    try {
      var b64 = h.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      var json = decodeURIComponent(
        atob(b64)
          .split('')
          .map(function (c) { return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2); })
          .join('')
      );
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
  }

  function setViewer() {
    var u = parseUser();
    if (u && u.name) {
      els.viewerName.textContent = u.name;
    }
  }

  function buildIndex() {
    state.idx = {};
    state.columns.forEach(function (c, i) {
      state.idx[c] = i;
    });
  }

  function val(row, field) {
    var i = state.idx[field];
    if (i === undefined) return undefined;
    return row[i];
  }

  function distinctValues(field) {
    var i = state.idx[field];
    if (i === undefined) return [];
    var set = {};
    for (var r = 0; r < state.rows.length; r++) {
      var v = state.rows[r][i];
      if (v === null || v === undefined || v === '') continue;
      set[String(v)] = true;
    }
    var out = Object.keys(set);
    out.sort(function (a, b) {
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
    return out;
  }

  function populateFilters() {
    var fields = ['Stage', 'Region', 'Product', 'AE_Name', 'SDR_Name'];
    fields.forEach(function (f) {
      var sel = document.querySelector('.filter-select[data-field="' + f + '"]');
      if (!sel) return;
      var prev = state.filters[f];
      sel.innerHTML = '';
      var all = document.createElement('option');
      all.value = '';
      all.textContent = 'All';
      sel.appendChild(all);
      distinctValues(f).forEach(function (v) {
        var o = document.createElement('option');
        o.value = v;
        o.textContent = v;
        sel.appendChild(o);
      });
      sel.value = prev;
    });
  }

  function applyFilters() {
    var f = state.filters;
    state.filtered = state.rows.filter(function (row) {
      for (var key in f) {
        if (!f[key]) continue;
        if (String(val(row, key) === undefined ? '' : val(row, key)) !== f[key]) return false;
      }
      return true;
    });
  }

  function fmtMoney(n) {
    if (n === null || n === undefined || isNaN(n)) return '–';
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function fmtMoney2(n) {
    if (n === null || n === undefined || isNaN(n)) return '–';
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtPct(n) {
    if (n === null || n === undefined || isNaN(n)) return '–';
    return (n * 100).toFixed(0) + '%';
  }

  function fmtDate(v) {
    if (v === null || v === undefined || v === '') return '–';
    var d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function stageClass(stage) {
    var s = String(stage || '').toLowerCase();
    if (s.indexOf('won') !== -1 || s.indexOf('closed') !== -1 || s.indexOf('done') !== -1 || s.indexOf('complete') !== -1) return 'pill-done';
    if (s.indexOf('lost') !== -1 || s.indexOf('miss') !== -1 || s.indexOf('risk') !== -1 || s.indexOf('cancel') !== -1) return 'pill-risk';
    if (s.indexOf('late') !== -1 || s.indexOf('due') !== -1 || s.indexOf('overdue') !== -1 || s.indexOf('pending') !== -1) return 'pill-late';
    if (s.indexOf('wait') !== -1 || s.indexOf('hold') !== -1 || s.indexOf('review') !== -1 || s.indexOf('on hold') !== -1) return 'pill-wait';
    return 'pill-neutral';
  }

  function updateSummary() {
    var rows = state.filtered;
    var n = rows.length;
    var total = 0, sumProb = 0, newest = null;
    var iAmt = state.idx['Amount'];
    var iProb = state.idx['Probability'];
    var iDate = state.idx['Created_Date'];
    for (var i = 0; i < n; i++) {
      var a = rows[i][iAmt];
      if (typeof a === 'number' && !isNaN(a)) total += a;
      var p = rows[i][iProb];
      if (typeof p === 'number' && !isNaN(p)) sumProb += p;
      var d = rows[i][iDate];
      if (d) {
        var t = new Date(d).getTime();
        if (!isNaN(t) && (newest === null || t > newest)) newest = t;
      }
    }
    els.statCount.textContent = n.toLocaleString('en-US');
    els.statCountFoot.textContent = 'of ' + state.rows.length.toLocaleString('en-US') + ' records';
    els.statTotal.textContent = fmtMoney(total);
    els.statAvgAmount.textContent = n ? fmtMoney(total / n) : '–';
    els.statAvgProb.textContent = n ? fmtPct(sumProb / n) : '–';
    els.statNewest.textContent = newest ? fmtDate(new Date(newest)) : '–';
  }

  function updatePills() {
    els.pillAll.textContent = state.rows.length.toLocaleString('en-US');
    els.pillStage.textContent = distinctValues('Stage').length;
    els.pillRegion.textContent = distinctValues('Region').length;
  }

  function renderTable() {
    var start = (state.page - 1) * PAGE_SIZE;
    var end = Math.min(start + PAGE_SIZE, state.filtered.length);
    var frag = document.createDocumentFragment();
    for (var i = start; i < end; i++) {
      var row = state.filtered[i];
      var tr = document.createElement('tr');

      var tdId = document.createElement('td');
      tdId.className = 'cell-id';
      tdId.textContent = val(row, 'Opportunity_ID') || '–';
      tr.appendChild(tdId);

      var tdCo = document.createElement('td');
      tdCo.className = 'cell-company';
      tdCo.textContent = val(row, 'Company') || '–';
      tr.appendChild(tdCo);

      var tdProd = document.createElement('td');
      tdProd.textContent = val(row, 'Product') || '–';
      tr.appendChild(tdProd);

      var tdStage = document.createElement('td');
      var stage = val(row, 'Stage');
      var pill = document.createElement('span');
      pill.className = 'pill ' + stageClass(stage);
      pill.textContent = stage || '–';
      tdStage.appendChild(pill);
      tr.appendChild(tdStage);

      var tdRegion = document.createElement('td');
      tdRegion.textContent = val(row, 'Region') || '–';
      tr.appendChild(tdRegion);

      var tdAe = document.createElement('td');
      tdAe.textContent = val(row, 'AE_Name') || '–';
      tr.appendChild(tdAe);

      var tdSdr = document.createElement('td');
      tdSdr.textContent = val(row, 'SDR_Name') || '–';
      tr.appendChild(tdSdr);

      var tdAmt = document.createElement('td');
      tdAmt.className = 'num';
      tdAmt.textContent = fmtMoney(val(row, 'Amount'));
      tr.appendChild(tdAmt);

      var tdProb = document.createElement('td');
      tdProb.className = 'num';
      tdProb.textContent = fmtPct(val(row, 'Probability'));
      tr.appendChild(tdProb);

      var tdDate = document.createElement('td');
      tdDate.textContent = fmtDate(val(row, 'Created_Date'));
      tr.appendChild(tdDate);

      frag.appendChild(tr);
    }
    els.ledgerBody.innerHTML = '';
    els.ledgerBody.appendChild(frag);
  }

  function updatePager() {
    var total = state.filtered.length;
    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    if (state.page < 1) state.page = 1;
    els.pagerIndicator.textContent = 'Page ' + state.page + ' of ' + pages;
    els.btnPrev.disabled = state.page <= 1;
    els.btnNext.disabled = state.page >= pages;
    els.ledgerPager.hidden = total <= PAGE_SIZE;
  }

  function showState() {
    var hasData = state.rows.length > 0;
    var hasFiltered = state.filtered.length > 0;

    els.ledgerLoading.hidden = !state.loading;
    els.ledgerError.hidden = !state.error;
    els.ledgerEmpty.hidden = !(hasData && !hasFiltered);
    els.ledgerTableWrap.hidden = state.loading || state.error || !hasFiltered;
    els.ledgerPager.hidden = state.loading || state.error || !hasFiltered || state.filtered.length <= PAGE_SIZE;

    if (state.error) {
      els.pageSub.textContent = 'The opportunities could not be loaded.';
    } else if (!hasData) {
      els.pageSub.textContent = 'No opportunities are available yet.';
    } else {
      els.pageSub.textContent = 'A filterable ledger of every open and closed opportunity, with live totals.';
    }
  }

  function refresh() {
    applyFilters();
    updateSummary();
    updatePills();
    renderTable();
    updatePager();
    showState();
  }

  function load() {
    state.loading = true;
    state.error = false;
    showState();
    fetch('api/opportunities', { headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (res.status === 401) {
          state.loading = false;
          state.error = true;
          showState();
          window.knowiReportReady = true;
          return;
        }
        return res.json().then(function (data) {
          if (!res.ok) throw new Error('bad status');
          state.columns = data.columns || [];
          state.rows = data.rows || [];
          buildIndex();
          populateFilters();
          state.loading = false;
          refresh();
          window.knowiReportReady = true;
        });
      })
      .catch(function () {
        state.loading = false;
        state.error = true;
        showState();
        window.knowiReportReady = true;
      });
  }

  function clearFilters() {
    state.filters = { Stage: '', Region: '', Product: '', AE_Name: '', SDR_Name: '' };
    state.page = 1;
    var sels = document.querySelectorAll('.filter-select');
    for (var i = 0; i < sels.length; i++) sels[i].value = '';
    refresh();
  }

  function bindEvents() {
    var sels = document.querySelectorAll('.filter-select');
    for (var i = 0; i < sels.length; i++) {
      sels[i].addEventListener('change', function (e) {
        state.filters[e.target.getAttribute('data-field')] = e.target.value;
        state.page = 1;
        refresh();
      });
    }
    els.btnClear.addEventListener('click', clearFilters);
    els.btnEmptyClear.addEventListener('click', clearFilters);
    els.btnRetry.addEventListener('click', load);
    els.btnPrev.addEventListener('click', function () {
      if (state.page > 1) { state.page--; refresh(); }
    });
    els.btnNext.addEventListener('click', function () {
      var pages = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
      if (state.page < pages) { state.page++; refresh(); }
    });

    var navLinks = document.querySelectorAll('.nav-link');
    for (var n = 0; n < navLinks.length; n++) {
      navLinks[n].addEventListener('click', function (e) {
        e.preventDefault();
        var target = e.currentTarget.getAttribute('data-nav');
        if (target === 'all') {
          clearFilters();
        } else if (target === 'stage') {
          var sel = document.querySelector('.filter-select[data-field="Stage"]');
          if (sel) sel.focus();
        } else if (target === 'region') {
          var sel2 = document.querySelector('.filter-select[data-field="Region"]');
          if (sel2) sel2.focus();
        }
      });
    }
  }

  function init() {
    cacheEls();
    setViewer();
    bindEvents();
    load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();