window.knowiReportReady = false;

(function () {
  'use strict';

  var PAGE_SIZE = 50;
  var state = {
    expenses: [],
    visible: PAGE_SIZE,
    categories: [],
    monthKey: null,
    monthLabel: '',
    monthTotals: {},
    monthMax: 0,
    monthTotal: 0,
    monthCount: 0,
    monthHasData: false,
    loading: true,
    error: null,
    sessionExpired: false,
    viewer: null
  };

  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function cacheEls() {
    els.status = $('status');
    els.countPill = $('count-pill');
    els.viewer = $('viewer');
    els.viewerName = $('viewer-name');
    els.viewerEmail = $('viewer-email');
    els.addForm = $('add-form');
    els.addSubmit = $('add-submit');
    els.fDate = $('f-date');
    els.fCategory = $('f-category');
    els.fAmount = $('f-amount');
    els.fNote = $('f-note');
    els.categoryList = $('category-list');
    els.expensesBody = $('expenses-body');
    els.showMore = $('show-more');
    els.chart = $('chart');
    els.monthLabel = $('month-label');
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var parts = String(iso).split('-');
    if (parts.length < 3) return iso;
    var y = parts[0];
    var m = parts[1];
    var d = parts[2];
    return y + '-' + m + '-' + d;
  }

  function fmtMoney(n) {
    var v = Number(n);
    if (!isFinite(v)) return '0.00';
    return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function monthKeyOf(iso) {
    if (!iso) return '';
    var parts = String(iso).split('-');
    if (parts.length < 2) return '';
    return parts[0] + '-' + parts[1];
  }

  function monthLabelFromKey(key) {
    if (!key) return '';
    var parts = key.split('-');
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    if (!y || !m) return key;
    var d = new Date(y, m - 1, 1);
    return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }

  function latestDate() {
    var latest = '';
    for (var i = 0; i < state.expenses.length; i++) {
      var d = state.expenses[i].date;
      if (d && d > latest) latest = d;
    }
    return latest;
  }

  function computeDerived() {
    var catSet = {};
    var latest = latestDate();
    var mk = monthKeyOf(latest);
    state.monthKey = mk;
    state.monthLabel = monthLabelFromKey(mk);
    var totals = {};
    var max = 0;
    var total = 0;
    var count = 0;
    for (var i = 0; i < state.expenses.length; i++) {
      var e = state.expenses[i];
      if (e.category) catSet[e.category] = true;
      if (mk && monthKeyOf(e.date) === mk) {
        var amt = Number(e.amount) || 0;
        totals[e.category] = (totals[e.category] || 0) + amt;
        if (totals[e.category] > max) max = totals[e.category];
        total += amt;
        count++;
      }
    }
    state.categories = Object.keys(catSet).sort(function (a, b) {
      return a < b ? -1 : a > b ? 1 : 0;
    });
    state.monthTotals = totals;
    state.monthMax = max;
    state.monthTotal = total;
    state.monthCount = count;
    state.monthHasData = count > 0;
  }

  function renderViewer() {
    if (state.viewer && state.viewer.name) {
      els.viewer.hidden = false;
      els.viewerName.textContent = state.viewer.name;
      els.viewerEmail.textContent = state.viewer.email || '';
    } else {
      els.viewer.hidden = true;
    }
  }

  function renderStatus() {
    if (state.sessionExpired) {
      els.status.hidden = false;
      els.status.className = 'status status-error';
      els.status.innerHTML =
        'Your session has expired. <a class="link" href="login">Sign in again</a> to continue.';
      return;
    }
    if (state.error) {
      els.status.hidden = false;
      els.status.className = 'status status-error';
      els.status.textContent = state.error;
      return;
    }
    if (state.loading) {
      els.status.hidden = false;
      els.status.className = 'status status-loading';
      els.status.textContent = 'Loading expenses…';
      return;
    }
    els.status.hidden = true;
    els.status.textContent = '';
  }

  function renderCount() {
    els.countPill.textContent = String(state.expenses.length);
  }

  function renderForm() {
    var opts = state.categories.map(function (c) {
      return '<option value="' + escapeAttr(c) + '"></option>';
    }).join('');
    els.categoryList.innerHTML = opts;
    if (!els.fDate.value) {
      var today = new Date();
      var y = today.getFullYear();
      var m = String(today.getMonth() + 1).padStart(2, '0');
      var d = String(today.getDate()).padStart(2, '0');
      els.fDate.value = y + '-' + m + '-' + d;
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }

  function renderTable() {
    var rows = state.expenses.slice(0, state.visible);
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var e = rows[i];
      html +=
        '<tr>' +
        '<td class="col-date">' + escapeHtml(fmtDate(e.date)) + '</td>' +
        '<td class="col-cat"><span class="cat-name">' + escapeHtml(e.category) + '</span></td>' +
        '<td class="col-amt num">$' + escapeHtml(fmtMoney(e.amount)) + '</td>' +
        '<td class="col-note">' + escapeHtml(e.note || '') + '</td>' +
        '</tr>';
    }
    if (rows.length === 0) {
      html = '<tr class="row-empty"><td colspan="4">No expenses yet. Add one above.</td></tr>';
    }
    els.expensesBody.innerHTML = html;
    els.showMore.hidden = state.expenses.length <= state.visible;
  }

  function renderChart() {
    if (!state.monthHasData) {
      els.chart.innerHTML =
        '<div class="chart-empty">No expenses recorded for ' +
        escapeHtml(state.monthLabel || 'this month') + ' yet.</div>';
      els.monthLabel.textContent = state.monthLabel || '';
      return;
    }
    els.monthLabel.textContent = state.monthLabel;

    var entries = Object.keys(state.monthTotals).map(function (c) {
      return { cat: c, total: state.monthTotals[c] };
    }).sort(function (a, b) {
      return b.total - a.total;
    });

    var W = 640;
    var H = 300;
    var padL = 56;
    var padR = 20;
    var padT = 20;
    var padB = 64;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;
    var n = entries.length;
    var gap = 14;
    var barW = Math.min(64, (plotW - gap * (n + 1)) / n);
    var totalBars = n * barW + (n + 1) * gap;
    var startX = padL + (plotW - totalBars) / 2 + gap;

    var maxVal = state.monthMax;
    var niceMax = niceCeil(maxVal);
    var ticks = 4;

    var svg = [];
    svg.push('<svg class="bar-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Bar chart of total spend per category for ' + escapeAttr(state.monthLabel) + '">');
    svg.push('<title>Total spend per category for ' + escapeHtml(state.monthLabel) + '</title>');

    // gridlines + y labels
    for (var t = 0; t <= ticks; t++) {
      var val = (niceMax / ticks) * t;
      var y = padT + plotH - (val / niceMax) * plotH;
      svg.push('<line class="grid" x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '"></line>');
      svg.push('<text class="axis-label" x="' + (padL - 8) + '" y="' + (y + 4) + '" text-anchor="end">$' + escapeHtml(fmtMoney(val)) + '</text>');
    }

    // bars
    for (var i = 0; i < n; i++) {
      var e = entries[i];
      var h = (e.total / niceMax) * plotH;
      var x = startX + i * (barW + gap);
      var y = padT + plotH - h;
      svg.push('<rect class="bar" x="' + x + '" y="' + y + '" width="' + barW + '" height="' + h + '" rx="3"></rect>');
      // value label above bar
      svg.push('<text class="bar-value" x="' + (x + barW / 2) + '" y="' + (y - 6) + '" text-anchor="middle">$' + escapeHtml(fmtMoney(e.total)) + '</text>');
      // category label below axis
      var labelY = padT + plotH + 18;
      var label = e.cat;
      if (label.length > 12) label = label.slice(0, 11) + '…';
      svg.push('<text class="cat-label" x="' + (x + barW / 2) + '" y="' + labelY + '" text-anchor="middle">' + escapeHtml(label) + '</text>');
    }

    // baseline
    svg.push('<line class="axis" x1="' + padL + '" y1="' + (padT + plotH) + '" x2="' + (W - padR) + '" y2="' + (padT + plotH) + '"></line>');

    svg.push('</svg>');
    els.chart.innerHTML = svg.join('');
  }

  function niceCeil(v) {
    if (v <= 0) return 10;
    var mag = Math.pow(10, Math.floor(Math.log10(v)));
    var norm = v / mag;
    var nice;
    if (norm <= 1) nice = 1;
    else if (norm <= 2) nice = 2;
    else if (norm <= 2.5) nice = 2.5;
    else if (norm <= 5) nice = 5;
    else nice = 10;
    return nice * mag;
  }

  function renderAll() {
    renderViewer();
    renderStatus();
    renderCount();
    renderForm();
    renderTable();
    renderChart();
  }

  function showSessionExpired() {
    state.sessionExpired = true;
    state.loading = false;
    renderAll();
  }

  function fetchJson(url, opts) {
    return fetch(url, opts).then(function (res) {
      if (res.status === 401) {
        var err = new Error('unauthorized');
        err.status = 401;
        throw err;
      }
      return res.json().then(function (data) {
        if (!res.ok) {
          var e = new Error((data && data.error) || 'Request failed');
          e.status = res.status;
          throw e;
        }
        return data;
      });
    });
  }

  function loadViewer() {
    return fetchJson('api/me')
      .then(function (data) {
        state.viewer = { name: data.name, email: data.email };
      })
      .catch(function (err) {
        if (err.status === 401) {
          showSessionExpired();
          throw err;
        }
        state.viewer = null;
      });
  }

  function loadExpenses() {
    return fetchJson('api/expenses')
      .then(function (data) {
        state.expenses = (data && data.expenses) || [];
        state.expenses.sort(function (a, b) {
          if (a.date === b.date) return 0;
          return a.date < b.date ? 1 : -1;
        });
        state.loading = false;
        state.error = null;
        computeDerived();
        renderAll();
        window.knowiReportReady = true;
      })
      .catch(function (err) {
        if (err.status === 401) {
          showSessionExpired();
          return;
        }
        state.loading = false;
        state.error = 'Could not load expenses. Please try again.';
        renderAll();
        window.knowiReportReady = true;
      });
  }

  function onAddSubmit(ev) {
    ev.preventDefault();
    if (state.sessionExpired) return;
    var date = els.fDate.value;
    var category = els.fCategory.value.trim();
    var amount = els.fAmount.value;
    var note = els.fNote.value.trim();

    if (!date || !category || amount === '') {
      els.status.hidden = false;
      els.status.className = 'status status-error';
      els.status.textContent = 'Please fill in date, category and amount.';
      return;
    }
    var amtNum = Number(amount);
    if (!isFinite(amtNum) || amtNum < 0) {
      els.status.hidden = false;
      els.status.className = 'status status-error';
      els.status.textContent = 'Amount must be a non-negative number.';
      return;
    }

    els.addSubmit.disabled = true;
    fetchJson('api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: date, category: category, amount: amtNum, note: note })
    })
      .then(function (data) {
        var e = data.expense;
        state.expenses.unshift(e);
        state.expenses.sort(function (a, b) {
          if (a.date === b.date) return 0;
          return a.date < b.date ? 1 : -1;
        });
        computeDerived();
        els.addForm.reset();
        renderForm();
        renderAll();
        els.status.hidden = false;
        els.status.className = 'status status-success';
        els.status.textContent = 'Expense added.';
        setTimeout(function () {
          if (!els.status.hidden && els.status.className.indexOf('success') !== -1) {
            els.status.hidden = true;
          }
        }, 2500);
      })
      .catch(function (err) {
        if (err.status === 401) {
          showSessionExpired();
          return;
        }
        els.status.hidden = false;
        els.status.className = 'status status-error';
        els.status.textContent = (err && err.message) || 'Could not add expense.';
      })
      .finally(function () {
        els.addSubmit.disabled = false;
      });
  }

  function onShowMore() {
    state.visible += PAGE_SIZE;
    renderTable();
  }

  function init() {
    cacheEls();
    els.addForm.addEventListener('submit', onAddSubmit);
    els.showMore.addEventListener('click', onShowMore);

    loadViewer()
      .then(function () {
        if (state.sessionExpired) return;
        return loadExpenses();
      })
      .catch(function () {
        /* session expired handled above */
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();