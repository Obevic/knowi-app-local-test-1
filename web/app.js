window.knowiReportReady = false;

(function () {
  'use strict';

  var PAGE_SIZE = 25;
  var MOBILE_BP = 700;

  var state = {
    columns: [],
    rows: [],
    idx: {},
    filtered: [],
    sortKey: 'payment_at',
    sortDir: 'desc',
    page: 1,
    search: '',
    fy: '',
    method: '',
    successOnly: true,
    selectedId: null,
    isMobile: false,
    loaded: false,
    error: false,
    activeTab: 'payments',
  };

  var el = {};
  var lastFocus = null;

  function $(id) { return document.getElementById(id); }

  function cacheEls() {
    el.app = $('app');
    el.navCount = $('navCount');
    el.viewerName = $('viewerName');
    el.subtitle = $('subtitle');
    el.previewPill = $('previewPill');
    el.kpiTotal = $('kpiTotal');
    el.kpiSupporters = $('kpiSupporters');
    el.kpiRecurring = $('kpiRecurring');
    el.kpiAvg = $('kpiAvg');
    el.searchInput = $('searchInput');
    el.fySelect = $('fySelect');
    el.methodSelect = $('methodSelect');
    el.successOnly = $('successOnly');
    el.tableWrap = $('tableWrap');
    el.tableLoading = $('tableLoading');
    el.tableError = $('tableError');
    el.tableEmpty = $('tableEmpty');
    el.tableScroll = $('tableScroll');
    el.payTable = $('payTable');
    el.thead = $('thead');
    el.tbody = $('tbody');
    el.cardList = $('cardList');
    el.tableFooter = $('tableFooter');
    el.prevBtn = $('prevBtn');
    el.nextBtn = $('nextBtn');
    el.pageInfo = $('pageInfo');
    el.sidePanel = $('sidePanel');
    el.panelBody = $('panelBody');
    el.panelCloseBtn = $('panelCloseBtn');
    el.panelClose = $('panelClose');
    el.tabBar = $('tabBar');
    el.tabPayments = $('tabPayments');
    el.tabProjects = $('tabProjects');
    el.tabRecurring = $('tabRecurring');
    el.tabLapsed = $('tabLapsed');
    el.projectsTable = $('projectsTable');
    el.projectsEmpty = $('projectsEmpty');
    el.projectsLoading = $('projectsLoading');
    el.projectsTbody = $('projectsTbody');
    el.recurringTotal = $('recurringTotal');
    el.recurringTable = $('recurringTable');
    el.recurringEmpty = $('recurringEmpty');
    el.recurringLoading = $('recurringLoading');
    el.recurringTbody = $('recurringTbody');
    el.lapsedTable = $('lapsedTable');
    el.lapsedEmpty = $('lapsedEmpty');
    el.lapsedLoading = $('lapsedLoading');
    el.lapsedTbody = $('lapsedTbody');
    el.copyEmailsBtn = $('copyEmailsBtn');
  }

  function isMobile() { return window.innerWidth < MOBILE_BP; }

  function toBool(v) {
    if (v === true || v === false) return v;
    if (typeof v === 'string') {
      var s = v.trim().toLowerCase();
      return s === 'true' || s === '1' || s === 'yes' || s === 'y';
    }
    if (typeof v === 'number') return v !== 0;
    return false;
  }

  function toNum(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (typeof v === 'string') {
      var s = v.replace(/[^0-9.\-]/g, '');
      if (s === '' || s === '-' || s === '.') return 0;
      var n = parseFloat(s);
      return isFinite(n) ? n : 0;
    }
    return 0;
  }

  function fmtMoney(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtInt(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Math.round(n).toLocaleString('en-US');
  }

  function parseDate(v) {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    if (typeof v === 'number') {
      var d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    }
    var s = String(v).trim();
    if (!s) return null;
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      var dd = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return isNaN(dd.getTime()) ? null : dd;
    }
    var d2 = new Date(s);
    return isNaN(d2.getTime()) ? null : d2;
  }

  function fmtDate(v) {
    var d = parseDate(v);
    if (!d) return '—';
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return dd + '/' + mm + '/' + d.getFullYear();
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
    return toBool(r.anonymous_donation) ? 'Anonymous' : (r.supporter_name || '—');
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sortVal(r, key) {
    if (key === 'status') return statusOf(r);
    if (key === 'amount_paid' || key === 'fee_amount') return toNum(r[key]);
    if (key === 'payment_at') {
      var d = parseDate(r.payment_at);
      return d ? d.getTime() : 0;
    }
    var v = r[key];
    if (v === null || v === undefined) return '';
    return String(v).toLowerCase();
  }

  function applyFilters() {
    var q = state.search.trim().toLowerCase();
    var out = [];
    for (var i = 0; i < state.rows.length; i++) {
      var r = state.rows[i];
      if (state.successOnly && !toBool(r.payment_successful)) continue;
      if (state.fy && String(r.financial_year || '') !== state.fy) continue;
      if (state.method && String(r.payment_method || '') !== state.method) continue;
      if (q) {
        var hay = (String(r.supporter_name || '') + ' ' +
                   String(r.email || '') + ' ' +
                   String(r.receipt_number || '')).toLowerCase();
        if (hay.indexOf(q) === -1) continue;
      }
      out.push(r);
    }
    state.filtered = out;
  }

  function sortRows(rows) {
    var key = state.sortKey, dir = state.sortDir;
    rows.sort(function (a, b) {
      var av = sortVal(a, key), bv = sortVal(b, key);
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  function computeKPIs() {
    var total = 0, successCount = 0;
    var supporters = new Set(), recurring = new Set();
    for (var i = 0; i < state.rows.length; i++) {
      var r = state.rows[i];
      if (r.supporter_id != null && r.supporter_id !== '') supporters.add(String(r.supporter_id));
      if (toBool(r.recurring_donor) && r.supporter_id != null && r.supporter_id !== '') recurring.add(String(r.supporter_id));
      if (toBool(r.payment_successful) && !toBool(r.refund)) {
        total += toNum(r.amount_paid);
        successCount++;
      }
    }
    el.kpiTotal.textContent = fmtMoney(total);
    el.kpiSupporters.textContent = fmtInt(supporters.size);
    el.kpiRecurring.textContent = fmtInt(recurring.size);
    el.kpiAvg.textContent = successCount > 0 ? fmtMoney(total / successCount) : '—';
  }

  function dateRange() {
    var min = null, max = null;
    for (var i = 0; i < state.rows.length; i++) {
      var d = parseDate(state.rows[i].payment_at);
      if (!d) continue;
      if (!min || d < min) min = d;
      if (!max || d > max) max = d;
    }
    if (!min || !max) return null;
    return { min: min, max: max };
  }

  function updateSubtitle() {
    var range = dateRange();
    if (range) {
      el.subtitle.textContent = 'Payment history from ' + fmtDate(range.min) + ' to ' + fmtDate(range.max);
    } else {
      el.subtitle.textContent = 'No payment history available.';
    }
  }

  function buildSelectOptions() {
    var fySet = new Set(), methodSet = new Set();
    for (var i = 0; i < state.rows.length; i++) {
      var r = state.rows[i];
      if (r.financial_year != null && r.financial_year !== '') fySet.add(String(r.financial_year));
      if (r.payment_method != null && r.payment_method !== '') methodSet.add(String(r.payment_method));
    }
    var fys = Array.from(fySet).sort(function (a, b) { return b.localeCompare(a); });
    var methods = Array.from(methodSet).sort();
    el.fySelect.innerHTML = '<option value="">All years</option>';
    methods.forEach(function (m) {
      var o = document.createElement('option');
      o.value = m;
      o.textContent = m;
      el.methodSelect.appendChild(o);
    });
    fys.forEach(function (f) {
      var o = document.createElement('option');
      o.value = f;
      o.textContent = f;
      el.fySelect.appendChild(o);
    });
  }

  function updateSortIndicators() {
    var ths = el.thead.querySelectorAll('th.sortable');
    for (var i = 0; i < ths.length; i++) {
      var th = ths[i];
      if (th.getAttribute('data-key') === state.sortKey) {
        th.setAttribute('aria-sort', state.sortDir === 'asc' ? 'ascending' : 'descending');
      } else {
        th.removeAttribute('aria-sort');
      }
    }
  }

  function renderTable() {
    var rows = state.filtered;
    var total = rows.length;
    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    if (state.page < 1) state.page = 1;
    var start = (state.page - 1) * PAGE_SIZE;
    var end = Math.min(start + PAGE_SIZE, total);
    var slice = rows.slice(start, end);

    var frag = document.createDocumentFragment();
    for (var i = 0; i < slice.length; i++) {
      var r = slice[i];
      var tr = document.createElement('tr');
      tr.className = 'pay-row';
      tr.setAttribute('tabindex', '0');
      tr.setAttribute('role', 'button');
      tr.setAttribute('aria-label', 'View ' + supporterDisplay(r));
      tr.dataset.id = String(r.supporter_id == null ? '' : r.supporter_id);
      tr.innerHTML =
        '<td class="c-date">' + esc(fmtDate(r.payment_at)) + '</td>' +
        '<td class="c-supporter">' + esc(supporterDisplay(r)) + '</td>' +
        '<td class="c-project">' + esc(r.project || '—') + '</td>' +
        '<td class="c-method">' + esc(r.payment_method || '—') + '</td>' +
        '<td class="c-amount num">' + esc(fmtMoney(toNum(r.amount_paid))) + '</td>' +
        '<td class="c-fee num">' + esc(fmtMoney(toNum(r.fee_amount))) + '</td>' +
        '<td class="c-status"><span class="pill ' + statusClass(statusOf(r)) + '">' + esc(statusOf(r)) + '</span></td>';
      frag.appendChild(tr);
    }
    el.tbody.innerHTML = '';
    el.tbody.appendChild(frag);

    el.pageInfo.textContent = 'Showing ' + (total === 0 ? 0 : start + 1) + '–' + end + ' of ' + total;
    el.prevBtn.disabled = state.page <= 1;
    el.nextBtn.disabled = state.page >= pages;
  }

  function renderCards() {
    var rows = state.filtered;
    var total = rows.length;
    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    if (state.page < 1) state.page = 1;
    var start = (state.page - 1) * PAGE_SIZE;
    var end = Math.min(start + PAGE_SIZE, total);
    var slice = rows.slice(start, end);

    var frag = document.createDocumentFragment();
    for (var i = 0; i < slice.length; i++) {
      var r = slice[i];
      var card = document.createElement('div');
      card.className = 'pay-card';
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', 'View ' + supporterDisplay(r));
      card.dataset.id = String(r.supporter_id == null ? '' : r.supporter_id);
      card.innerHTML =
        '<div class="card-top">' +
          '<span class="card-name">' + esc(supporterDisplay(r)) + '</span>' +
          '<span class="pill ' + statusClass(statusOf(r)) + '">' + esc(statusOf(r)) + '</span>' +
        '</div>' +
        '<div class="card-date">' + esc(fmtDate(r.payment_at)) + '</div>' +
        '<div class="card-project">' + esc(r.project || '—') + '</div>' +
        '<div class="card-meta">' +
          '<span class="card-method">' + esc(r.payment_method || '—') + '</span>' +
          '<span class="card-amount">' + esc(fmtMoney(toNum(r.amount_paid))) + '</span>' +
        '</div>';
      frag.appendChild(card);
    }
    el.cardList.innerHTML = '';
    el.cardList.appendChild(frag);

    el.pageInfo.textContent = 'Showing ' + (total === 0 ? 0 : start + 1) + '–' + end + ' of ' + total;
    el.prevBtn.disabled = state.page <= 1;
    el.nextBtn.disabled = state.page >= pages;
  }

  function render() {
    if (!state.loaded) return;
    if (state.error) {
      el.tableLoading.hidden = true;
      el.tableEmpty.hidden = true;
      el.tableScroll.hidden = true;
      el.cardList.hidden = true;
      el.tableFooter.hidden = true;
      el.tableError.hidden = false;
      return;
    }
    el.tableLoading.hidden = true;
    el.tableError.hidden = true;

    if (state.filtered.length === 0) {
      el.tableScroll.hidden = true;
      el.cardList.hidden = true;
      el.tableFooter.hidden = true;
      el.tableEmpty.hidden = false;
      return;
    }

    el.tableEmpty.hidden = true;
    el.tableFooter.hidden = false;
    if (state.isMobile) {
      el.tableScroll.hidden = true;
      el.cardList.hidden = false;
      renderCards();
    } else {
      el.cardList.hidden = true;
      el.tableScroll.hidden = false;
      renderTable();
    }
  }

  function refresh() {
    applyFilters();
    sortRows(state.filtered);
    state.page = 1;
    render();
  }

  function openPanel(id) {
    var recs = [];
    for (var i = 0; i < state.rows.length; i++) {
      if (String(state.rows[i].supporter_id == null ? '' : state.rows[i].supporter_id) === String(id)) recs.push(state.rows[i]);
    }
    if (recs.length === 0) return;
    var r = recs[0];
    var lifetime = 0;
    for (var j = 0; j < recs.length; j++) {
      if (toBool(recs[j].payment_successful) && !toBool(recs[j].refund)) lifetime += toNum(recs[j].amount_paid);
    }
    recs.sort(function (a, b) {
      var da = parseDate(a.payment_at), db = parseDate(b.payment_at);
      var ta = da ? da.getTime() : 0, tb = db ? db.getTime() : 0;
      return tb - ta;
    });

    var name = toBool(r.anonymous_donation) ? 'Anonymous' : (r.supporter_name || 'Supporter');
    var rowsHtml = '';
    for (var k = 0; k < recs.length; k++) {
      var p = recs[k];
      rowsHtml +=
        '<div class="pay-item">' +
          '<span class="pay-item-date">' + esc(fmtDate(p.payment_at)) + '</span>' +
          '<span class="pay-item-project">' + esc(p.project || '—') + '</span>' +
          '<span class="pay-item-amount">' + esc(fmtMoney(toNum(p.amount_paid))) + '</span>' +
        '</div>';
    }

    var fields = [
      ['Email', r.email],
      ['Mobile', r.mobile_phone],
      ['Type', r.supporter_type],
      ['Acquired', r.acquisition_date ? fmtDate(r.acquisition_date) : ''],
      ['Recurring', r.recurring_donor_status],
      ['Membership', r.membership_status],
    ];
    var fieldsHtml = '';
    for (var f = 0; f < fields.length; f++) {
      var val = fields[f][1];
      if (val === null || val === undefined || val === '') continue;
      fieldsHtml +=
        '<div class="field">' +
          '<span class="field-label">' + esc(fields[f][0]) + '</span>' +
          '<span class="field-value">' + esc(val) + '</span>' +
        '</div>';
    }

    el.panelBody.innerHTML =
      '<div class="panel-name">' + esc(name) + '</div>' +
      '<div class="panel-lifetime">' +
        '<span class="panel-lifetime-label">Lifetime total</span>' +
        '<span class="panel-lifetime-value">' + esc(fmtMoney(lifetime)) + '</span>' +
      '</div>' +
      (fieldsHtml ? '<div class="panel-fields">' + fieldsHtml + '</div>' : '') +
      '<div class="panel-payments">' +
        '<h3 class="panel-subhead">Payments (' + recs.length + ')</h3>' +
        '<div class="pay-list">' + rowsHtml + '</div>' +
      '</div>';

    state.selectedId = String(id);
    lastFocus = document.activeElement;
    el.sidePanel.hidden = false;
    el.panelClose.hidden = false;
    el.sidePanel.classList.add('is-open');
    document.body.classList.add('panel-open');
    el.panelCloseBtn.focus();
  }

  function closePanel() {
    el.sidePanel.hidden = true;
    el.panelClose.hidden = true;
    el.sidePanel.classList.remove('is-open');
    document.body.classList.remove('panel-open');
    state.selectedId = null;
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }

  function handleResize() {
    var m = isMobile();
    if (m !== state.isMobile) {
      state.isMobile = m;
      render();
    }
  }

  function loadData() {
    el.tableLoading.hidden = false;
    el.tableError.hidden = true;
    el.tableEmpty.hidden = true;
    el.tableScroll.hidden = true;
    el.cardList.hidden = true;
    el.tableFooter.hidden = true;
    el.subtitle.textContent = 'Loading payment history…';
    el.previewPill.hidden = true;

    fetch('api/supporters', { headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (res.status === 401) {
          state.error = true;
          state.loaded = true;
          el.tableError.querySelector('.state-text').textContent = 'Your session has expired. Please sign in again.';
          render();
          window.knowiReportReady = true;
          return;
        }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.columns) || !Array.isArray(data.rows)) throw new Error('Bad payload');
        state.columns = data.columns;
        state.rows = data.rows.map(function (row) {
          var o = {};
          for (var i = 0; i < data.columns.length; i++) o[data.columns[i]] = row[i];
          return o;
        });
        state.idx = {};
        state.rows.forEach(function (r) {
          var id = String(r.supporter_id == null ? '' : r.supporter_id);
          if (!state.idx[id]) state.idx[id] = [];
          state.idx[id].push(r);
        });
        state.loaded = true;
        state.error = false;
        state.isMobile = isMobile();
        el.navCount.textContent = fmtInt(state.rows.length);
        if (state.rows.length === 0) el.previewPill.hidden = false;
        buildSelectOptions();
        computeKPIs();
        updateSubtitle();
        refresh();
        renderProjects();
        renderRecurring();
        renderLapsed();
        window.knowiReportReady = true;
      })
      .catch(function () {
        state.error = true;
        state.loaded = true;
        render();
        window.knowiReportReady = true;
      });
  }

  function bindEvents() {
    el.searchInput.addEventListener('input', function () {
      state.search = el.searchInput.value;
      refresh();
    });
    el.fySelect.addEventListener('change', function () {
      state.fy = el.fySelect.value;
      refresh();
    });
    el.methodSelect.addEventListener('change', function () {
      state.method = el.methodSelect.value;
      refresh();
    });
    el.successOnly.addEventListener('change', function () {
      state.successOnly = el.successOnly.checked;
      refresh();
    });

    el.thead.addEventListener('click', function (e) {
      var btn = e.target.closest('.th-btn');
      if (!btn) return;
      var th = btn.closest('th');
      var key = th.getAttribute('data-key');
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = key;
        state.sortDir = (key === 'amount_paid' || key === 'fee_amount' || key === 'payment_at') ? 'desc' : 'asc';
      }
      updateSortIndicators();
      refresh();
    });

    el.prevBtn.addEventListener('click', function () {
      if (state.page > 1) { state.page--; render(); }
    });
    el.nextBtn.addEventListener('click', function () {
      state.page++; render();
    });

    el.tableWrap.addEventListener('click', function (e) {
      if (e.target.closest('[data-retry]')) { loadData(); return; }
      var row = e.target.closest('.pay-row, .pay-card');
      if (row) openPanel(row.dataset.id);
    });
    el.tableWrap.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var row = e.target.closest('.pay-row, .pay-card');
      if (row) { e.preventDefault(); openPanel(row.dataset.id); }
    });

    el.panelCloseBtn.addEventListener('click', closePanel);
    el.panelClose.addEventListener('click', closePanel);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !el.sidePanel.hidden) closePanel();
    });

    window.addEventListener('resize', handleResize);

    // Tab switching
    el.tabBar.addEventListener('click', function (e) {
      var btn = e.target.closest('.tab-btn');
      if (!btn) return;
      var tab = btn.getAttribute('data-tab');
      if (tab === state.activeTab) return;
      state.activeTab = tab;
      var tabs = el.tabBar.querySelectorAll('.tab-btn');
      for (var i = 0; i < tabs.length; i++) {
        var t = tabs[i];
        var isActive = t.getAttribute('data-tab') === tab;
        t.classList.toggle('is-active', isActive);
        t.setAttribute('aria-selected', isActive ? 'true' : 'false');
      }
      el.tabPayments.hidden = tab !== 'payments';
      el.tabProjects.hidden = tab !== 'projects';
      el.tabRecurring.hidden = tab !== 'recurring';
      el.tabLapsed.hidden = tab !== 'lapsed';
    });

    // Copy emails for lapsed members
    el.copyEmailsBtn.addEventListener('click', function () {
      var emails = [];
      var seen = new Set();
      for (var i = 0; i < state.rows.length; i++) {
        var r = state.rows[i];
        if (toBool(r.has_membership) && !toBool(r.current_member)) {
          var email = r.email;
          if (email && !seen.has(email)) {
            seen.add(email);
            emails.push(email);
          }
        }
      }
      if (emails.length === 0) return;
      var text = emails.join('; ');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          el.copyEmailsBtn.textContent = 'Copied!';
          setTimeout(function () {
            el.copyEmailsBtn.innerHTML =
              '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
              '<rect x="9" y="9" width="13" height="13" rx="2"></rect>' +
              '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>' +
              '</svg> Copy emails';
          }, 2000);
        });
      } else {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
        el.copyEmailsBtn.textContent = 'Copied!';
        setTimeout(function () {
          el.copyEmailsBtn.innerHTML =
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<rect x="9" y="9" width="13" height="13" rx="2"></rect>' +
            '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>' +
            '</svg> Copy emails';
        }, 2000);
      }
    });
  }

  function renderProjects() {
    if (!state.loaded) return;
    if (state.error) {
      el.projectsLoading.hidden = true;
      el.projectsEmpty.hidden = true;
      el.projectsTable.hidden = true;
      return;
    }
    el.projectsLoading.hidden = true;

    var projectMap = {};
    var totalRaised = 0;
    for (var i = 0; i < state.rows.length; i++) {
      var r = state.rows[i];
      if (!toBool(r.payment_successful) || toBool(r.refund)) continue;
      var proj = r.project || '—';
      if (!projectMap[proj]) {
        projectMap[proj] = { total: 0, gifts: 0, supporters: new Set(), maxGift: 0 };
      }
      var amt = toNum(r.amount_paid);
      projectMap[proj].total += amt;
      projectMap[proj].gifts++;
      if (r.supporter_id != null && r.supporter_id !== '') projectMap[proj].supporters.add(String(r.supporter_id));
      if (amt > projectMap[proj].maxGift) projectMap[proj].maxGift = amt;
      totalRaised += amt;
    }

    var projects = [];
    for (var key in projectMap) {
      if (!projectMap.hasOwnProperty(key)) continue;
      projects.push({
        name: key,
        total: projectMap[key].total,
        gifts: projectMap[key].gifts,
        supporters: projectMap[key].supporters.size,
        maxGift: projectMap[key].maxGift,
        share: totalRaised > 0 ? (projectMap[key].total / totalRaised) * 100 : 0,
      });
    }
    projects.sort(function (a, b) { return b.total - a.total; });

    if (projects.length === 0) {
      el.projectsEmpty.hidden = false;
      el.projectsTable.hidden = true;
      return;
    }

    el.projectsEmpty.hidden = true;
    el.projectsTable.hidden = false;

    var frag = document.createDocumentFragment();
    for (var j = 0; j < projects.length; j++) {
      var p = projects[j];
      var tr = document.createElement('tr');
      var barWidth = Math.min(100, p.share).toFixed(1);
      tr.innerHTML =
        '<td class="c-project">' + esc(p.name) + '</td>' +
        '<td class="num">' + esc(fmtMoney(p.total)) + '</td>' +
        '<td class="num">' + esc(fmtInt(p.gifts)) + '</td>' +
        '<td class="num">' + esc(fmtInt(p.supporters)) + '</td>' +
        '<td class="num">' + esc(fmtMoney(p.maxGift)) + '</td>' +
        '<td class="c-share">' +
          '<div class="bar-track">' +
            '<div class="bar-fill" style="width:' + barWidth + '%"></div>' +
          '</div>' +
          '<span class="bar-label">' + p.share.toFixed(1) + '%</span>' +
        '</td>';
      frag.appendChild(tr);
    }
    el.projectsTbody.innerHTML = '';
    el.projectsTbody.appendChild(frag);
  }

  function renderRecurring() {
    if (!state.loaded) return;
    if (state.error) {
      el.recurringLoading.hidden = true;
      el.recurringEmpty.hidden = true;
      el.recurringTable.hidden = true;
      return;
    }
    el.recurringLoading.hidden = true;

    var recurringMap = {};
    for (var i = 0; i < state.rows.length; i++) {
      var r = state.rows[i];
      if (!toBool(r.recurring_donor)) continue;
      var id = String(r.supporter_id == null ? '' : r.supporter_id);
      if (!id) continue;
      if (!recurringMap[id]) {
        recurringMap[id] = {
          name: r.supporter_name || '—',
          frequency: r.recurring_donation_frequency || '',
          amount: toNum(r.recurring_donation_amount),
          startDate: r.recurring_donation_start_date || '',
        };
      }
    }

    var donors = [];
    var annualisedTotal = 0;
    for (var key in recurringMap) {
      if (!recurringMap.hasOwnProperty(key)) continue;
      var d = recurringMap[key];
      var freq = String(d.frequency).toLowerCase();
      var annualised;
      if (freq === 'monthly') annualised = d.amount * 12;
      else if (freq === 'quarterly') annualised = d.amount * 4;
      else if (freq === 'yearly') annualised = d.amount;
      else annualised = null;
      if (annualised !== null) annualisedTotal += annualised;
      donors.push({
        name: d.name,
        frequency: d.frequency,
        amount: d.amount,
        startDate: d.startDate,
        annualised: annualised,
      });
    }

    el.recurringTotal.textContent = fmtMoney(annualisedTotal);

    if (donors.length === 0) {
      el.recurringEmpty.hidden = false;
      el.recurringTable.hidden = true;
      return;
    }

    el.recurringEmpty.hidden = true;
    el.recurringTable.hidden = false;

    var frag = document.createDocumentFragment();
    for (var j = 0; j < donors.length; j++) {
      var d = donors[j];
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="c-supporter">' + esc(d.name) + '</td>' +
        '<td class="c-frequency">' + esc(d.frequency || '—') + '</td>' +
        '<td class="num">' + esc(fmtMoney(d.amount)) + '</td>' +
        '<td class="c-date">' + esc(d.startDate ? fmtDate(d.startDate) : '—') + '</td>' +
        '<td class="num">' + (d.annualised !== null ? esc(fmtMoney(d.annualised)) : '–') + '</td>';
      frag.appendChild(tr);
    }
    el.recurringTbody.innerHTML = '';
    el.recurringTbody.appendChild(frag);
  }

  function renderLapsed() {
    if (!state.loaded) return;
    if (state.error) {
      el.lapsedLoading.hidden = true;
      el.lapsedEmpty.hidden = true;
      el.lapsedTable.hidden = true;
      return;
    }
    el.lapsedLoading.hidden = true;

    var lapsedMap = {};
    for (var i = 0; i < state.rows.length; i++) {
      var r = state.rows[i];
      if (!toBool(r.has_membership) || toBool(r.current_member)) continue;
      var id = String(r.supporter_id == null ? '' : r.supporter_id);
      if (!id) continue;
      if (!lapsedMap[id]) {
        lapsedMap[id] = {
          name: r.supporter_name || '—',
          email: r.email || '',
          membershipType: r.membership_type || '',
          expiryDate: r.membership_expiry_date || '',
        };
      }
    }

    var lapsed = [];
    for (var key in lapsedMap) {
      if (!lapsedMap.hasOwnProperty(key)) continue;
      var d = lapsedMap[key];
      var expiry = parseDate(d.expiryDate);
      var daysSince = null;
      if (expiry) {
        var now = new Date();
        daysSince = Math.floor((now.getTime() - expiry.getTime()) / (1000 * 60 * 60 * 24));
      }
      lapsed.push({
        name: d.name,
        email: d.email,
        membershipType: d.membershipType,
        expiryDate: d.expiryDate,
        expiryTime: expiry ? expiry.getTime() : 0,
        daysSince: daysSince,
      });
    }
    lapsed.sort(function (a, b) { return a.expiryTime - b.expiryTime; });

    if (lapsed.length === 0) {
      el.lapsedEmpty.hidden = false;
      el.lapsedTable.hidden = true;
      return;
    }

    el.lapsedEmpty.hidden = true;
    el.lapsedTable.hidden = false;

    var frag = document.createDocumentFragment();
    for (var j = 0; j < lapsed.length; j++) {
      var d = lapsed[j];
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="c-supporter">' + esc(d.name) + '</td>' +
        '<td class="c-email">' + esc(d.email || '—') + '</td>' +
        '<td class="c-membership-type">' + esc(d.membershipType || '—') + '</td>' +
        '<td class="c-date">' + esc(d.expiryDate ? fmtDate(d.expiryDate) : '—') + '</td>' +
        '<td class="num">' + (d.daysSince !== null ? esc(fmtInt(d.daysSince)) : '—') + '</td>';
      frag.appendChild(tr);
    }
    el.lapsedTbody.innerHTML = '';
    el.lapsedTbody.appendChild(frag);
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