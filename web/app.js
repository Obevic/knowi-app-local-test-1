window.knowiReportReady = false;

(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var els = {
    viewer: $('viewer'),
    viewerName: $('viewer-name'),
    viewerEmail: $('viewer-email'),
    expenseCount: $('expense-count'),
    addForm: $('add-form'),
    fDate: $('f-date'),
    fCategory: $('f-category'),
    fAmount: $('f-amount'),
    fNote: $('f-note'),
    formMsg: $('form-msg'),
    formSubmit: $('form-submit'),
    addBtn: $('add-btn'),
    chart: $('chart'),
    chartEmpty: $('chart-empty'),
    chartMonth: $('chart-month'),
    tableWrap: $('table-wrap'),
    expBody: $('exp-body'),
    tableEmpty: $('table-empty'),
    tableCount: $('table-count'),
    categoryList: $('category-list'),
    loading: $('loading'),
    error: $('error'),
    errorText: $('error-text'),
    retryBtn: $('retry-btn'),
    sessionExpired: $('session-expired')
  };

  var state = {
    expenses: [],
    categories: [],
    monthLabel: '',
    monthKey: ''
  };

  var CHART_COLORS = ['#375357', '#4E6E78', '#276B5D', '#7F5410', '#9C2F3C', '#5F4C38', '#3A5A63', '#6B4F3A'];

  function todayStr() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function monthKeyOf(dateStr) {
    return dateStr ? dateStr.slice(0, 7) : '';
  }

  function fmtDate(dateStr) {
    if (!dateStr) return '';
    var parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function fmtMoney(n) {
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function showLoading() {
    els.loading.hidden = false;
    els.error.hidden = true;
    els.sessionExpired.hidden = true;
  }

  function hideLoading() {
    els.loading.hidden = true;
  }

  function showError(msg) {
    hideLoading();
    els.errorText.textContent = msg || "We couldn't load your expenses.";
    els.error.hidden = false;
  }

  function showSessionExpired() {
    hideLoading();
    els.error.hidden = true;
    els.sessionExpired.hidden = false;
  }

  function renderViewer(v) {
    if (v && (v.name || v.email)) {
      els.viewerName.textContent = v.name || '';
      els.viewerEmail.textContent = v.email || '';
      els.viewer.hidden = false;
    } else {
      els.viewer.hidden = true;
    }
  }

  function renderTable() {
    var rows = state.expenses;
    if (!rows.length) {
      els.expBody.innerHTML = '';
      els.tableEmpty.hidden = false;
      els.tableWrap.querySelector('table').style.display = 'none';
      els.tableCount.textContent = '';
      return;
    }
    els.tableWrap.querySelector('table').style.display = '';
    els.tableEmpty.hidden = true;
    els.tableCount.textContent = rows.length + (rows.length === 1 ? ' expense' : ' expenses');

    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var e = rows[i];
      html += '<tr>' +
        '<td class="col-date">' + esc(fmtDate(e.date)) + '</td>' +
        '<td class="col-cat"><span class="cat-chip">' + esc(e.category) + '</span></td>' +
        '<td class="col-note">' + (e.note ? esc(e.note) : '<span class="muted">—</span>') + '</td>' +
        '<td class="col-amt">' + esc(fmtMoney(e.amount)) + '</td>' +
        '</tr>';
    }
    els.expBody.innerHTML = html;
  }

  function renderChart() {
    var mk = state.monthKey;
    var totals = {};
    for (var i = 0; i < state.expenses.length; i++) {
      var e = state.expenses[i];
      if (monthKeyOf(e.date) === mk) {
        totals[e.category] = (totals[e.category] || 0) + e.amount;
      }
    }
    var entries = Object.keys(totals).map(function (k) { return { cat: k, total: totals[k] }; });
    entries.sort(function (a, b) { return b.total - a.total; });

    els.chartMonth.textContent = state.monthLabel || '';

    if (!entries.length) {
      els.chart.innerHTML = '';
      els.chartEmpty.hidden = false;
      return;
    }
    els.chartEmpty.hidden = true;

    var W = 640, H = 240, padL = 16, padR = 16, padT = 16, padB = 44;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;
    var n = entries.length;
    var gap = 14;
    var barW = Math.min(64, (plotW - gap * (n - 1)) / n);
    var totalW = n * barW + (n - 1) * gap;
    var startX = padL + (plotW - totalW) / 2;
    var maxVal = entries.reduce(function (m, e) { return Math.max(m, e.total); }, 0);

    var svg = '<svg class="bar-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Spending by category for ' + esc(state.monthLabel) + '">';
    for (var i = 0; i < n; i++) {
      var e = entries[i];
      var h = maxVal > 0 ? (e.total / maxVal) * plotH : 0;
      var x = startX + i * (barW + gap);
      var y = padT + plotH - h;
      var color = CHART_COLORS[i % CHART_COLORS.length];
      svg += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="4" fill="' + color + '"></rect>';
      svg += '<text class="bar-val" x="' + (x + barW / 2).toFixed(1) + '" y="' + (y - 6).toFixed(1) + '" text-anchor="middle" fill="#273D44" font-size="12" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">' + esc(fmtMoney(e.total)) + '</text>';
      svg += '<text class="bar-label" x="' + (x + barW / 2).toFixed(1) + '" y="' + (padT + plotH + 18) + '" text-anchor="middle" fill="#56666D" font-size="12" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">' + esc(e.cat) + '</text>';
    }
    svg += '<line x1="' + padL + '" y1="' + (padT + plotH) + '" x2="' + (W - padR) + '" y2="' + (padT + plotH) + '" stroke="#DCE3E4" stroke-width="1"></line>';
    svg += '</svg>';
    els.chart.innerHTML = svg;
  }

  function renderCategories() {
    var html = '';
    for (var i = 0; i < state.categories.length; i++) {
      html += '<option value="' + esc(state.categories[i]) + '">';
    }
    els.categoryList.innerHTML = html;
  }

  function renderAll() {
    els.expenseCount.textContent = state.expenses.length;
    renderTable();
    renderChart();
    renderCategories();
    hideLoading();
    window.knowiReportReady = true;
  }

  function loadData() {
    showLoading();
    return fetch('api/expenses', { headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (r.status === 401) { showSessionExpired(); throw new Error('unauthorized'); }
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      })
      .then(function (data) {
        state.expenses = data.expenses || [];
        state.categories = data.categories || [];
        state.monthLabel = data.monthLabel || '';
        state.monthKey = state.expenses.length ? monthKeyOf(state.expenses[0].date) : monthKeyOf(todayStr());
        renderAll();
      })
      .catch(function (err) {
        if (err && err.message === 'unauthorized') return;
        showError('We couldn\'t load your expenses. Please try again.');
      });
  }

  function loadViewer() {
    return fetch('api/me', { headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (r.status === 401) { showSessionExpired(); throw new Error('unauthorized'); }
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      })
      .then(function (v) { renderViewer(v); })
      .catch(function (err) {
        if (err && err.message === 'unauthorized') return;
        renderViewer(null);
      });
  }

  function setFormMsg(msg, kind) {
    els.formMsg.textContent = msg || '';
    els.formMsg.className = 'form-msg' + (kind ? ' ' + kind : '');
  }

  function handleAdd(e) {
    e.preventDefault();
    var date = els.fDate.value;
    var category = els.fCategory.value.trim();
    var amount = els.fAmount.value;
    var note = els.fNote.value.trim();

    if (!date || !category || amount === '') {
      setFormMsg('Please fill in date, category and amount.', 'err');
      return;
    }
    var amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setFormMsg('Amount must be a positive number.', 'err');
      return;
    }

    els.formSubmit.disabled = true;
    setFormMsg('Saving…', '');
    fetch('api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ date: date, category: category, amount: amt, note: note })
    })
      .then(function (r) {
        if (r.status === 401) { showSessionExpired(); throw new Error('unauthorized'); }
        if (!r.ok) {
          return r.json().then(function (j) { throw new Error(j && j.error ? j.error : 'Could not save expense.'); }, function () { throw new Error('Could not save expense.'); });
        }
        return r.json();
      })
      .then(function (data) {
        if (data && data.expense) {
          state.expenses.unshift(data.expense);
          if (state.categories.indexOf(data.expense.category) === -1) {
            state.categories.push(data.expense.category);
            state.categories.sort();
          }
          var latestKey = monthKeyOf(data.expense.date);
          if (latestKey > state.monthKey) {
            state.monthKey = latestKey;
            state.monthLabel = new Date(data.expense.date + 'T00:00:00').toLocaleString('en-US', { month: 'long', year: 'numeric' });
          }
          renderAll();
          setFormMsg('Expense saved.', 'ok');
          els.addForm.reset();
          els.fDate.value = todayStr();
          setTimeout(function () { setFormMsg('', ''); }, 2500);
        }
      })
      .catch(function (err) {
        if (err && err.message === 'unauthorized') return;
        setFormMsg(err.message || 'Could not save expense.', 'err');
      })
      .then(function () { els.formSubmit.disabled = false; });
  }

  function init() {
    els.fDate.value = todayStr();
    els.addForm.addEventListener('submit', handleAdd);
    els.retryBtn.addEventListener('click', function () { loadData(); });
    els.addBtn.addEventListener('click', function () {
      var card = document.getElementById('add-card');
      if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(function () { els.fDate.focus(); }, 300);
    });

    loadViewer();
    loadData();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();