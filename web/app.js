window.knowiReportReady = false;

(function () {
  'use strict';

  var CURRENCY = 'AUD';
  var PAGE_SIZE = 25;
  var MOBILE_BP = 700;

  var state = {
    rows: [],
    columns: [],
    search: '',
    financialYear: '',
    paymentMethod: '',
    successfulOnly: true,
    sortField: 'date',
    sortDir: 'desc',
    page: 1,
    selectedSupporterId: null,
    loading: true,
    error: null,
    activeTab: 'payments'
  };

  var el = {};
  var moneyFmt;
  var intFmt;
  var lastFocused = null;

  /* ---------- helpers ---------- */

  function $(id) { return document.getElementById(id); }

  function cacheEls() {
    el.dateRange = $('dateRange');
    el.previewPill = $('previewPill');
    el.navCount = $('navCount');
    el.viewerName = $('viewerName');
    el.kpiTotal = $('kpiTotal');
    el.kpiSupporters = $('kpiSupporters');
    el.kpiRecurring = $('kpiRecurring');
    el.kpiAvg = $('kpiAvg');
    el.searchInput = $('searchInput');
    el.financialYearSelect = $('financialYearSelect');
    el.paymentMethodSelect = $('paymentMethodSelect');
    el.successfulOnly = $('successfulOnly');
    el.tableMeta = $('tableMeta');
    el.tableScroll = $('tableScroll');
    el.tableBody = $('tableBody');
    el.cardList = $('cardList');
    el.showingMeta = $('showingMeta');
    el.prevBtn = $('prevBtn');
    el.nextBtn = $('nextBtn');
    el.scrim = $('scrim');
    el.sidePanel = $('sidePanel');
    el.panelName = $('panelName');
    el.panelBody = $('panelBody');
    el.panelClose = $('panelClose');

    // Tab elements
    el.tabBtnPayments = $('tabBtnPayments');
    el.tabBtnProjects = $('tabBtnProjects');
    el.tabBtnRecurring = $('tabBtnRecurring');
    el.tabBtnLapsed = $('tabBtnLapsed');
    el.tabPayments = $('tab-payments');
    el.tabProjects = $('tab-projects');
    el.tabRecurring = $('tab-recurring');
    el.tabLapsed = $('tab-lapsed');

    // Projects tab
    el.projectsState = $('projectsState');
    el.projectsCard = $('projectsCard');
    el.projectsMeta = $('projectsMeta');
    el.projectsBody = $('projectsBody');

    // Recurring tab
    el.recurringState = $('recurringState');
    el.recurringCard = $('recurringCard');
    el.recurringMeta = $('recurringMeta');
    el.recurringTotal = $('recurringTotal');
    el.recurringBody = $('recurringBody');

    // Lapsed tab
    el.lapsedState = $('lapsedState');
    el.lapsedCard = $('lapsedCard');
    el.copyEmailsBtn = $('copyEmailsBtn');
    el.lapsedBody = $('lapsedBody');
  }

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
      var n = parseFloat(v.replace(/[^0-9.\-]/g, ''));
      return isNaN(n) ? 0 : n;
    }
    return 0;
  }

  function str(v) { return v == null ? '' : String(v); }

  function fmtDate(v) {
    if (!v) return '—';
    var d = new Date(v);
    if (isNaN(d.getTime())) return str(v);
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var yyyy = d.getFullYear();
    return dd + '/' + mm + '/' + yyyy;
  }

  function fmtMoney(v) {
    if (v == null || isNaN(v)) return '—';
    return moneyFmt.format(v);
  }

  function fmtInt(v) {
    if (v == null || isNaN(v)) return '—';
    return intFmt.format(v);
  }

  function statusOf(r) {
    if (toBool(r.refund)) return 'Refunded';
    if (toBool(r.payment_successful)) return 'Paid';
    return 'Failed';
  }

  function supporterDisplay(r) {
    return toBool(r.anonymous_donation) ? 'Anonymous' : (str(r.supporter_name) || '—');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isMobile() { return window.innerWidth < MOBILE_BP; }

  /* ---------- data ---------- */

  function zipRows(columns, rows) {
    return rows.map(function (row) {
      var obj = {};
      for (var i = 0; i < columns.length; i++) obj[columns[i]] = row[i];
      return obj;
    });
  }

  function loadData() {
    state.loading = true;
    state.error = null;
    render();
    fetch('api/supporters', { headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (res.status === 401) {
          state.loading = false;
          state.error = { code: 401 };
          render();
          return;
        }
        return res.json().then(function (data) {
          if (!res.ok) throw new Error('Request failed');
          state.columns = data.columns || [];
          state.rows = zipRows(state.columns, data.rows || []);
          state.loading = false;
          state.error = null;
          buildFilters();
          render();
        });
      })
      .catch(function (err) {
        state.loading = false;
        state.error = { message: err.message || 'Could not load supporter data.' };
        render();
      });
  }

  /* ---------- derived data ---------- */

  function computeKpis() {
    var totalRaised = 0;
    var successfulCount = 0;
    var supporters = new Set();
    var recurring = new Set();
    state.rows.forEach(function (r) {
      if (r.supporter_id != null && r.supporter_id !== '') supporters.add(r.supporter_id);
      if (toBool(r.recurring_donor) && r.supporter_id != null && r.supporter_id !== '') recurring.add(r.supporter_id);
      if (toBool(r.payment_successful) && !toBool(r.refund)) {
        totalRaised += toNum(r.amount_paid);
        successfulCount += 1;
      }
    });
    return {
      totalRaised: totalRaised,
      supporters: supporters.size,
      recurring: recurring.size,
      avgGift: successfulCount ? totalRaised / successfulCount : 0
    };
  }

  function dateRange() {
    var min = null, max = null;
    state.rows.forEach(function (r) {
      if (!r.payment_at) return;
      var t = new Date(r.payment_at).getTime();
      if (isNaN(t)) return;
      if (min === null || t < min) min = t;
      if (max === null || t > max) max = t;
    });
    if (min === null || max === null) return null;
    return { min: new Date(min), max: new Date(max) };
  }

  function distinctValues(field) {
    var set = new Set();
    state.rows.forEach(function (r) {
      var v = r[field];
      if (v != null && v !== '') set.add(String(v));
    });
    return Array.from(set);
  }

  function buildFilters() {
    // Financial year: newest first + "All years"
    var years = distinctValues('financial_year').sort(function (a, b) {
      return String(b).localeCompare(String(a));
    });
    el.financialYearSelect.innerHTML = '<option value="">All years</option>';
    years.forEach(function (y) {
      var opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      el.financialYearSelect.appendChild(opt);
    });

    // Payment method
    var methods = distinctValues('payment_method').sort(function (a, b) {
      return a.localeCompare(b);
    });
    el.paymentMethodSelect.innerHTML = '<option value="">All methods</option>';
    methods.forEach(function (m) {
      var opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      el.paymentMethodSelect.appendChild(opt);
    });
  }

  function filteredRows() {
    var q = state.search.trim().toLowerCase();
    return state.rows.filter(function (r) {
      if (state.successfulOnly && !(toBool(r.payment_successful) && !toBool(r.refund))) return false;
      if (state.financialYear && str(r.financial_year) !== state.financialYear) return false;
      if (state.paymentMethod && str(r.payment_method) !== state.paymentMethod) return false;
      if (q) {
        var hay = (str(r.supporter_name) + ' ' + str(r.email) + ' ' + str(r.receipt_number)).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function sortValue(r, field) {
    switch (field) {
      case 'date': return new Date(r.payment_at).getTime() || 0;
      case 'supporter': return supporterDisplay(r).toLowerCase();
      case 'project': return str(r.project).toLowerCase();
      case 'method': return str(r.payment_method).toLowerCase();
      case 'amount': return toNum(r.amount_paid);
      case 'fee': return toNum(r.fee_amount);
      case 'status': return statusOf(r);
      default: return 0;
    }
  }

  function sortedRows(rows) {
    var dir = state.sortDir === 'asc' ? 1 : -1;
    var field = state.sortField;
    return rows.slice().sort(function (a, b) {
      var av = sortValue(a, field);
      var bv = sortValue(b, field);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  /* ---------- render ---------- */

  function render() {
    renderHeader();
    renderKpis();
    renderTable();
    renderPanel();
    renderProjects();
    renderRecurring();
    renderLapsed();
    updateResponsive();
    window.knowiReportReady = true;
  }

  function renderHeader() {
    if (state.error && state.error.code === 401) {
      el.dateRange.textContent = 'Your session has expired.';
      el.previewPill.hidden = true;
      el.navCount.textContent = '–';
      return;
    }
    if (state.loading) {
      el.dateRange.textContent = 'Loading payment dates…';
      el.previewPill.hidden = true;
      return;
    }
    if (state.rows.length === 0) {
      el.dateRange.textContent = 'No payment data available.';
      el.previewPill.hidden = false;
      el.navCount.textContent = '0';
      return;
    }
    el.previewPill.hidden = true;
    el.navCount.textContent = fmtInt(state.rows.length);
    var range = dateRange();
    if (range) {
      el.dateRange.textContent = 'Payments from ' + fmtDate(range.min) + ' to ' + fmtDate(range.max);
    } else {
      el.dateRange.textContent = 'Payment dates unavailable.';
    }
  }

  function renderKpis() {
    if (state.loading) {
      el.kpiTotal.textContent = '–';
      el.kpiSupporters.textContent = '–';
      el.kpiRecurring.textContent = '–';
      el.kpiAvg.textContent = '–';
      return;
    }
    if (state.error) {
      el.kpiTotal.textContent = '–';
      el.kpiSupporters.textContent = '–';
      el.kpiRecurring.textContent = '–';
      el.kpiAvg.textContent = '–';
      return;
    }
    var k = computeKpis();
    el.kpiTotal.textContent = fmtMoney(k.totalRaised);
    el.kpiSupporters.textContent = fmtInt(k.supporters);
    el.kpiRecurring.textContent = fmtInt(k.recurring);
    el.kpiAvg.textContent = fmtMoney(k.avgGift);
  }

  function renderTable() {
    // 401 session expired
    if (state.error && state.error.code === 401) {
      el.tableMeta.textContent = '';
      el.showingMeta.textContent = '';
      el.tableScroll.hidden = true;
      el.cardList.hidden = true;
      el.tableBody.innerHTML = '';
      el.cardList.innerHTML = '';
      var msg = document.createElement('div');
      msg.className = 'state-msg state-error';
      msg.innerHTML = 'Your session has expired. <a href="login">Sign in again</a> to continue.';
      el.tableScroll.parentNode.insertBefore(msg, el.tableScroll);
      if (el._sessionMsg) el._sessionMsg.remove();
      el._sessionMsg = msg;
      return;
    }
    if (el._sessionMsg) { el._sessionMsg.remove(); el._sessionMsg = null; }

    // loading
    if (state.loading) {
      el.tableMeta.textContent = 'Loading…';
      el.showingMeta.textContent = '';
      el.prevBtn.disabled = true;
      el.nextBtn.disabled = true;
      el.tableScroll.hidden = false;
      el.cardList.hidden = true;
      el.tableBody.innerHTML = skeletonRows(8);
      return;
    }

    // error
    if (state.error) {
      el.tableMeta.textContent = '';
      el.showingMeta.textContent = '';
      el.prevBtn.disabled = true;
      el.nextBtn.disabled = true;
      el.tableScroll.hidden = true;
      el.cardList.hidden = true;
      el.tableBody.innerHTML = '';
      el.cardList.innerHTML = '';
      var em = document.createElement('div');
      em.className = 'state-msg state-error';
      em.textContent = state.error.message || 'Something went wrong.';
      el.tableScroll.parentNode.insertBefore(em, el.tableScroll);
      if (el._errMsg) el._errMsg.remove();
      el._errMsg = em;
      return;
    }
    if (el._errMsg) { el._errMsg.remove(); el._errMsg = null; }

    var rows = sortedRows(filteredRows());
    var total = rows.length;
    var totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;
    if (state.page < 1) state.page = 1;
    var start = (state.page - 1) * PAGE_SIZE;
    var end = Math.min(start + PAGE_SIZE, total);
    var pageRows = rows.slice(start, end);

    el.tableMeta.textContent = total + ' payment' + (total === 1 ? '' : 's');

    if (total === 0) {
      el.showingMeta.textContent = 'No payments match your filters.';
      el.prevBtn.disabled = true;
      el.nextBtn.disabled = true;
      el.tableScroll.hidden = true;
      el.cardList.hidden = true;
      el.tableBody.innerHTML = '';
      el.cardList.innerHTML = '';
      var em2 = document.createElement('div');
      em2.className = 'state-msg state-empty';
      em2.textContent = 'No payments match your filters. Try clearing the search or changing a filter.';
      el.tableScroll.parentNode.insertBefore(em2, el.tableScroll);
      if (el._emptyMsg) el._emptyMsg.remove();
      el._emptyMsg = em2;
      return;
    }
    if (el._emptyMsg) { el._emptyMsg.remove(); el._emptyMsg = null; }

    el.showingMeta.textContent = 'Showing ' + (start + 1) + '–' + end + ' of ' + total;
    el.prevBtn.disabled = state.page <= 1;
    el.nextBtn.disabled = state.page >= totalPages;

    // render rows or cards
    if (isMobile()) {
      el.tableScroll.hidden = true;
      el.cardList.hidden = false;
      el.cardList.innerHTML = pageRows.map(function (r) { return cardHtml(r); }).join('');
    } else {
      el.tableScroll.hidden = false;
      el.cardList.hidden = true;
      el.tableBody.innerHTML = pageRows.map(function (r) { return rowHtml(r); }).join('');
    }

    updateSortIndicators();
  }

  function rowHtml(r) {
    var sid = str(r.supporter_id);
    var selected = state.selectedSupporterId === sid ? ' is-selected' : '';
    return '<tr class="pay-row' + selected + '" data-sid="' + escapeHtml(sid) + '" tabindex="0" role="button" aria-label="View ' + escapeHtml(supporterDisplay(r)) + '">' +
      '<td class="col-date">' + fmtDate(r.payment_at) + '</td>' +
      '<td class="col-supporter">' + escapeHtml(supporterDisplay(r)) + '</td>' +
      '<td class="col-project">' + escapeHtml(str(r.project) || '—') + '</td>' +
      '<td class="col-method">' + escapeHtml(str(r.payment_method) || '—') + '</td>' +
      '<td class="col-amount num">' + fmtMoney(r.amount_paid) + '</td>' +
      '<td class="col-fee num">' + fmtMoney(r.fee_amount) + '</td>' +
      '<td class="col-status"><span class="pill pill-' + statusOf(r).toLowerCase() + '">' + statusOf(r) + '</span></td>' +
      '</tr>';
  }

  function cardHtml(r) {
    var sid = str(r.supporter_id);
    var selected = state.selectedSupporterId === sid ? ' is-selected' : '';
    return '<div class="pay-card' + selected + '" data-sid="' + escapeHtml(sid) + '" tabindex="0" role="button" aria-label="View ' + escapeHtml(supporterDisplay(r)) + '">' +
      '<div class="card-top">' +
        '<span class="card-name">' + escapeHtml(supporterDisplay(r)) + '</span>' +
        '<span class="pill pill-' + statusOf(r).toLowerCase() + '">' + statusOf(r) + '</span>' +
      '</div>' +
      '<div class="card-mid">' +
        '<span class="card-date">' + fmtDate(r.payment_at) + '</span>' +
        '<span class="card-amount">' + fmtMoney(r.amount_paid) + '</span>' +
      '</div>' +
      '<div class="card-bot">' +
        '<span class="card-project">' + escapeHtml(str(r.project) || '—') + '</span>' +
        '<span class="card-method">' + escapeHtml(str(r.payment_method) || '—') + '</span>' +
      '</div>' +
      '</div>';
  }

  function skeletonRows(n) {
    var html = '';
    for (var i = 0; i < n; i++) {
      html += '<tr class="skeleton-row">' +
        '<td><span class="skel"></span></td>' +
        '<td><span class="skel skel-wide"></span></td>' +
        '<td><span class="skel"></span></td>' +
        '<td><span class="skel"></span></td>' +
        '<td class="num"><span class="skel"></span></td>' +
        '<td class="num"><span class="skel"></span></td>' +
        '<td><span class="skel skel-pill"></span></td>' +
        '</tr>';
    }
    return html;
  }

  function updateSortIndicators() {
    var ths = el.tableScroll.querySelectorAll('th.sortable');
    ths.forEach(function (th) {
      var field = th.getAttribute('data-sort');
      if (field === state.sortField) {
        th.setAttribute('aria-sort', state.sortDir === 'asc' ? 'ascending' : 'descending');
        var btn = th.querySelector('.sort-btn');
        if (btn) {
          btn.classList.add('is-active');
          btn.setAttribute('aria-label', btn.textContent.trim() + (state.sortDir === 'asc' ? ' ascending' : ' descending'));
        }
      } else {
        th.removeAttribute('aria-sort');
        var btn2 = th.querySelector('.sort-btn');
        if (btn2) {
          btn2.classList.remove('is-active');
          btn2.setAttribute('aria-label', btn2.textContent.trim());
        }
      }
    });
  }

  /* ---------- side panel ---------- */

  function renderPanel() {
    if (state.selectedSupporterId == null) {
      el.sidePanel.hidden = true;
      el.scrim.hidden = true;
      return;
    }
    var sid = state.selectedSupporterId;
    var supporter = null;
    var payments = [];
    state.rows.forEach(function (r) {
      if (str(r.supporter_id) === sid) {
        if (!supporter) supporter = r;
        payments.push(r);
      }
    });

    if (!supporter) {
      el.sidePanel.hidden = true;
      el.scrim.hidden = true;
      state.selectedSupporterId = null;
      return;
    }

    // lifetime total
    var lifetime = 0;
    payments.forEach(function (p) {
      if (toBool(p.payment_successful) && !toBool(p.refund)) lifetime += toNum(p.amount_paid);
    });

    // sort payments by date desc
    payments.sort(function (a, b) {
      var at = new Date(a.payment_at).getTime() || 0;
      var bt = new Date(b.payment_at).getTime() || 0;
      return bt - at;
    });

    var name = toBool(supporter.anonymous_donation) ? 'Anonymous' : (str(supporter.supporter_name) || 'Supporter');
    el.panelName.textContent = name;

    var html = '';
    html += '<div class="panel-lifetime">';
    html += '<span class="panel-lifetime-label">Lifetime total</span>';
    html += '<span class="panel-lifetime-value">' + fmtMoney(lifetime) + '</span>';
    html += '</div>';

    html += '<dl class="panel-facts">';
    html += factRow('Email', supporter.email);
    html += factRow('Mobile', supporter.mobile_phone);
    html += factRow('Type', supporter.supporter_type);
    html += factRow('Acquired', supporter.acquisition_date ? fmtDate(supporter.acquisition_date) : '—');
    html += factRow('Recurring', supporter.recurring_donor_status || (toBool(supporter.recurring_donor) ? 'Yes' : 'No'));
    html += factRow('Membership', supporter.membership_status || '—');
    html += '</dl>';

    html += '<h3 class="panel-subhead">Payments (' + payments.length + ')</h3>';
    if (payments.length === 0) {
      html += '<p class="panel-empty">No payments on record.</p>';
    } else {
      html += '<ul class="panel-payments">';
      payments.forEach(function (p) {
        html += '<li class="panel-pay-row">' +
          '<span class="panel-pay-date">' + fmtDate(p.payment_at) + '</span>' +
          '<span class="panel-pay-project">' + escapeHtml(str(p.project) || '—') + '</span>' +
          '<span class="panel-pay-amount">' + fmtMoney(p.amount_paid) + '</span>' +
          '</li>';
      });
      html += '</ul>';
    }

    el.panelBody.innerHTML = html;
    el.sidePanel.hidden = false;
    el.scrim.hidden = false;
    el.panelClose.focus();
  }

  function factRow(label, value) {
    var v = value == null || value === '' ? '—' : value;
    return '<div class="fact"><dt class="fact-label">' + escapeHtml(label) + '</dt><dd class="fact-value">' + escapeHtml(v) + '</dd></div>';
  }

  function openPanel(sid) {
    state.selectedSupporterId = sid;
    lastFocused = document.activeElement;
    renderPanel();
  }

  function closePanel() {
    state.selectedSupporterId = null;
    el.sidePanel.hidden = true;
    el.scrim.hidden = true;
    renderPanel();
    if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
  }

  /* ---------- responsive ---------- */

  function updateResponsive() {
    if (state.loading || state.error) return;
    var total = filteredRows().length;
    if (total === 0) return;
    if (isMobile()) {
      el.tableScroll.hidden = true;
      el.cardList.hidden = false;
    } else {
      el.tableScroll.hidden = false;
      el.cardList.hidden = true;
    }
  }

  /* ---------- tab switching ---------- */

  function activateTab(tabName) {
    state.activeTab = tabName;

    var tabs = [
      { name: 'payments', btn: el.tabBtnPayments, panel: el.tabPayments },
      { name: 'projects', btn: el.tabBtnProjects, panel: el.tabProjects },
      { name: 'recurring', btn: el.tabBtnRecurring, panel: el.tabRecurring },
      { name: 'lapsed', btn: el.tabBtnLapsed, panel: el.tabLapsed }
    ];

    tabs.forEach(function (t) {
      if (t.name === tabName) {
        t.btn.classList.add('is-active');
        t.btn.setAttribute('aria-selected', 'true');
        t.panel.hidden = false;
      } else {
        t.btn.classList.remove('is-active');
        t.btn.setAttribute('aria-selected', 'false');
        t.panel.hidden = true;
      }
    });

    // Re-render the active tab to ensure correct state
    if (tabName === 'payments') renderTable();
    else if (tabName === 'projects') renderProjects();
    else if (tabName === 'recurring') renderRecurring();
    else if (tabName === 'lapsed') renderLapsed();

    window.knowiReportReady = true;
  }

  function bindTabEvents() {
    var tabBtns = [el.tabBtnPayments, el.tabBtnProjects, el.tabBtnRecurring, el.tabBtnLapsed];
    var tabNames = ['payments', 'projects', 'recurring', 'lapsed'];

    tabBtns.forEach(function (btn, i) {
      btn.addEventListener('click', function () {
        activateTab(tabNames[i]);
      });

      btn.addEventListener('keydown', function (e) {
        var idx = tabBtns.indexOf(btn);
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          var next = (idx + 1) % tabBtns.length;
          tabBtns[next].focus();
          activateTab(tabNames[next]);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          var prev = (idx - 1 + tabBtns.length) % tabBtns.length;
          tabBtns[prev].focus();
          activateTab(tabNames[prev]);
        }
      });
    });
  }

  /* ---------- projects tab ---------- */

  function renderProjects() {
    if (state.loading) {
      el.projectsState.hidden = false;
      el.projectsState.className = 'state-box state-loading';
      el.projectsState.innerHTML = '<span class="skel skel-wide"></span>';
      el.projectsCard.hidden = true;
      return;
    }

    if (state.error) {
      el.projectsState.hidden = false;
      el.projectsState.className = 'state-box state-error';
      el.projectsState.textContent = state.error.message || 'Something went wrong.';
      el.projectsCard.hidden = true;
      return;
    }

    el.projectsState.hidden = true;
    el.projectsState.innerHTML = '';

    if (state.rows.length === 0) {
      el.projectsState.hidden = false;
      el.projectsState.className = 'state-box state-empty';
      el.projectsState.textContent = 'No project data available.';
      el.projectsCard.hidden = true;
      return;
    }

    el.projectsCard.hidden = false;

    // Group by project
    var projectMap = {};
    var totalRaisedOverall = 0;

    state.rows.forEach(function (r) {
      if (!toBool(r.payment_successful) || toBool(r.refund)) return;
      var proj = str(r.project) || '—';
      var amt = toNum(r.amount_paid);
      totalRaisedOverall += amt;

      if (!projectMap[proj]) {
        projectMap[proj] = {
          total: 0,
          gifts: 0,
          supporters: new Set(),
          largest: 0
        };
      }
      projectMap[proj].total += amt;
      projectMap[proj].gifts += 1;
      if (r.supporter_id != null && r.supporter_id !== '') {
        projectMap[proj].supporters.add(r.supporter_id);
      }
      if (amt > projectMap[proj].largest) {
        projectMap[proj].largest = amt;
      }
    });

    // Build sorted array
    var projects = Object.keys(projectMap).map(function (name) {
      var p = projectMap[name];
      return {
        name: name,
        total: p.total,
        gifts: p.gifts,
        supporters: p.supporters.size,
        largest: p.largest,
        share: totalRaisedOverall > 0 ? (p.total / totalRaisedOverall) * 100 : 0
      };
    });

    projects.sort(function (a, b) {
      return b.total - a.total;
    });

    el.projectsMeta.textContent = projects.length + ' project' + (projects.length === 1 ? '' : 's');

    if (projects.length === 0) {
      el.projectsBody.innerHTML = '<tr><td colspan="6" class="empty-cell">No successful payments found.</td></tr>';
      return;
    }

    el.projectsBody.innerHTML = projects.map(function (p) {
      var barWidth = Math.min(100, p.share);
      return '<tr>' +
        '<td class="col-project">' + escapeHtml(p.name) + '</td>' +
        '<td class="num">' + fmtMoney(p.total) + '</td>' +
        '<td class="num">' + fmtInt(p.gifts) + '</td>' +
        '<td class="num">' + fmtInt(p.supporters) + '</td>' +
        '<td class="num">' + fmtMoney(p.largest) + '</td>' +
        '<td class="col-share">' +
          '<div class="share-bar" role="img" aria-label="' + p.share.toFixed(1) + '% of total">' +
            '<div class="share-bar-fill" style="width:' + barWidth.toFixed(1) + '%"></div>' +
          '</div>' +
          '<span class="share-pct">' + p.share.toFixed(1) + '%</span>' +
        '</td>' +
        '</tr>';
    }).join('');
  }

  /* ---------- recurring tab ---------- */

  function renderRecurring() {
    if (state.loading) {
      el.recurringState.hidden = false;
      el.recurringState.className = 'state-box state-loading';
      el.recurringState.innerHTML = '<span class="skel skel-wide"></span>';
      el.recurringCard.hidden = true;
      return;
    }

    if (state.error) {
      el.recurringState.hidden = false;
      el.recurringState.className = 'state-box state-error';
      el.recurringState.textContent = state.error.message || 'Something went wrong.';
      el.recurringCard.hidden = true;
      return;
    }

    el.recurringState.hidden = true;
    el.recurringState.innerHTML = '';

    if (state.rows.length === 0) {
      el.recurringState.hidden = false;
      el.recurringState.className = 'state-box state-empty';
      el.recurringState.textContent = 'No recurring donor data available.';
      el.recurringCard.hidden = true;
      return;
    }

    el.recurringCard.hidden = false;

    // Filter recurring donors
    var recurringRows = state.rows.filter(function (r) {
      return toBool(r.recurring_donor);
    });

    if (recurringRows.length === 0) {
      el.recurringMeta.textContent = '0 recurring donors';
      el.recurringTotal.textContent = '';
      el.recurringBody.innerHTML = '<tr><td colspan="5" class="empty-cell">No recurring donors found.</td></tr>';
      return;
    }

    // Compute annualised for each row
    var annualisedTotal = 0;
    var rows = recurringRows.map(function (r) {
      var freq = str(r.recurring_donation_frequency).toLowerCase();
      var amount = toNum(r.recurring_donation_amount);
      var annualised;

      if (freq === 'monthly') {
        annualised = amount * 12;
      } else if (freq === 'quarterly') {
        annualised = amount * 4;
      } else if (freq === 'yearly' || freq === 'annual') {
        annualised = amount * 1;
      } else {
        annualised = null;
      }

      if (annualised !== null) {
        annualisedTotal += annualised;
      }

      return {
        name: str(r.supporter_name) || '—',
        frequency: str(r.recurring_donation_frequency) || '—',
        amount: amount,
        startDate: r.recurring_donation_start_date ? fmtDate(r.recurring_donation_start_date) : '—',
        annualised: annualised
      };
    });

    el.recurringMeta.textContent = rows.length + ' recurring donor' + (rows.length === 1 ? '' : 's');
    el.recurringTotal.textContent = 'Annualised total: ' + fmtMoney(annualisedTotal);

    el.recurringBody.innerHTML = rows.map(function (r) {
      var annText = r.annualised !== null ? fmtMoney(r.annualised) : '–';
      return '<tr>' +
        '<td class="col-supporter">' + escapeHtml(r.name) + '</td>' +
        '<td class="col-frequency">' + escapeHtml(r.frequency) + '</td>' +
        '<td class="num">' + fmtMoney(r.amount) + '</td>' +
        '<td class="col-date">' + r.startDate + '</td>' +
        '<td class="num">' + annText + '</td>' +
        '</tr>';
    }).join('');
  }

  /* ---------- lapsed tab ---------- */

  function renderLapsed() {
    if (state.loading) {
      el.lapsedState.hidden = false;
      el.lapsedState.className = 'state-box state-loading';
      el.lapsedState.innerHTML = '<span class="skel skel-wide"></span>';
      el.lapsedCard.hidden = true;
      return;
    }

    if (state.error) {
      el.lapsedState.hidden = false;
      el.lapsedState.className = 'state-box state-error';
      el.lapsedState.textContent = state.error.message || 'Something went wrong.';
      el.lapsedCard.hidden = true;
      return;
    }

    el.lapsedState.hidden = true;
    el.lapsedState.innerHTML = '';

    if (state.rows.length === 0) {
      el.lapsedState.hidden = false;
      el.lapsedState.className = 'state-box state-empty';
      el.lapsedState.textContent = 'No membership data available.';
      el.lapsedCard.hidden = true;
      return;
    }

    el.lapsedCard.hidden = false;

    // Filter lapsed members
    var lapsedRows = state.rows.filter(function (r) {
      return toBool(r.has_membership) && !toBool(r.current_member);
    });

    if (lapsedRows.length === 0) {
      el.lapsedBody.innerHTML = '<tr><td colspan="4" class="empty-cell">No lapsed members found.</td></tr>';
      el.copyEmailsBtn.disabled = true;
      return;
    }

    el.copyEmailsBtn.disabled = false;

    // Compute days since expiry and sort oldest first
    var now = Date.now();
    var rows = lapsedRows.map(function (r) {
      var expiry = r.membership_expiry_date ? new Date(r.membership_expiry_date) : null;
      var daysSince = null;
      if (expiry && !isNaN(expiry.getTime())) {
        daysSince = Math.floor((now - expiry.getTime()) / (1000 * 60 * 60 * 24));
      }
      return {
        name: str(r.supporter_name) || '—',
        email: str(r.email) || '',
        membershipType: str(r.membership_type) || '—',
        expiryDate: expiry && !isNaN(expiry.getTime()) ? fmtDate(r.membership_expiry_date) : '—',
        daysSince: daysSince,
        expiryTime: expiry && !isNaN(expiry.getTime()) ? expiry.getTime() : Infinity
      };
    });

    // Sort by oldest expiry first (smallest expiryTime)
    rows.sort(function (a, b) {
      return a.expiryTime - b.expiryTime;
    });

    el.lapsedBody.innerHTML = rows.map(function (r) {
      var daysText = r.daysSince !== null ? fmtInt(r.daysSince) : '—';
      return '<tr>' +
        '<td class="col-supporter">' + escapeHtml(r.name) + '</td>' +
        '<td class="col-membership-type">' + escapeHtml(r.membershipType) + '</td>' +
        '<td class="col-date">' + r.expiryDate + '</td>' +
        '<td class="num">' + daysText + '</td>' +
        '</tr>';
    }).join('');

    // Store emails for copy button
    el._lapsedEmails = rows.map(function (r) { return r.email; }).filter(function (e) { return e; });
  }

  function copyLapsedEmails() {
    var emails = el._lapsedEmails || [];
    if (emails.length === 0) return;
    var text = emails.join('; ');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        el.copyEmailsBtn.textContent = 'Copied!';
        setTimeout(function () {
          el.copyEmailsBtn.textContent = 'Copy emails';
        }, 2000);
      }).catch(function () {
        // Fallback
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
          el.copyEmailsBtn.textContent = 'Copy emails';
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
        el.copyEmailsBtn.textContent = 'Copy emails';
      }, 2000);
    }
  }

  /* ---------- events ---------- */

  function bindEvents() {
    el.searchInput.addEventListener('input', function () {
      state.search = el.searchInput.value;
      state.page = 1;
      renderTable();
    });

    el.financialYearSelect.addEventListener('change', function () {
      state.financialYear = el.financialYearSelect.value;
      state.page = 1;
      renderTable();
    });

    el.paymentMethodSelect.addEventListener('change', function () {
      state.paymentMethod = el.paymentMethodSelect.value;
      state.page = 1;
      renderTable();
    });

    el.successfulOnly.addEventListener('change', function () {
      state.successfulOnly = el.successfulOnly.checked;
      state.page = 1;
      renderTable();
    });

    el.prevBtn.addEventListener('click', function () {
      if (state.page > 1) { state.page--; renderTable(); }
    });

    el.nextBtn.addEventListener('click', function () {
      state.page++;
      renderTable();
    });

    // sort
    var ths = el.tableScroll.querySelectorAll('th.sortable');
    ths.forEach(function (th) {
      var field = th.getAttribute('data-sort');
      var btn = th.querySelector('.sort-btn');
      if (btn) {
        btn.addEventListener('click', function () {
          if (state.sortField === field) {
            state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
          } else {
            state.sortField = field;
            state.sortDir = 'desc';
          }
          state.page = 1;
          renderTable();
        });
      }
    });

    // row / card click (delegated)
    el.tableBody.addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-sid]');
      if (tr) openPanel(tr.getAttribute('data-sid'));
    });
    el.tableBody.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        var tr = e.target.closest('tr[data-sid]');
        if (tr) { e.preventDefault(); openPanel(tr.getAttribute('data-sid')); }
      }
    });
    el.cardList.addEventListener('click', function (e) {
      var card = e.target.closest('[data-sid]');
      if (card) openPanel(card.getAttribute('data-sid'));
    });
    el.cardList.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        var card = e.target.closest('[data-sid]');
        if (card) { e.preventDefault(); openPanel(card.getAttribute('data-sid')); }
      }
    });

    // panel close
    el.panelClose.addEventListener('click', closePanel);
    el.scrim.addEventListener('click', closePanel);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !el.sidePanel.hidden) closePanel();
    });

    // resize
    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        updateResponsive();
      }, 120);
    });

    // Tab events
    bindTabEvents();

    // Copy emails button
    el.copyEmailsBtn.addEventListener('click', copyLapsedEmails);
  }

  /* ---------- init ---------- */

  function init() {
    moneyFmt = new Intl.NumberFormat('en-AU', { style: 'currency', currency: CURRENCY, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    intFmt = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 });
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