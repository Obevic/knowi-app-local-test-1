window.knowiReportReady = false;

(function () {
  'use strict';

  var PAGE_SIZE = 25;
  var MOBILE_BREAK = 700;

  var state = {
    columns: [],
    rows: [],
    records: [],
    idx: {},
    sortKey: 'payment_at',
    sortDir: 'desc',
    page: 1,
    filters: { search: '', year: '__all__', method: '__all__', successOnly: true },
    panelSupporterId: null,
    lastFocused: null
  };

  var el = {};

  function $(id) { return document.getElementById(id); }

  function cacheEls() {
    el.dateRange = $('dateRange');
    el.syntheticPill = $('syntheticPill');
    el.navCount = $('navCount');
    el.kpiTotal = $('kpiTotal');
    el.kpiSupporters = $('kpiSupporters');
    el.kpiRecurring = $('kpiRecurring');
    el.kpiAvg = $('kpiAvg');
    el.searchInput = $('searchInput');
    el.yearSelect = $('yearSelect');
    el.methodSelect = $('methodSelect');
    el.successOnly = $('successOnly');
    el.tableScroll = $('tableScroll');
    el.tableBody = $('tableBody');
    el.cardList = $('cardList');
    el.tableState = $('tableState');
    el.stateInner = $('stateInner');
    el.footInfo = $('footInfo');
    el.prevBtn = $('prevBtn');
    el.nextBtn = $('nextBtn');
    el.panelBackdrop = $('panelBackdrop');
    el.sidePanel = $('sidePanel');
    el.panelName = $('panelName');
    el.panelClose = $('panelClose');
    el.panelBody = $('panelBody');
  }

  // ---- helpers -------------------------------------------------------------

  function toNum(v) {
    if (v === null || v === undefined || v === '') return 0;
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function toBool(v) {
    if (v === true || v === false) return v;
    if (typeof v === 'string') {
      var s = v.trim().toLowerCase();
      return s === 'true' || s === '1' || s === 'yes' || s === 'y';
    }
    return !!v;
  }

  function str(v) {
    if (v === null || v === undefined) return '';
    return String(v);
  }

  function fmtMoney(n) {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(n);
  }

  function fmtInt(n) {
    return new Intl.NumberFormat('en-US').format(n);
  }

  function parseDate(v) {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    var s = String(v).trim();
    if (!s) return null;
    var d = new Date(s);
    if (!isNaN(d.getTime())) return d;
    var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (m) {
      var day = parseInt(m[1], 10);
      var mon = parseInt(m[2], 10);
      var yr = parseInt(m[3], 10);
      if (yr < 100) yr += 2000;
      var d2 = new Date(yr, mon - 1, day);
      if (!isNaN(d2.getTime())) return d2;
    }
    return null;
  }

  function fmtDate(v) {
    var d = parseDate(v);
    if (!d) return '—';
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var yy = d.getFullYear();
    return dd + '/' + mm + '/' + yy;
  }

  function statusOf(r) {
    if (toBool(r.refund)) return 'Refunded';
    if (toBool(r.payment_successful)) return 'Paid';
    return 'Failed';
  }

  function statusClass(s) {
    if (s === 'Paid') return 'pill-paid';
    if (s === 'Refunded') return 'pill-refunded';
    return 'pill-failed';
  }

  function supporterDisplay(r) {
    return toBool(r.anonymous_donation) ? 'Anonymous' : (str(r.supporter_name) || 'Anonymous');
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escAttr(s) {
    return esc(s);
  }

  function isMobile() {
    return window.innerWidth < MOBILE_BREAK;
  }

  // ---- data loading --------------------------------------------------------

  function buildRecords(columns, rows) {
    var idx = {};
    columns.forEach(function (c, i) { idx[c] = i; });
    var records = rows.map(function (row) {
      var r = {};
      for (var i = 0; i < columns.length; i++) {
        r[columns[i]] = row[i];
      }
      r._date = parseDate(r.payment_at);
      r._amount = toNum(r.amount_paid);
      r._fee = toNum(r.fee_amount);
      r._status = statusOf(r);
      return r;
    });
    return { idx: idx, records: records };
  }

  function computeKpis(records) {
    var total = 0;
    var successfulCount = 0;
    var supporters = new Set();
    var recurring = new Set();
    var minD = null;
    var maxD = null;

    records.forEach(function (r) {
      if (r._date) {
        if (!minD || r._date < minD) minD = r._date;
        if (!maxD || r._date > maxD) maxD = r._date;
      }
      var sid = r.supporter_id;
      if (sid !== null && sid !== undefined && str(sid) !== '') supporters.add(sid);
      if (toBool(r.recurring_donor)) recurring.add(sid);
      if (toBool(r.payment_successful) && !toBool(r.refund)) {
        total += r._amount;
        successfulCount += 1;
      }
    });

    return {
      total: total,
      supporters: supporters.size,
      recurring: recurring.size,
      avg: successfulCount > 0 ? total / successfulCount : 0,
      minDate: minD,
      maxDate: maxD
    };
  }

  function distinctValues(records, key) {
    var set = new Set();
    records.forEach(function (r) {
      var v = r[key];
      if (v !== null && v !== undefined && str(v) !== '') set.add(str(v));
    });
    return Array.from(set);
  }

  function populateSelect(select, values, allLabel) {
    // keep the first (All) option, rebuild the rest
    while (select.options.length > 1) select.remove(1);
    values.forEach(function (v) {
      var opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    });
  }

  // ---- filtering / sorting -------------------------------------------------

  function applyFilters(records) {
    var f = state.filters;
    var q = f.search.trim().toLowerCase();
    return records.filter(function (r) {
      if (f.successOnly && !(toBool(r.payment_successful) && !toBool(r.refund))) return false;
      if (f.year !== '__all__' && str(r.financial_year) !== f.year) return false;
      if (f.method !== '__all__' && str(r.payment_method) !== f.method) return false;
      if (q) {
        var hay = (str(r.supporter_name) + ' ' + str(r.email) + ' ' + str(r.receipt_number)).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function compareValues(a, b, key) {
    if (key === 'status') {
      var sa = a._status, sb = b._status;
      if (sa === sb) return 0;
      return sa < sb ? -1 : 1;
    }
    if (key === 'amount_paid') {
      var na = a._amount, nb = b._amount;
      return na === nb ? 0 : (na < nb ? -1 : 1);
    }
    if (key === 'fee_amount') {
      var fa = a._fee, fb = b._fee;
      return fa === fb ? 0 : (fa < fb ? -1 : 1);
    }
    if (key === 'payment_at') {
      var da = a._date, db = b._date;
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da.getTime() === db.getTime() ? 0 : (da.getTime() < db.getTime() ? -1 : 1);
    }
    var va = str(a[key]), vb = str(b[key]);
    if (va === vb) return 0;
    return va < vb ? -1 : 1;
  }

  function sortRecords(records) {
    var key = state.sortKey;
    var dir = state.sortDir === 'asc' ? 1 : -1;
    return records.slice().sort(function (a, b) {
      var c = compareValues(a, b, key);
      if (c !== 0) return c * dir;
      // stable tiebreak by date desc then amount
      var da = a._date, db = b._date;
      if (da && db && da.getTime() !== db.getTime()) return (da.getTime() < db.getTime() ? 1 : -1);
      return b._amount - a._amount;
    });
  }

  // ---- rendering -----------------------------------------------------------

  function renderHeader(kpi) {
    if (kpi.minDate && kpi.maxDate) {
      el.dateRange.textContent = fmtDate(kpi.minDate) + ' – ' + fmtDate(kpi.maxDate);
    } else {
      el.dateRange.textContent = 'No payment dates available';
    }
    el.syntheticPill.hidden = state.records.length > 0;
    el.navCount.textContent = fmtInt(state.records.length);
  }

  function renderKpis(kpi) {
    el.kpiTotal.textContent = fmtMoney(kpi.total);
    el.kpiSupporters.textContent = fmtInt(kpi.supporters);
    el.kpiRecurring.textContent = fmtInt(kpi.recurring);
    el.kpiAvg.textContent = fmtMoney(kpi.avg);
  }

  function updateSortIndicators() {
    var ths = el.tableScroll.querySelectorAll('th.sortable');
    ths.forEach(function (th) {
      var key = th.getAttribute('data-key');
      var btn = th.querySelector('.sort-btn');
      var ind = th.querySelector('.sort-ind');
      if (key === state.sortKey) {
        th.setAttribute('aria-sort', state.sortDir === 'asc' ? 'ascending' : 'descending');
        if (ind) ind.textContent = state.sortDir === 'asc' ? '▲' : '▼';
      } else {
        th.removeAttribute('aria-sort');
        if (ind) ind.textContent = '';
      }
    });
  }

  function renderTable(filtered) {
    var sorted = sortRecords(filtered);
    var total = sorted.length;
    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    if (state.page < 1) state.page = 1;
    var start = (state.page - 1) * PAGE_SIZE;
    var end = Math.min(start + PAGE_SIZE, total);
    var slice = sorted.slice(start, end);

    if (isMobile()) {
      el.tableScroll.hidden = true;
      el.cardList.hidden = false;
      el.cardList.innerHTML = slice.map(function (r) {
        return '' +
          '<div class="pay-card" data-sid="' + escAttr(str(r.supporter_id)) + '" tabindex="0" role="button" aria-label="View ' + esc(supporterDisplay(r)) + '">' +
            '<div class="pay-card-top">' +
              '<span class="pay-card-name">' + esc(supporterDisplay(r)) + '</span>' +
              '<span class="pill ' + statusClass(r._status) + '">' + esc(r._status) + '</span>' +
            '</div>' +
            '<div class="pay-card-meta">' +
              '<span class="pay-card-date">' + esc(fmtDate(r.payment_at)) + '</span>' +
              '<span class="pay-card-project">' + esc(str(r.project) || '—') + '</span>' +
            '</div>' +
            '<div class="pay-card-bottom">' +
              '<span class="pay-card-method">' + esc(str(r.payment_method) || '—') + '</span>' +
              '<span class="pay-card-amount">' + esc(fmtMoney(r._amount)) + '</span>' +
            '</div>' +
          '</div>';
      }).join('');
    } else {
      el.cardList.hidden = true;
      el.tableScroll.hidden = false;
      el.tableBody.innerHTML = slice.map(function (r) {
        return '' +
          '<tr class="pay-row" data-sid="' + escAttr(str(r.supporter_id)) + '" tabindex="0" role="button" aria-label="View ' + esc(supporterDisplay(r)) + '">' +
            '<td class="col-date">' + esc(fmtDate(r.payment_at)) + '</td>' +
            '<td class="col-supporter">' + esc(supporterDisplay(r)) + '</td>' +
            '<td class="col-project">' + esc(str(r.project) || '—') + '</td>' +
            '<td class="col-method">' + esc(str(r.payment_method) || '—') + '</td>' +
            '<td class="col-amount num">' + esc(fmtMoney(r._amount)) + '</td>' +
            '<td class="col-fee num">' + esc(fmtMoney(r._fee)) + '</td>' +
            '<td class="col-status"><span class="pill ' + statusClass(r._status) + '">' + esc(r._status) + '</span></td>' +
          '</tr>';
      }).join('');
    }

    el.footInfo.textContent = total === 0
      ? 'Showing 0–0 of 0'
      : 'Showing ' + (start + 1) + '–' + end + ' of ' + total;
    el.prevBtn.disabled = state.page <= 1;
    el.nextBtn.disabled = state.page >= pages;
    updateSortIndicators();
  }

  function showState(kind, message) {
    el.tableScroll.hidden = true;
    el.cardList.hidden = true;
    el.tableState.hidden = false;
    el.stateInner.className = 'state-inner ' + kind;
    if (kind === 'loading') {
      el.stateInner.innerHTML =
        '<div class="skeleton" aria-hidden="true">' +
          '<div class="sk-line sk-w60"></div>' +
          '<div class="sk-line sk-w90"></div>' +
          '<div class="sk-line sk-w80"></div>' +
          '<div class="sk-line sk-w70"></div>' +
          '<div class="sk-line sk-w85"></div>' +
        '</div>' +
        '<span class="state-text">Loading payments…</span>';
    } else if (kind === 'error') {
      el.stateInner.innerHTML =
        '<span class="state-icon" aria-hidden="true">!</span>' +
        '<span class="state-text">' + esc(message || 'Something went wrong loading payments.') + '</span>' +
        '<button type="button" class="btn btn-primary" data-retry>Try again</button>';
      var btn = el.stateInner.querySelector('[data-retry]');
      if (btn) btn.addEventListener('click', loadData);
    } else {
      el.stateInner.innerHTML =
        '<span class="state-icon" aria-hidden="true">∅</span>' +
        '<span class="state-text">' + esc(message || 'No payments match your filters.') + '</span>';
    }
  }

  function hideState() {
    el.tableState.hidden = true;
  }

  function render() {
    var filtered = applyFilters(state.records);
    if (state.records.length === 0) {
      showState('empty', 'No payment data available.');
      el.footInfo.textContent = 'Showing 0–0 of 0';
      el.prevBtn.disabled = true;
      el.nextBtn.disabled = true;
      return;
    }
    if (filtered.length === 0) {
      showState('empty', 'No payments match your filters.');
      el.footInfo.textContent = 'Showing 0–0 of 0';
      el.prevBtn.disabled = true;
      el.nextBtn.disabled = true;
      return;
    }
    hideState();
    renderTable(filtered);
  }

  // ---- side panel ----------------------------------------------------------

  function openPanel(sid) {
    var recs = state.records.filter(function (r) { return str(r.supporter_id) === str(sid); });
    if (recs.length === 0) return;
    var first = recs[0];
    var name = toBool(first.anonymous_donation) ? 'Anonymous' : (str(first.supporter_name) || 'Anonymous');

    var lifetime = 0;
    recs.forEach(function (r) {
      if (toBool(r.payment_successful) && !toBool(r.refund)) lifetime += r._amount;
    });

    var payments = recs.slice().sort(function (a, b) {
      var da = a._date, db = b._date;
      if (da && db && da.getTime() !== db.getTime()) return da.getTime() < db.getTime() ? 1 : -1;
      return b._amount - a._amount;
    });

    var rowsHtml = payments.map(function (r) {
      return '' +
        '<tr>' +
          '<td class="pp-date">' + esc(fmtDate(r.payment_at)) + '</td>' +
          '<td class="pp-project">' + esc(str(r.project) || '—') + '</td>' +
          '<td class="pp-amount num">' + esc(fmtMoney(r._amount)) + '</td>' +
        '</tr>';
    }).join('');

    function field(label, value) {
      var v = (value === null || value === undefined || str(value) === '') ? '—' : str(value);
      return '<div class="pf"><dt>' + esc(label) + '</dt><dd>' + esc(v) + '</dd></div>';
    }

    var recurring = toBool(first.recurring_donor) ? 'Yes' : 'No';

    el.panelBody.innerHTML =
      '<div class="panel-lifetime">' +
        '<span class="pl-label">Lifetime total</span>' +
        '<span class="pl-value">' + esc(fmtMoney(lifetime)) + '</span>' +
        '<span class="pl-count">' + fmtInt(payments.length) + ' payment' + (payments.length === 1 ? '' : 's') + '</span>' +
      '</div>' +
      '<dl class="panel-fields">' +
        field('Email', first.email) +
        field('Mobile phone', first.mobile_phone) +
        field('Supporter type', first.supporter_type) +
        field('Acquisition date', first.acquisition_date) +
        field('Recurring donor', recurring) +
        field('Recurring status', first.recurring_donor_status) +
        field('Membership status', first.membership_status) +
      '</dl>' +
      '<h3 class="panel-subhead">Payments</h3>' +
      '<div class="panel-pay-scroll">' +
        '<table class="panel-pay-table">' +
          '<thead><tr><th scope="col">Date</th><th scope="col">Project</th><th scope="col" class="num">Amount</th></tr></thead>' +
          '<tbody>' + rowsHtml + '</tbody>' +
        '</table>' +
      '</div>';

    el.panelName.textContent = name;
    state.panelSupporterId = sid;
    state.lastFocused = document.activeElement;
    el.panelBackdrop.hidden = false;
    el.sidePanel.hidden = false;
    el.sidePanel.setAttribute('aria-hidden', 'false');
    el.panelClose.focus();
  }

  function closePanel() {
    el.sidePanel.hidden = true;
    el.sidePanel.setAttribute('aria-hidden', 'true');
    el.panelBackdrop.hidden = true;
    state.panelSupporterId = null;
    if (state.lastFocused && typeof state.lastFocused.focus === 'function') {
      state.lastFocused.focus();
    }
  }

  // ---- events --------------------------------------------------------------

  function bindEvents() {
    el.searchInput.addEventListener('input', function () {
      state.filters.search = el.searchInput.value;
      state.page = 1;
      render();
    });

    el.yearSelect.addEventListener('change', function () {
      state.filters.year = el.yearSelect.value;
      state.page = 1;
      render();
    });

    el.methodSelect.addEventListener('change', function () {
      state.filters.method = el.methodSelect.value;
      state.page = 1;
      render();
    });

    el.successOnly.addEventListener('change', function () {
      state.filters.successOnly = el.successOnly.checked;
      state.page = 1;
      render();
    });

    el.prevBtn.addEventListener('click', function () {
      if (state.page > 1) { state.page -= 1; render(); }
    });
    el.nextBtn.addEventListener('click', function () {
      state.page += 1; render();
    });

    // sorting
    var ths = el.tableScroll.querySelectorAll('th.sortable');
    ths.forEach(function (th) {
      var key = th.getAttribute('data-key');
      var btn = th.querySelector('.sort-btn');
      if (!btn) return;
      btn.addEventListener('click', function () {
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortKey = key;
          state.sortDir = (key === 'amount_paid' || key === 'fee_amount' || key === 'payment_at') ? 'desc' : 'asc';
        }
        state.page = 1;
        render();
      });
    });

    // row / card selection (delegated)
    function selectHandler(e) {
      var target = e.target;
      var row = target.closest ? target.closest('[data-sid]') : null;
      if (row) openPanel(row.getAttribute('data-sid'));
    }
    el.tableBody.addEventListener('click', selectHandler);
    el.cardList.addEventListener('click', selectHandler);
    el.tableBody.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        var row = e.target.closest ? e.target.closest('[data-sid]') : null;
        if (row) { e.preventDefault(); openPanel(row.getAttribute('data-sid')); }
      }
    });
    el.cardList.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        var row = e.target.closest ? e.target.closest('[data-sid]') : null;
        if (row) { e.preventDefault(); openPanel(row.getAttribute('data-sid')); }
      }
    });

    // panel
    el.panelClose.addEventListener('click', closePanel);
    el.panelBackdrop.addEventListener('click', closePanel);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !el.sidePanel.hidden) closePanel();
    });

    // responsive re-render
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (state.records.length > 0) render();
      }, 150);
    });
  }

  // ---- load ----------------------------------------------------------------

  function loadData() {
    showState('loading');
    fetch('api/supporters', { headers: { 'Accept': 'application/json' } })
      .then(function (res) {
        if (res.status === 401) {
          showState('error', 'Your session has expired. Please sign in again.');
          return;
        }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.columns) || !Array.isArray(data.rows)) {
          throw new Error('Unexpected data shape');
        }
        var built = buildRecords(data.columns, data.rows);
        state.columns = data.columns;
        state.rows = data.rows;
        state.idx = built.idx;
        state.records = built.records;

        var kpi = computeKpis(state.records);
        renderHeader(kpi);
        renderKpis(kpi);

        // build selects from data
        var years = distinctValues(state.records, 'financial_year').sort(function (a, b) {
          return b.localeCompare(a);
        });
        populateSelect(el.yearSelect, years, 'All years');
        var methods = distinctValues(state.records, 'payment_method').sort(function (a, b) {
          return a.localeCompare(b);
        });
        populateSelect(el.methodSelect, methods, 'All methods');

        state.page = 1;
        render();
        window.knowiReportReady = true;
      })
      .catch(function (err) {
        showState('error', 'Could not load supporter data. Please try again.');
      });
  }

  function init() {
    cacheEls();
    bindEvents();
    loadData();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();