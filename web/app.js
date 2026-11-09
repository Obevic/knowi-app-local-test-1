window.knowiReportReady = false;

(function () {
  'use strict';

  const PAGE_SIZE = 50;

  const state = {
    expenses: [],
    categories: [],
    visible: PAGE_SIZE,
    loading: true,
    error: null
  };

  const $ = (id) => document.getElementById(id);

  const els = {
    viewer: $('viewer'),
    viewerName: $('viewer-name'),
    viewerEmail: $('viewer-email'),
    expenseCount: $('expense-count'),
    addForm: $('add-form'),
    fDate: $('f-date'),
    fCategory: $('f-category'),
    fAmount: $('f-amount'),
    fNote: $('f-note'),
    formStatus: $('form-status'),
    addBtn: $('add-btn'),
    chart: $('chart'),
    chartEmpty: $('chart-empty'),
    tableWrap: $('table-wrap'),
    table: $('expenses-table'),
    tbody: $('expenses-body'),
    tableStatus: $('table-status'),
    showMore: $('show-more'),
    sessionExpired: $('session-expired')
  };

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    const [y, m, d] = parts;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mi = parseInt(m, 10) - 1;
    const mon = months[mi] || m;
    return `${mon} ${parseInt(d, 10)}, ${y}`;
  }

  function fmtAmount(n) {
    return Number(n).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function monthKey(iso) {
    return iso ? iso.slice(0, 7) : '';
  }

  function latestMonthKey() {
    if (!state.expenses.length) return '';
    let latest = '';
    for (const e of state.expenses) {
      const k = monthKey(e.date);
      if (k > latest) latest = k;
    }
    return latest;
  }

  function monthLabel(key) {
    if (!key) return '';
    const [y, m] = key.split('-');
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const mi = parseInt(m, 10) - 1;
    return `${months[mi] || m} ${y}`;
  }

  function renderViewer(me) {
    if (me && me.name) {
      els.viewer.hidden = false;
      els.viewerName.textContent = me.name;
      els.viewerEmail.textContent = me.email || '';
    } else {
      els.viewer.hidden = true;
    }
  }

  function renderCount() {
    els.expenseCount.textContent = String(state.expenses.length);
  }

  function renderTable() {
    const rows = state.expenses.slice(0, state.visible);
    let html = '';
    for (const e of rows) {
      html +=
        '<tr>' +
        '<td class="col-date">' + escapeHtml(fmtDate(e.date)) + '</td>' +
        '<td class="col-cat">' + escapeHtml(e.category) + '</td>' +
        '<td class="col-amt num">' + fmtAmount(e.amount) + '</td>' +
        '<td class="col-note">' + escapeHtml(e.note || '') + '</td>' +
        '</tr>';
    }
    els.tbody.innerHTML = html;

    const hasMore = state.expenses.length > state.visible;
    els.showMore.hidden = !hasMore;
    if (hasMore) {
      els.showMore.textContent = 'Show more (' + (state.expenses.length - state.visible) + ' remaining)';
    }
  }

  function renderChart() {
    // Remove any previously drawn SVG
    const existing = els.chart.querySelector('svg');
    if (existing) existing.remove();

    const key = latestMonthKey();
    if (!key) {
      els.chartEmpty.hidden = false;
      return;
    }
    els.chartEmpty.hidden = true;

    const totals = {};
    for (const e of state.expenses) {
      if (monthKey(e.date) === key) {
        totals[e.category] = (totals[e.category] || 0) + e.amount;
      }
    }

    const entries = Object.keys(totals)
      .map((c) => ({ category: c, total: totals[c] }))
      .sort((a, b) => b.total - a.total);

    if (!entries.length) {
      els.chartEmpty.hidden = false;
      return;
    }

    const W = 720;
    const H = 300;
    const padL = 110;
    const padR = 24;
    const padT = 24;
    const padB = 40;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const n = entries.length;
    const gap = 14;
    const barW = Math.max(20, Math.min(64, (plotW - gap * (n + 1)) / n));
    const totalW = n * barW + (n + 1) * gap;
    const startX = padL + Math.max(0, (plotW - totalW) / 2);

    const maxVal = Math.max(...entries.map((e) => e.total));
    const niceMax = niceCeil(maxVal);

    let svg =
      '<svg class="bar-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Total spend by category for ' +
      escapeHtml(monthLabel(key)) + '">';

    // Gridlines + y labels
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const val = (niceMax / ticks) * i;
      const y = padT + plotH - (val / niceMax) * plotH;
      svg +=
        '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y +
        '" stroke="#DCE3E4" stroke-width="1"></line>';
      svg +=
        '<text x="' + (padL - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="#56666D" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">$' +
        fmtAmount(val) + '</text>';
    }

    // Bars
    entries.forEach((e, i) => {
      const x = startX + i * (barW + gap);
      const h = (e.total / niceMax) * plotH;
      const y = padT + plotH - h;
      svg +=
        '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + h +
        '" rx="3" fill="#4E6E78"></rect>';
      // Value label above bar
      svg +=
        '<text x="' + (x + barW / 2) + '" y="' + (y - 6) + '" text-anchor="middle" font-size="11" fill="#273D44" font-weight="600" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">$' +
        fmtAmount(e.total) + '</text>';
      // Category label below
      const label = e.category.length > 10 ? e.category.slice(0, 9) + '…' : e.category;
      svg +=
        '<text x="' + (x + barW / 2) + '" y="' + (padT + plotH + 18) + '" text-anchor="middle" font-size="11" fill="#56666D" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">' +
        escapeHtml(label) + '</text>';
    });

    // Baseline
    svg +=
      '<line x1="' + padL + '" y1="' + (padT + plotH) + '" x2="' + (W - padR) + '" y2="' + (padT + plotH) +
      '" stroke="#273D44" stroke-width="1.4"></line>';

    svg += '</svg>';
    els.chart.insertAdjacentHTML('beforeend', svg);
  }

  function niceCeil(v) {
    if (v <= 0) return 100;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const norm = v / mag;
    let nice;
    if (norm <= 1) nice = 1;
    else if (norm <= 2) nice = 2;
    else if (norm <= 2.5) nice = 2.5;
    else if (norm <= 5) nice = 5;
    else nice = 10;
    return nice * mag;
  }

  function renderCategoryOptions() {
    const dl = document.getElementById('category-options');
    if (!dl) return;
    dl.innerHTML = '';
    for (const c of state.categories) {
      const opt = document.createElement('option');
      opt.value = c;
      dl.appendChild(opt);
    }
  }

  function renderAll() {
    renderCount();
    renderTable();
    renderChart();
    renderCategoryOptions();
  }

  function showLoading() {
    els.tableStatus.textContent = 'Loading expenses…';
    els.tbody.innerHTML =
      '<tr class="skeleton-row"><td colspan="4"><div class="skeleton"></div></td></tr>';
  }

  function showError(msg) {
    els.tableStatus.textContent = msg;
    els.tbody.innerHTML = '';
  }

  function showSessionExpired() {
    els.sessionExpired.hidden = false;
    document.querySelector('.app-shell').hidden = true;
  }

  async function fetchJson(url, opts) {
    const res = await fetch(url, opts);
    if (res.status === 401) {
      showSessionExpired();
      throw new Error('unauthorized');
    }
    if (!res.ok) {
      let msg = 'Request failed';
      try {
        const j = await res.json();
        if (j && j.error) msg = j.error;
      } catch (e) {}
      throw new Error(msg);
    }
    return res.json();
  }

  async function load() {
    showLoading();
    try {
      const [me, data] = await Promise.all([
        fetchJson('api/me'),
        fetchJson('api/expenses')
      ]);
      renderViewer(me);
      state.expenses = data.expenses || [];
      state.categories = data.categories || [];
      state.visible = PAGE_SIZE;
      state.loading = false;
      state.error = null;
      els.tableStatus.textContent = '';
      renderAll();
      window.knowiReportReady = true;
    } catch (err) {
      if (err.message === 'unauthorized') return;
      state.loading = false;
      state.error = err.message;
      showError(err.message || 'Could not load expenses.');
      window.knowiReportReady = true;
    }
  }

  function setFormStatus(msg, isError) {
    els.formStatus.textContent = msg || '';
    els.formStatus.classList.toggle('is-error', !!isError);
  }

  async function handleAdd(e) {
    e.preventDefault();
    const date = els.fDate.value;
    const category = els.fCategory.value.trim();
    const amount = els.fAmount.value;
    const note = els.fNote.value.trim();

    if (!date) return setFormStatus('Please choose a date.', true);
    if (!category) return setFormStatus('Please enter a category.', true);
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return setFormStatus('Please enter a positive amount.', true);

    els.addBtn.disabled = true;
    setFormStatus('Saving…', false);

    try {
      const res = await fetchJson('api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, category, amount: amt, note })
      });
      const expense = res.expense;
      state.expenses.unshift(expense);
      if (state.categories.indexOf(expense.category) === -1) {
        state.categories.push(expense.category);
        state.categories.sort();
      }
      els.addForm.reset();
      setFormStatus('Expense added.', false);
      renderAll();
      setTimeout(() => setFormStatus('', false), 2500);
    } catch (err) {
      if (err.message === 'unauthorized') return;
      setFormStatus(err.message || 'Could not add expense.', true);
    } finally {
      els.addBtn.disabled = false;
    }
  }

  function init() {
    // Default date to today
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    els.fDate.value = `${y}-${m}-${d}`;

    els.addForm.addEventListener('submit', handleAdd);
    els.showMore.addEventListener('click', () => {
      state.visible += PAGE_SIZE;
      renderTable();
    });

    load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();