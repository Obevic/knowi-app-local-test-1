window.knowiReportReady = false;

(function () {
  'use strict';

  var PAGE_SIZE = 50;

  var els = {
    form: document.getElementById('calcForm'),
    loanAmount: document.getElementById('loanAmount'),
    interestRate: document.getElementById('interestRate'),
    termYears: document.getElementById('termYears'),
    calcBtn: document.getElementById('calcBtn'),
    resetBtn: document.getElementById('resetBtn'),
    formError: document.getElementById('formError'),
    resultsCard: document.getElementById('resultsCard'),
    chartCard: document.getElementById('chartCard'),
    tableCard: document.getElementById('tableCard'),
    monthlyPayment: document.getElementById('monthlyPayment'),
    totalPaid: document.getElementById('totalPaid'),
    totalInterest: document.getElementById('totalInterest'),
    totalPayments: document.getElementById('totalPayments'),
    balanceChart: document.getElementById('balanceChart'),
    amortBody: document.getElementById('amortBody'),
    prevPage: document.getElementById('prevPage'),
    nextPage: document.getElementById('nextPage'),
    pageInfo: document.getElementById('pageInfo'),
    showMore: document.getElementById('showMore'),
    navCount: document.getElementById('navCount')
  };

  var state = {
    rows: [],
    payment: 0,
    totalPaid: 0,
    totalInterest: 0,
    n: 0,
    P: 0,
    page: 1,
    pageSize: PAGE_SIZE
  };

  function fmtMoney(v) {
    return '$' + Number(v).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function fmtInt(v) {
    return Number(v).toLocaleString('en-US');
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function compute() {
    var P = parseFloat(els.loanAmount.value);
    var rate = parseFloat(els.interestRate.value);
    var years = parseFloat(els.termYears.value);

    if (isNaN(P) || P <= 0) {
      return { error: 'Enter a loan amount greater than zero.' };
    }
    if (isNaN(rate) || rate < 0) {
      return { error: 'Enter an annual interest rate of zero or more.' };
    }
    if (isNaN(years) || years <= 0) {
      return { error: 'Enter a term of at least one year.' };
    }

    var n = Math.round(years * 12);
    var r = rate / 1200;
    var payment;

    if (r === 0) {
      payment = P / n;
    } else {
      var factor = Math.pow(1 + r, n);
      payment = (P * r * factor) / (factor - 1);
    }

    var rows = [];
    var balance = P;
    for (var m = 1; m <= n; m++) {
      var interest = balance * r;
      var principal = payment - interest;
      balance -= principal;
      if (m === n) {
        balance = 0;
        principal = payment - interest;
      }
      if (balance < 0) balance = 0;
      rows.push({
        month: m,
        payment: payment,
        principal: principal,
        interest: interest,
        balance: balance
      });
    }

    var totalPaid = payment * n;
    var totalInterest = totalPaid - P;

    return {
      P: P,
      rate: rate,
      years: years,
      n: n,
      payment: payment,
      rows: rows,
      totalPaid: totalPaid,
      totalInterest: totalInterest
    };
  }

  function renderResults(res) {
    els.monthlyPayment.textContent = fmtMoney(res.payment);
    els.totalPaid.textContent = fmtMoney(res.totalPaid);
    els.totalInterest.textContent = fmtMoney(res.totalInterest);
    els.totalPayments.textContent = fmtInt(res.n);
    els.resultsCard.hidden = false;
  }

  function renderTable(res) {
    var rows = res.rows;
    var total = rows.length;
    var maxPage = Math.max(1, Math.ceil(total / state.pageSize));
    if (state.page > maxPage) state.page = maxPage;
    if (state.page < 1) state.page = 1;

    var start = (state.page - 1) * state.pageSize;
    var end = Math.min(start + state.pageSize, total);

    var html = '';
    for (var i = start; i < end; i++) {
      var row = rows[i];
      html +=
        '<tr>' +
        '<td class="num">' + row.month + '</td>' +
        '<td class="num">' + fmtMoney(row.payment) + '</td>' +
        '<td class="num">' + fmtMoney(row.principal) + '</td>' +
        '<td class="num">' + fmtMoney(row.interest) + '</td>' +
        '<td class="num">' + fmtMoney(row.balance) + '</td>' +
        '</tr>';
    }
    els.amortBody.innerHTML = html;

    els.pageInfo.textContent = 'Page ' + state.page + ' of ' + maxPage;
    els.prevPage.disabled = state.page <= 1;
    els.nextPage.disabled = state.page >= maxPage;
    els.showMore.hidden = state.page >= maxPage;
    els.tableCard.hidden = false;
  }

  function renderChart(res) {
    var svg = els.balanceChart;
    var W = 720, H = 340;
    var m = { t: 20, r: 24, b: 46, l: 72 };
    var plotW = W - m.l - m.r;
    var plotH = H - m.t - m.b;
    var x0 = m.l, y0 = m.t, y1 = m.t + plotH;
    var maxBal = res.P;
    var n = res.n;

    function xPos(i) {
      if (n <= 1) return x0;
      return x0 + (i / n) * plotW;
    }
    function yPos(v) {
      if (maxBal <= 0) return y1;
      return y1 - (v / maxBal) * plotH;
    }

    var parts = [];

    // Gridlines + y labels
    var yTicks = 5;
    for (var t = 0; t <= yTicks; t++) {
      var val = (maxBal / yTicks) * t;
      var y = yPos(val);
      parts.push('<line x1="' + x0 + '" y1="' + y.toFixed(1) + '" x2="' + (x0 + plotW) + '" y2="' + y.toFixed(1) + '" stroke="#E4EBEB" stroke-width="1"></line>');
      parts.push('<text x="' + (x0 - 10) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end" font-size="11" fill="#56666D" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">$' + fmtInt(Math.round(val)) + '</text>');
    }

    // X labels (years)
    var years = res.years;
    var xTicks = Math.min(6, Math.max(1, Math.round(years)));
    for (var k = 0; k <= xTicks; k++) {
      var yr = (years / xTicks) * k;
      var idx = Math.round(yr * 12);
      var x = xPos(idx);
      parts.push('<line x1="' + x.toFixed(1) + '" y1="' + y1 + '" x2="' + x.toFixed(1) + '" y2="' + (y1 + 5) + '" stroke="#C7D2D3" stroke-width="1"></line>');
      parts.push('<text x="' + x.toFixed(1) + '" y="' + (y1 + 22) + '" text-anchor="middle" font-size="11" fill="#56666D" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">' + Math.round(yr) + '</text>');
    }

    // Axis lines
    parts.push('<line x1="' + x0 + '" y1="' + y0 + '" x2="' + x0 + '" y2="' + y1 + '" stroke="#C7D2D3" stroke-width="1"></line>');
    parts.push('<line x1="' + x0 + '" y1="' + y1 + '" x2="' + (x0 + plotW) + '" y2="' + y1 + '" stroke="#C7D2D3" stroke-width="1"></line>');

    // Axis titles
    parts.push('<text x="' + (x0 + plotW / 2) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="12" fill="#56666D" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">Years</text>');
    parts.push('<text x="16" y="' + (m.t + plotH / 2) + '" text-anchor="middle" font-size="12" fill="#56666D" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" transform="rotate(-90 16 ' + (m.t + plotH / 2) + ')">Balance</text>');

    // Build line + area points
    var linePts = [];
    var step = Math.max(1, Math.floor(n / 240));
    for (var i = 0; i < n; i += step) {
      linePts.push(xPos(i).toFixed(1) + ',' + yPos(res.rows[i].balance).toFixed(1));
    }
    // ensure last point
    linePts.push(xPos(n).toFixed(1) + ',' + yPos(0).toFixed(1));

    var lineStr = linePts.join(' ');
    var areaStr = x0 + ',' + y1 + ' ' + lineStr + ' ' + (x0 + plotW) + ',' + y1;

    parts.push('<polygon points="' + areaStr + '" fill="#4E6E78" fill-opacity="0.12"></polygon>');
    parts.push('<polyline points="' + lineStr + '" fill="none" stroke="#4E6E78" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></polyline>');

    // End marker
    parts.push('<circle cx="' + xPos(n).toFixed(1) + '" cy="' + yPos(0).toFixed(1) + '" r="3" fill="#4E6E78"></circle>');

    svg.innerHTML = parts.join('');
    els.chartCard.hidden = false;
  }

  function updateNavCount() {
    els.navCount.textContent = state.rows.length ? fmtInt(state.rows.length) : '0';
  }

  function showError(msg) {
    if (msg) {
      els.formError.textContent = msg;
      els.formError.hidden = false;
    } else {
      els.formError.textContent = '';
      els.formError.hidden = true;
    }
  }

  function calculate() {
    var res = compute();
    if (res.error) {
      showError(res.error);
      return;
    }
    showError('');
    state.rows = res.rows;
    state.payment = res.payment;
    state.totalPaid = res.totalPaid;
    state.totalInterest = res.totalInterest;
    state.n = res.n;
    state.P = res.P;
    state.page = 1;

    renderResults(res);
    renderChart(res);
    renderTable(res);
    updateNavCount();

    window.knowiReportReady = true;
  }

  function reset() {
    els.loanAmount.value = '250000';
    els.interestRate.value = '6.5';
    els.termYears.value = '30';
    showError('');
    els.resultsCard.hidden = true;
    els.chartCard.hidden = true;
    els.tableCard.hidden = true;
    els.amortBody.innerHTML = '';
    els.balanceChart.innerHTML = '';
    state.rows = [];
    state.page = 1;
    updateNavCount();
    window.knowiReportReady = true;
  }

  function goPage(delta) {
    var maxPage = Math.max(1, Math.ceil(state.rows.length / state.pageSize));
    var next = state.page + delta;
    if (next < 1) next = 1;
    if (next > maxPage) next = maxPage;
    state.page = next;
    renderTable({ rows: state.rows });
  }

  function showMore() {
    state.pageSize += PAGE_SIZE;
    renderTable({ rows: state.rows });
  }

  els.form.addEventListener('submit', function (e) {
    e.preventDefault();
    calculate();
  });

  els.resetBtn.addEventListener('click', reset);
  els.prevPage.addEventListener('click', function () { goPage(-1); });
  els.nextPage.addEventListener('click', function () { goPage(1); });
  els.showMore.addEventListener('click', showMore);

  // Initial render with the default values
  calculate();
})();