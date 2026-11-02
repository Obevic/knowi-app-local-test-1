window.knowiReportReady = false;

(function () {
  'use strict';

  var PAGE_SIZE = 50;

  var els = {
    form: document.getElementById('calcForm'),
    loanAmount: document.getElementById('loanAmount'),
    interestRate: document.getElementById('interestRate'),
    termYears: document.getElementById('termYears'),
    calculate: document.getElementById('calculate'),
    inputsError: document.getElementById('inputsError'),
    monthlyPayment: document.getElementById('monthlyPayment'),
    totalInterest: document.getElementById('totalInterest'),
    totalPaid: document.getElementById('totalPaid'),
    statusChip: document.getElementById('statusChip'),
    amortBody: document.getElementById('amortBody'),
    amortPrev: document.getElementById('amortPrev'),
    amortNext: document.getElementById('amortNext'),
    amortPage: document.getElementById('amortPage'),
    chart: document.getElementById('balanceChart'),
    navCalcPill: document.getElementById('navCalcPill'),
    navSchedulePill: document.getElementById('navSchedulePill'),
    navChartPill: document.getElementById('navChartPill'),
    viewerName: document.getElementById('viewerName')
  };

  var state = {
    schedule: [],
    payment: 0,
    totalInterest: 0,
    totalPaid: 0,
    principal: 0,
    n: 0,
    page: 1
  };

  function fmtMoney(v) {
    return '$' + Number(v).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function fmtAxis(v) {
    if (v >= 1000) {
      var k = v / 1000;
      return '$' + (k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)) + 'k';
    }
    return '$' + Math.round(v);
  }

  function setChip(text, kind) {
    els.statusChip.textContent = text;
    els.statusChip.className = 'chip chip-' + kind;
  }

  function showError(msg) {
    if (msg) {
      els.inputsError.textContent = msg;
      els.inputsError.hidden = false;
    } else {
      els.inputsError.textContent = '';
      els.inputsError.hidden = true;
    }
  }

  function buildSchedule(principal, annualRate, years) {
    var r = annualRate / 1200;
    var n = Math.round(years * 12);
    var payment;
    if (r === 0) {
      payment = principal / n;
    } else {
      var factor = Math.pow(1 + r, n);
      payment = (principal * r * factor) / (factor - 1);
    }

    var rows = [];
    var balance = principal;
    var totalInterest = 0;
    for (var m = 1; m <= n; m++) {
      var interest = balance * r;
      var principalPart = payment - interest;
      balance -= principalPart;
      if (balance < 0) balance = 0;
      totalInterest += interest;
      rows.push({
        month: m,
        payment: payment,
        principal: principalPart,
        interest: interest,
        balance: balance
      });
    }
    return { rows: rows, payment: payment, totalInterest: totalInterest, n: n };
  }

  function renderTable() {
    var rows = state.schedule;
    var total = rows.length;
    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    if (state.page < 1) state.page = 1;

    var start = (state.page - 1) * PAGE_SIZE;
    var end = Math.min(start + PAGE_SIZE, total);
    var frag = document.createDocumentFragment();

    for (var i = start; i < end; i++) {
      var row = rows[i];
      var tr = document.createElement('tr');

      var cMonth = document.createElement('td');
      cMonth.className = 'num';
      cMonth.textContent = row.month;

      var cPay = document.createElement('td');
      cPay.className = 'num';
      cPay.textContent = fmtMoney(row.payment);

      var cPrin = document.createElement('td');
      cPrin.className = 'num';
      cPrin.textContent = fmtMoney(row.principal);

      var cInt = document.createElement('td');
      cInt.className = 'num';
      cInt.textContent = fmtMoney(row.interest);

      var cBal = document.createElement('td');
      cBal.className = 'num';
      cBal.textContent = fmtMoney(row.balance);

      tr.appendChild(cMonth);
      tr.appendChild(cPay);
      tr.appendChild(cPrin);
      tr.appendChild(cInt);
      tr.appendChild(cBal);
      frag.appendChild(tr);
    }

    els.amortBody.innerHTML = '';
    els.amortBody.appendChild(frag);

    els.amortPage.textContent = 'Page ' + state.page + ' of ' + pages;
    els.amortPrev.disabled = state.page <= 1;
    els.amortNext.disabled = state.page >= pages;
  }

  function renderChart() {
    var svg = els.chart;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var W = 720, H = 340;
    var padL = 64, padR = 20, padT = 20, padB = 44;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;
    var baseY = padT + plotH;

    var rows = state.schedule;
    var n = state.n;
    var maxBal = state.principal;
    if (maxBal <= 0) maxBal = 1;

    function xFor(m) {
      if (n <= 1) return padL;
      return padL + (m / n) * plotW;
    }
    function yFor(b) {
      return padT + (1 - b / maxBal) * plotH;
    }

    var NS = 'http://www.w3.org/2000/svg';
    function el(tag, attrs) {
      var e = document.createElementNS(NS, tag);
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
      }
      return e;
    }

    var grid = el('g', { 'class': 'chart-grid' });
    var yTicks = 5;
    for (var t = 0; t <= yTicks; t++) {
      var val = (maxBal / yTicks) * t;
      var y = yFor(val);
      grid.appendChild(el('line', {
        x1: padL, y1: y, x2: W - padR, y2: y,
        stroke: '#E8EDEE', 'stroke-width': '1'
      }));
      var yl = el('text', {
        x: padL - 10, y: y + 4, 'text-anchor': 'end',
        'font-size': '11', fill: '#56666D'
      });
      yl.textContent = fmtAxis(val);
      grid.appendChild(yl);
    }
    svg.appendChild(grid);

    var xTicks = 6;
    var xg = el('g', { 'class': 'chart-xlabels' });
    for (var xt = 0; xt <= xTicks; xt++) {
      var mVal = Math.round((n / xTicks) * xt);
      var x = xFor(mVal);
      var xl = el('text', {
        x: x, y: baseY + 20, 'text-anchor': 'middle',
        'font-size': '11', fill: '#56666D'
      });
      xl.textContent = mVal;
      xg.appendChild(xl);
    }
    svg.appendChild(xg);

    var axes = el('g', { 'class': 'chart-axes' });
    axes.appendChild(el('line', {
      x1: padL, y1: padT, x2: padL, y2: baseY,
      stroke: '#DCE3E4', 'stroke-width': '1'
    }));
    axes.appendChild(el('line', {
      x1: padL, y1: baseY, x2: W - padR, y2: baseY,
      stroke: '#DCE3E4', 'stroke-width': '1'
    }));
    svg.appendChild(axes);

    var areaPts = 'M ' + xFor(0).toFixed(2) + ' ' + yFor(maxBal).toFixed(2) + ' ';
    var linePts = '';
    for (var i = 0; i < rows.length; i++) {
      var px = xFor(rows[i].month).toFixed(2);
      var py = yFor(rows[i].balance).toFixed(2);
      linePts += (i === 0 ? 'M ' : 'L ') + px + ' ' + py + ' ';
      areaPts += 'L ' + px + ' ' + py + ' ';
    }
    areaPts += 'L ' + xFor(n).toFixed(2) + ' ' + baseY.toFixed(2) + ' L ' + xFor(0).toFixed(2) + ' ' + baseY.toFixed(2) + ' Z';

    svg.appendChild(el('path', {
      d: areaPts, fill: '#4E6E78', 'fill-opacity': '0.12', stroke: 'none'
    }));
    svg.appendChild(el('path', {
      d: linePts, fill: 'none', stroke: '#4E6E78', 'stroke-width': '2',
      'stroke-linejoin': 'round', 'stroke-linecap': 'round'
    }));

    var xTitle = el('text', {
      x: padL + plotW / 2, y: H - 8, 'text-anchor': 'middle',
      'font-size': '12', fill: '#56666D'
    });
    xTitle.textContent = 'Month';
    svg.appendChild(xTitle);

    var yTitle = el('text', {
      x: 16, y: padT + plotH / 2, 'text-anchor': 'middle',
      'font-size': '12', fill: '#56666D',
      transform: 'rotate(-90 16 ' + (padT + plotH / 2) + ')'
    });
    yTitle.textContent = 'Remaining balance';
    svg.appendChild(yTitle);
  }

  function renderResults() {
    els.monthlyPayment.textContent = fmtMoney(state.payment);
    els.totalInterest.textContent = fmtMoney(state.totalInterest);
    els.totalPaid.textContent = fmtMoney(state.totalPaid);
  }

  function updatePills() {
    var n = state.n;
    els.navCalcPill.textContent = n > 0 ? '1' : '0';
    els.navSchedulePill.textContent = n > 0 ? String(n) : '0';
    els.navChartPill.textContent = n > 0 ? String(n) : '0';
  }

  function calculate() {
    var amount = parseFloat(els.loanAmount.value);
    var rate = parseFloat(els.interestRate.value);
    var years = parseFloat(els.termYears.value);

    if (isNaN(amount) || amount <= 0) {
      showError('Enter a loan amount greater than zero.');
      return;
    }
    if (isNaN(rate) || rate < 0 || rate > 100) {
      showError('Enter an annual interest rate between 0 and 100.');
      return;
    }
    if (isNaN(years) || years < 1 || years > 50) {
      showError('Enter a term between 1 and 50 years.');
      return;
    }
    showError('');

    var res = buildSchedule(amount, rate, years);
    state.schedule = res.rows;
    state.payment = res.payment;
    state.totalInterest = res.totalInterest;
    state.totalPaid = res.payment * res.n;
    state.principal = amount;
    state.n = res.n;
    state.page = 1;

    renderResults();
    renderTable();
    renderChart();
    updatePills();
    setChip('Calculated', 'ok');
  }

  function loadViewer() {
    fetch('api/viewer', { method: 'GET', headers: { 'Accept': 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('no viewer');
        return r.json();
      })
      .then(function (data) {
        if (data && data.name) {
          els.viewerName.textContent = data.name;
        }
      })
      .catch(function () {
        els.viewerName.textContent = 'Guest';
      });
  }

  els.form.addEventListener('submit', function (e) {
    e.preventDefault();
    calculate();
  });

  els.amortPrev.addEventListener('click', function () {
    if (state.page > 1) {
      state.page -= 1;
      renderTable();
    }
  });

  els.amortNext.addEventListener('click', function () {
    var pages = Math.max(1, Math.ceil(state.schedule.length / PAGE_SIZE));
    if (state.page < pages) {
      state.page += 1;
      renderTable();
    }
  });

  loadViewer();
  updatePills();
  window.knowiReportReady = true;
})();