window.knowiReportReady = false;

(function () {
  'use strict';

  var PAGE_SIZE = 25;

  var state = {
    all: [],
    filtered: [],
    sort: { key: 'date', dir: 'desc' },
    page: 1,
    selectedId: null,
    loading: true,
    error: null
  };

  var els = {};
  var lastFocused = null;

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtMoney(n) {
    if (n == null || isNaN(n)) return '–';
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtInt(n) {
    if (n == null || isNaN(n)) return '–';
    return Number(n).toLocaleString('en-US');
  }

  function parseDate(v) {
    if (v == null || v === '') return null;
    var d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  function fmtDate(v) {
    var d = parseDate(v);
    if (!d) return '–';
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var yy = d.getFullYear();
    return dd + '/' + mm + '/' + yy;
  }

  function fmtDateLong(v) {
    var d = parseDate(v);
    if (!d) return '–';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function num(v) {
    if (v == null || v === '') return 0;
    var n = Number(v);
    return isNaN(n) ? 0 : n;
  }

  function isTrue(v) {
    if (v === true) return true;
    if (typeof v === 'string') {
      var s = v.trim().toLowerCase();
      return s === 'true' || s === '1' || s === 'yes' || s === 'y';
    }
    return false;
  }

  function statusOf(r) {
    if (isTrue(r.refund)) return 'Refunded';
    if (isTrue(r.payment_successful)) return 'Paid';
    return 'Failed';
  }

  function supporterDisplay(r) {
    return isTrue(r.anonymous_donation) ? 'Anonymous' : (r.supporter_name || 'Anonymous');
  }

  function statusRank(s) {
    return s === 'Paid' ? 0 : s === 'Refunded' ? 1 : 2;
  }

  function cmp(a, b) {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  function sortVal(r, key) {
    switch (key) {
      case 'date': { var d = parseDate(r.payment_at); return d ? d.getTime() : 0; }
      case 'supporter': return supporterDisplay(r).toLowerCase();
      case 'project': return String(r.project || '').toLowerCase();
      case 'method': return String(r.payment_method || '').toLowerCase();
      case 'amount': return num(r.amount_paid);
      case 'fee': return num(r.fee_amount);
      case 'status': return statusRank(statusOf(r));
      default: return 0;
    }
  }

  function sortRows(rows) {
    var key = state.sort.key, dir = state.sort.dir;
    var m = dir === 'asc' ? 1 : -1;
    rows.sort(function (a, b) {
      var av = sortVal(a, key), bv = sortVal(b, key);
      var c = cmp(av, bv);
      if (c !== 0) return c * m;
      var da = parseDate(a.payment_at), db = parseDate(b.payment_at);
      var ta = da ? da.getTime() : 0, tb = db ? db.getTime() : 0;
      if (ta !== tb) return (ta - tb) * m;
      return 0;
    });
  }

  function applyFilters() {
    var q = (els.search.value || '').trim().toLowerCase();
    var year = els.year.value;
    var method = els.method.value;
    var successOnly = els.success.checked;

    state.filtered = state.all.filter(function (r) {
      if (successOnly && !(isTrue(r.payment_successful) && !isTrue(r.refund))) return false;
      if (year !== 'all' && String(r.financial_year) !== year) return false;
      if (method !== 'all' && String(r.payment_method) !== method) return false;
      if (q) {
        var hay = (String(r.supporter_name || '') + ' ' + String(r.email || '') + ' ' + String(r.receipt_number || '')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    sortRows(state.filtered);
  }

  function computeKpis() {
    var total = 0, successCount = 0;
    var supporters = new Set(), recurring = new Set();
    state.all.forEach(function (r) {
      if (r.supporter_id != null && r.supporter_id !== '') supporters.add(String(r.supporter_id));
      if (isTrue(r.recurring_donor) && r.supporter_id != null && r.supporter_id !== '') recurring.add(String(r.supporter_id));
      if (isTrue(r.payment_successful) && !isTrue(r.refund)) {
        total += num(r.amount_paid);
        successCount++;
      }
    });
    els.kpiTotal.textContent = fmtMoney(total);
    els.kpiSupporters.textContent = fmtInt(supporters.size);
    els.kpiRecurring.textContent = fmtInt(recurring.size);
    els.kpiAvg.textContent = successCount ? fmtMoney(total / successCount) : '–';
  }

  function computeDateRange() {
    var min = null, max = null;
    state.all.forEach(function (r) {
      var d = parseDate(r.payment_at);
      if (!d) return;
      if (!min || d < min) min = d;
      if (!max || d > max) max = d;
    });
    if (min && max) {
      els.dateRange.textContent = 'Payments from ' + fmtDateLong(min) + ' to ' + fmtDateLong(max);
    } else {
      els.dateRange.textContent = 'No payment dates available';
    }
  }

  function updateNavCounts() {
    var ov = document.querySelector('[data-count="overview"]');
    var pay = document.querySelector('[data-count="payments"]');
    if (ov) ov.textContent = fmtInt(state.all.length);
    if (pay) pay.textContent = fmtInt(state.filtered.length);
  }

  function updateSortIndicators() {
    document.querySelectorAll('.th-btn').forEach(function (b) {
      var ind = b.querySelector('.sort-ind');
      if (!ind) return;
      if (b.getAttribute('data-sort') === state.sort.key) {
        ind.textContent = state.sort.dir === 'asc' ? '▲' : '▼';
      } else {
        ind.textContent = '';
      }
    });
  }

  function renderTable() {
    var total = state.filtered.length;
    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    if (state.page < 1) state.page = 1;
    var start = (state.page - 1) * PAGE_SIZE;
    var end = Math.min(start + PAGE_SIZE, total);
    var slice = state.filtered.slice(start, end);

    var isMobile = window.matchMedia('(max-width: 699px)').matches;
    els.tableScroll.hidden = isMobile;
    els.cardList.hidden = !isMobile;

    if (isMobile) {
      els.cardList.innerHTML = slice.map(function (r) {
        var st = statusOf(r);
        return '<div class="pay-card" data-id="' + esc(r.supporter_id) + '" tabindex="0" role="button" aria-label="View ' + esc(supporterDisplay(r)) + '">' +
          '<div class="pay-card-top"><span class="pay-card-name">' + esc(supporterDisplay(r)) + '</span>' +
          '<span class="pill pill-' + st.toLowerCase() + '">' + st + '</span></div>' +
          '<div class="pay-card-meta">' + esc(r.project || '–') + ' · ' + esc(r.payment_method || '–') + '</div>' +
          '<div class="pay-card-bottom"><span class="pay-card-date">' + fmtDate(r.payment_at) + '</span>' +
          '<span class="pay-card-amt">' + fmtMoney(r.amount_paid) + '</span></div></div>';
      }).join('');
    } else {
      els.tableBody.innerHTML = slice.map(function (r) {
        var st = statusOf(r);
        return '<tr data-id="' + esc(r.supporter_id) + '" tabindex="0" role="button" aria-label="View ' + esc(supporterDisplay(r)) + '">' +
          '<td class="c-date">' + fmtDate(r.payment_at) + '</td>' +
          '<td class="c-supporter">' + esc(supporterDisplay(r)) + '</td>' +
          '<td class="c-project">' + esc(r.project || '–') + '</td>' +
          '<td class="c-method">' + esc(r.payment_method || '–') + '</td>' +
          '<td class="c-amount num">' + fmtMoney(r.amount_paid) + '</td>' +
          '<td class="c-fee num">' + fmtMoney(r.fee_amount) + '</td>' +
          '<td class="c-status"><span class="pill pill-' + st.toLowerCase() + '">' + st + '</span></td></tr>';
      }).join('');
    }

    els.showing.textContent = total === 0 ? 'Showing 0–0 of 0' : 'Showing ' + (start + 1) + '–' + end + ' of ' + total;
    els.pageInd.textContent = 'Page ' + state.page + ' of ' + pages;
    els.prevBtn.disabled = state.page <= 1;
    els.nextBtn.disabled = state.page >= pages;

    updateSortIndicators();
    updateNavCounts();
  }

  function showTableState(kind, msg) {
    els.tableScroll.hidden = true;
    els.cardList.hidden = true;
    els.tableState.hidden = false;
    els.tableState.className = 'table-state ' + kind;
    els.tableState.innerHTML = msg;
    els.showing.textContent = 'Showing 0–0 of 0';
    els.pageInd.textContent = 'Page 1';
    els.prevBtn.disabled = true;
    els.nextBtn.disabled = true;
  }

  function hideTableState() {
    els.tableState.hidden = true;
    els.tableState.innerHTML = '';
  }

  function render() {
    if (state.loading) {
      showTableState('loading', '<div class="skeleton" aria-hidden="true"></div><span class="state-text">Loading payments…</span>');
      return;
    }
    if (state.error) {
      showTableState('error', '<span class="state-text">Could not load payments. <button class="btn btn-ghost" id="retryBtn">Retry</button></span>');
      var rb = document.getElementById('retryBtn');
      if (rb) rb.addEventListener('click', load);
      return;
    }
    hideTableState();
    if (state.filtered.length === 0) {
      showTableState('empty', '<span class="state-text">No payments match the current filters.</span>');
      els.tableScroll.hidden = true;
      els.cardList.hidden = true;
      return;
    }
    renderTable();
  }

  function openPanel(id) {
    var rows = state.all.filter(function (r) { return String(r.supporter_id) === String(id); });
    if (!rows.length) return;
    var first = rows[0];
    var lifetime = 0;
    rows.forEach(function (r) {
      if (isTrue(r.payment_successful) && !isTrue(r.refund)) lifetime += num(r.amount_paid);
    });
    var payments = rows.slice().sort(function (a, b) {
      var da = parseDate(a.payment_at), db = parseDate(b.payment_at);
      return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
    });

    var name = isTrue(first.anonymous_donation) ? 'Anonymous' : (first.supporter_name || 'Anonymous');
    els.panelName.textContent = name;

    var facts = [
      ['Email', first.email || '–'],
      ['Mobile', first.mobile_phone || '–'],
      ['Type', first.supporter_type || '–'],
      ['Acquired', fmtDateLong(first.acquisition_date)],
      ['Recurring', first.recurring_donor_status || '–'],
      ['Membership', first.membership_status || '–']
    ];

    var html = '<div class="panel-lifetime"><span class="panel-lifetime-label">Lifetime total</span>' +
      '<span class="panel-lifetime-value">' + fmtMoney(lifetime) + '</span></div>';
    html += '<dl class="panel-facts">';
    facts.forEach(function (f) {
      html += '<div class="fact"><dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd></div>';
    });
    html += '</dl>';
    html += '<h3 class="panel-sub">Payments (' + payments.length + ')</h3>';
    html += '<ul class="panel-payments">';
    payments.forEach(function (r) {
      html += '<li class="ppay"><span class="ppay-date">' + fmtDate(r.payment_at) + '</span>' +
        '<span class="ppay-project">' + esc(r.project || '–') + '</span>' +
        '<span class="ppay-amt">' + fmtMoney(r.amount_paid) + '</span></li>';
    });
    html += '</ul>';

    els.panelBody.innerHTML = html;
    els.panel.hidden = false;
    els.backdrop.hidden = false;
    document.body.classList.add('panel-open');
    els.panelClose.focus();
  }

  function closePanel() {
    els.panel.hidden = true;
    els.backdrop.hidden = true;
    document.body.classList.remove('panel-open');
    if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
  }

  function buildSelects() {
    var years = new Set(), methods = new Set();
    state.all.forEach(function (r) {
      if (r.financial_year != null && r.financial_year !== '') years.add(String(r.financial_year));
      if (r.payment_method != null && r.payment_method !== '') methods.add(String(r.payment_method));
    });
    var yArr = Array.from(years).sort(function (a, b) { return Number(b) - Number(a); });
    var mArr = Array.from(methods).sort();

    els.year.innerHTML = '<option value="all">All years</option>' +
      yArr.map(function (y) { return '<option value="' + esc(y) + '">' + esc(y) + '</option>'; }).join('');
    els.method.innerHTML = '<option value="all">All methods</option>' +
      mArr.map(function (m) { return '<option value="' + esc(m) + '">' + esc(m) + '</option>'; }).join('');
  }

  function wireEvents() {
    els.search.addEventListener('input', function () { state.page = 1; applyFilters(); render(); });
    els.year.addEventListener('change', function () { state.page = 1; applyFilters(); render(); });
    els.method.addEventListener('change', function () { state.page = 1; applyFilters(); render(); });
    els.success.addEventListener('change', function () { state.page = 1; applyFilters(); render(); });

    els.prevBtn.addEventListener('click', function () { if (state.page > 1) { state.page--; render(); } });
    els.nextBtn.addEventListener('click', function () { state.page++; render(); });

    document.querySelectorAll('.th-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.getAttribute('data-sort');
        if (state.sort.key === key) {
          state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sort.key = key;
          state.sort.dir = key === 'date' ? 'desc' : 'asc';
        }
        state.page = 1;
        applyFilters();
        render();
      });
    });

    function onRowActivate(id) {
      lastFocused = document.activeElement;
      openPanel(id);
    }
    els.tableBody.addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-id]');
      if (tr) onRowActivate(tr.getAttribute('data-id'));
    });
    els.tableBody.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        var tr = e.target.closest('tr[data-id]');
        if (tr) { e.preventDefault(); onRowActivate(tr.getAttribute('data-id')); }
      }
    });
    els.cardList.addEventListener('click', function (e) {
      var c = e.target.closest('.pay-card[data-id]');
      if (c) onRowActivate(c.getAttribute('data-id'));
    });
    els.cardList.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        var c = e.target.closest('.pay-card[data-id]');
        if (c) { e.preventDefault(); onRowActivate(c.getAttribute('data-id')); }
      }
    });

    els.panelClose.addEventListener('click', closePanel);
    els.backdrop.addEventListener('click', closePanel);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !els.panel.hidden) closePanel();
    });

    window.matchMedia('(max-width: 699px)').addEventListener('change', function () {
      if (!state.loading && !state.error) render();
    });
  }

  async function load() {
    state.loading = true;
    state.error = null;
    render();
    try {
      var res = await fetch('api/supporters', { headers: { Accept: 'application/json' } });
      if (res.status === 401) {
        state.loading = false;
        state.error = 'session';
        showTableState('error', '<span class="state-text">Your session has expired. <a class="link" href="login">Sign in again</a></span>');
        return;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      var columns = data.columns || [];
      var rows = data.rows || [];
      state.all = rows.map(function (row) {
        var o = {};
        for (var i = 0; i < columns.length; i++) o[columns[i]] = row[i];
        return o;
      });
      state.loading = false;
      buildSelects();
      computeKpis();
      computeDateRange();
      els.previewPill.hidden = state.all.length > 0;
      applyFilters();
      render();
    } catch (err) {
      state.loading = false;
      state.error = 'error';
      render();
    }
  }

  function init() {
    els.search = $('searchInput');
    els.year = $('yearSelect');
    els.method = $('methodSelect');
    els.success = $('successOnly');
    els.kpiTotal = $('kpiTotal');
    els.kpiSupporters = $('kpiSupporters');
    els.kpiRecurring = $('kpiRecurring');
    els.kpiAvg = $('kpiAvg');
    els.dateRange = $('dateRange');
    els.previewPill = $('previewPill');
    els.tableScroll = $('tableScroll');
    els.cardList = $('cardList');
    els.tableBody = $('tableBody');
    els.tableState = $('tableState');
    els.showing = $('showing');
    els.pageInd = $('pageInd');
    els.prevBtn = $('prevBtn');
    els.nextBtn = $('nextBtn');
    els.panel = $('sidePanel');
    els.panelName = $('panelName');
    els.panelBody = $('panelBody');
    els.panelClose = $('panelClose');
    els.backdrop = $('panelBackdrop');

    wireEvents();
    load().then(function () { window.knowiReportReady = true; });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();