window.knowiReportReady = false;

(function () {
  'use strict';

  var PAGE_SIZE = 50;

  var els = {
    loanAmount: document.getElementById('loanAmount'),
    interestRate: document.getElementById('interestRate'),
    termYears: document.getElementById('termYears'),
    calcBtn: document.getElementById('calcBtn'),
    calcForm: document.getElementById('calcForm'),
    monthlyPayment: document.getElementById('monthlyPayment'),
    paymentNote: document.getElementById('paymentNote'),
    balanceChart: document.getElementById('balanceChart'),
    amortBody: document.getElementById('amortBody'),
    showMoreBtn: document.getElementById('showMoreBtn'),
    tableCount: document.getElementById('tableCount'),
    navCount: document.getElementById('navCount'),
    viewerName: document.getElementById('viewerName')
  };

  var state = {
    rows: [],
    payment: 0,
    totalInterest: 0,
    totalPaid: 0,
    visible: 0
  };

  var fmtUSD = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  function fmtMoney(v) {
    return fmtUSD.format(v);
  }

  function fmtInt(v) {
    return Math.round(v).toLocaleString('en-US');
  }

  function fmtPct(v) {
    return v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  }

  function fmtCompact(v) {
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
    return '$' + Math.round(v);
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

    if (!isFinite(P) || P <= 0) {
      return { error: 'Enter a loan amount greater than zero.' };
    }
    if (!isFinite(rate) || rate < 0 || rate > 100) {
      return { error: 'Enter an annual interest rate between 0 and 100.' };
    }
    if (!isFinite(years) || years < 1 || years > 50) {
      return { error: 'Enter a term between 1 and 50 years.' };
    }

    var r = rate / 1200;
    var n = Math.round(years * 12);
    var payment;
    if (r === 0) {
      payment = P / n;
    } else {
      var f = Math.pow(1 + r, n);
      payment = (P * r * f) / (f - 1);
    }

    var balance = P;
    var rows = [];
    var totalInterest = 0;
    var totalPaid = 0;

    for (var m = 1; m <= n; m++) {
      var interest = balance * r;
      var principal = payment - interest;
      balance -= principal;
      if (balance < 0) balance = 0;
      totalInterest += interest;
      totalPaid += payment;
      rows.push({
        month: m,
        payment: payment,
        principal: principal,
        interest: interest,
        balance: balance
      });
    }

    return {
      ok: true,
      P: P,
      rate: rate,
      years: years,
      n: n,
      payment: payment,
      rows: rows,
      totalInterest: totalInterest,
      totalPaid: totalPaid
    };
  }

  function renderPayment(res) {
    els.monthlyPayment.textContent = fmtMoney(res.payment);
    els.paymentNote.textContent =
      fmtMoney(res.totalPaid) + ' total paid over ' + res.n + ' months · ' +
      fmtMoney(res.totalInterest) + ' in interest.';
  }

  function renderChart(res) {
    var svg = els.balanceChart;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var W = 720, H = 320;
    var padL = 64, padR = 20, padT = 20, padB = 44;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;
    var n = res.n;
    var maxBal = res.P;

    function xAt(i) {
      return padL + (n === 1 ? 0 : (i / (n - 1)) * plotW);
    }
    function yAt(v) {
      return padT + (1 - v / maxBal) * plotH;
    }

    var NS = 'http://www.w3.org/2000/svg';
    function el(tag, attrs) {
      var e = document.createElementNS(NS, tag);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      return e;
    }

    // Gridlines + y labels
    var yTicks = 4;
    for (var t = 0; t <= yTicks; t++) {
      var val = (maxBal / yTicks) * t;
      var y = yAt(val);
      svg.appendChild(el('line', {
        x1: padL, y1: y, x2: W - padR, y2: y,
        stroke: '#E4E9EA', 'stroke-width': '1'
      }));
      var yl = el('text', {
        x: padL - 10, y: y + 4, 'text-anchor': 'end',
        fill: '#56666D', 'font-size': '11', 'font-family': 'system-ui, sans-serif'
      });
      yl.textContent = fmtCompact(val);
      svg.appendChild(yl);
    }

    // X labels (years)
    var xTicks = 5;
    for (var xt = 0; xt <= xTicks; xt++) {
      var idx = Math.round((n - 1) * (xt / xTicks));
      var x = xAt(idx);
      var xl = el('text', {
        x: x, y: H - padB + 20, 'text-anchor': 'middle',
        fill: '#56666D', 'font-size': '11', 'font-family': 'system-ui, sans-serif'
      });
      xl.textContent = Math.round(idx / 12) + 'y';
      svg.appendChild(xl);
    }

    // Axis lines
    svg.appendChild(el('line', {
      x1: padL, y1: padT, x2: padL, y2: H - padB,
      stroke: '#C7D0D2', 'stroke-width': '1'
    }));
    svg.appendChild(el('line', {
      x1: padL, y1: H - padB, x2: W - padR, y2: H - padB,
      stroke: '#C7D0D2', 'stroke-width': '1'
    }));

    // Balance line
    var pts = [];
    pts.push(xAt(0) + ',' + yAt(res.P));
    for (var i = 0; i < res.rows.length; i++) {
      pts.push(xAt(i + 1) + ',' + yAt(res.rows[i].balance));
    }
    svg.appendChild(el('polyline', {
      points: pts.join(' '),
      fill: 'none',
      stroke: '#4E6E78',
      'stroke-width': '2',
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round'
    }));

    // Start dot
    svg.appendChild(el('circle', {
      cx: xAt(0), cy: yAt(res.P), r: '3',
      fill: '#4E6E78', stroke: '#FFFFFF', 'stroke-width': '1.5'
    }));
  }

  function renderTable(res) {
    state.rows = res.rows;
    state.visible = Math.min(PAGE_SIZE, res.rows.length);
    drawRows();
    updateTableMeta(res);
  }

  function drawRows() {
    var html = '';
    for (var i = 0; i < state.visible; i++) {
      var r = state.rows[i];
      html +=
        '<tr>' +
        '<td class="col-month">' + r.month + '</td>' +
        '<td class="col-num">' + fmtMoney(r.payment) + '</td>' +
        '<td class="col-num">' + fmtMoney(r.principal) + '</td>' +
        '<td class="col-num">' + fmtMoney(r.interest) + '</td>' +
        '<td class="col-num">' + fmtMoney(r.balance) + '</td>' +
        '</tr>';
    }
    els.amortBody.innerHTML = html;
  }

  function updateTableMeta(res) {
    var total = state.rows.length;
    els.tableCount.textContent =
      'Showing ' + state.visible + ' of ' + total + ' months';
    els.showMoreBtn.hidden = state.visible >= total;
    els.navCount.textContent = fmtInt(total);
  }

  function showMore() {
    state.visible = Math.min(state.visible + PAGE_SIZE, state.rows.length);
    drawRows();
    updateTableMeta({});
  }

  function resetEmpty() {
    els.monthlyPayment.textContent = '$0.00';
    els.paymentNote.textContent = 'Enter a loan amount, rate and term, then press Calculate.';
    els.amortBody.innerHTML =
      '<tr class="row-empty"><td colspan="5">No schedule yet. Calculate a loan to build the table.</td></tr>';
    els.tableCount.textContent = '';
    els.showMoreBtn.hidden = true;
    els.navCount.textContent = '0';
    var svg = els.balanceChart;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var NS = 'http://www.w3.org/2000/svg';
    var t = document.createElementNS(NS, 'text');
    t.setAttribute('class', 'chart-empty');
    t.setAttribute('x', '360');
    t.setAttribute('y', '160');
    t.setAttribute('text-anchor', 'middle');
    t.textContent = 'No data yet';
    svg.appendChild(t);
  }

  function handleCalculate(e) {
    if (e) e.preventDefault();
    var res = compute();
    if (res.error) {
      els.paymentNote.textContent = res.error;
      els.monthlyPayment.textContent = '$0.00';
      els.amortBody.innerHTML =
        '<tr class="row-empty"><td colspan="5">' + esc(res.error) + '</td></tr>';
      els.tableCount.textContent = '';
      els.showMoreBtn.hidden = true;
      return;
    }
    renderPayment(res);
    renderChart(res);
    renderTable(res);
  }

  function initViewer() {
    var name = 'Guest';
    try {
      var h = document.cookie.split('; ')
        .filter(function (c) { return c.indexOf('knowi_user=') === 0; })[0];
      if (h) {
        var decoded = decodeURIComponent(h.split('=').slice(1).join('='));
        var obj = JSON.parse(decoded);
        if (obj && obj.name) name = obj.name;
      }
    } catch (err) { /* keep default */ }
    els.viewerName.textContent = name;
  }

  function init() {
    initViewer();
    els.calcForm.addEventListener('submit', handleCalculate);
    els.showMoreBtn.addEventListener('click', showMore);
    handleCalculate();
    window.knowiReportReady = true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();