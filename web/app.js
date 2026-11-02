window.knowiReportReady = false;

(function () {
  'use strict';

  var PAGE_SIZE = 50;

  var els = {
    form: document.getElementById('loanForm'),
    loanAmount: document.getElementById('loanAmount'),
    interestRate: document.getElementById('interestRate'),
    termYears: document.getElementById('termYears'),
    calculateBtn: document.getElementById('calculateBtn'),
    monthlyPayment: document.getElementById('monthlyPayment'),
    totalInterest: document.getElementById('totalInterest'),
    totalPaid: document.getElementById('totalPaid'),
    amortBody: document.getElementById('amortBody'),
    tableEmpty: document.getElementById('tableEmpty'),
    pageInfo: document.getElementById('pageInfo'),
    prevPage: document.getElementById('prevPage'),
    nextPage: document.getElementById('nextPage'),
    chart: document.getElementById('balanceChart'),
    chartEmpty: document.getElementById('chartEmpty'),
    pillCalc: document.querySelector('[data-pill="calculator"]'),
    pillAmort: document.querySelector('[data-pill="amortization"]'),
    pillBalance: document.querySelector('[data-pill="balance"]')
  };

  var schedule = [];
  var currentPage = 1;
  var lastValid = { amount: 250000, rate: 6.5, years: 30 };

  function fmtMoney(n) {
    if (!isFinite(n)) return '$0.00';
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtAxis(n) {
    if (n >= 1000) {
      var k = n / 1000;
      return '$' + (k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)) + 'k';
    }
    return '$' + Math.round(n);
  }

  function fmtYear(y) {
    return y % 1 === 0 ? String(y) : y.toFixed(1);
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function buildSchedule(amount, rate, years) {
    var r = rate / 100 / 12;
    var n = Math.round(years * 12);
    var payment;
    if (r === 0) {
      payment = amount / n;
    } else {
      var f = Math.pow(1 + r, n);
      payment = (amount * r * f) / (f - 1);
    }
    var rows = [];
    var bal = amount;
    for (var m = 1; m <= n; m++) {
      var interest = bal * r;
      var principal = payment - interest;
      if (m === n) {
        principal = bal;
      }
      bal = bal - principal;
      if (bal < 0) bal = 0;
      rows.push({
        month: m,
        payment: payment,
        principal: principal,
        interest: interest,
        balance: bal
      });
    }
    return { payment: payment, rows: rows };
  }

  function renderTable() {
    var total = schedule.length;
    var totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    var start = (currentPage - 1) * PAGE_SIZE;
    var end = Math.min(start + PAGE_SIZE, total);
    var html = '';
    for (var i = start; i < end; i++) {
      var row = schedule[i];
      html +=
        '<tr>' +
        '<td class="col-num">' + row.month + '</td>' +
        '<td class="col-num">' + fmtMoney(row.payment) + '</td>' +
        '<td class="col-num">' + fmtMoney(row.principal) + '</td>' +
        '<td class="col-num">' + fmtMoney(row.interest) + '</td>' +
        '<td class="col-num">' + fmtMoney(row.balance) + '</td>' +
        '</tr>';
    }
    els.amortBody.innerHTML = html;

    els.pageInfo.textContent = 'Page ' + currentPage + ' of ' + totalPages;
    els.prevPage.disabled = currentPage <= 1;
    els.nextPage.disabled = currentPage >= totalPages;
  }

  function renderChart() {
    var svg = els.chart;
    var W = 720, H = 340;
    var padL = 64, padR = 20, padT = 20, padB = 44;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;
    var n = schedule.length;
    var maxBal = lastValid.amount;
    if (maxBal <= 0) maxBal = 1;

    var parts = [];
    parts.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#FFFFFF"></rect>');

    var gridLines = 4;
    for (var g = 0; g <= gridLines; g++) {
      var gy = padT + (plotH * g) / gridLines;
      var val = maxBal * (1 - g / gridLines);
      parts.push('<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" stroke="#EAEFEF" stroke-width="1"></line>');
      parts.push('<text x="' + (padL - 8) + '" y="' + (gy + 4) + '" text-anchor="end" font-size="11" fill="#56666D">' + esc(fmtAxis(val)) + '</text>');
    }

    var xTicks = 6;
    for (var t = 0; t <= xTicks; t++) {
      var frac = t / xTicks;
      var x = padL + plotW * frac;
      var year = (n / 12) * frac;
      parts.push('<line x1="' + x + '" y1="' + (H - padB) + '" x2="' + x + '" y2="' + (H - padB + 5) + '" stroke="#DCE3E4" stroke-width="1"></line>');
      parts.push('<text x="' + x + '" y="' + (H - padB + 20) + '" text-anchor="middle" font-size="11" fill="#56666D">' + esc(fmtYear(year)) + '</text>');
    }

    parts.push('<line x1="' + padL + '" y1="' + (H - padB) + '" x2="' + (W - padR) + '" y2="' + (H - padB) + '" stroke="#DCE3E4" stroke-width="1"></line>');
    parts.push('<line x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (H - padB) + '" stroke="#DCE3E4" stroke-width="1"></line>');

    var pts = [];
    for (var i = 0; i < n; i++) {
      var px = padL + (plotW * i) / (n - 1);
      var py = padT + plotH * (1 - schedule[i].balance / maxBal);
      pts.push(px.toFixed(1) + ',' + py.toFixed(1));
    }
    var line = 'M' + pts.join(' L');
    var area = 'M' + padL + ',' + (H - padB) + ' L' + pts.join(' L') + ' L' + (W - padR) + ',' + (H - padB) + ' Z';
    parts.push('<path d="' + area + '" fill="#4E6E78" fill-opacity="0.10"></path>');
    parts.push('<path d="' + line + '" fill="none" stroke="#4E6E78" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path>');

    var last = schedule[n - 1];
    var ex = padL + plotW;
    var ey = padT + plotH * (1 - last.balance / maxBal);
    parts.push('<circle cx="' + ex + '" cy="' + ey.toFixed(1) + '" r="3.5" fill="#4E6E78"></circle>');

    svg.innerHTML = parts.join('');
  }

  function updatePills() {
    if (els.pillCalc) els.pillCalc.textContent = '3';
    if (els.pillAmort) els.pillAmort.textContent = schedule.length;
    if (els.pillBalance) els.pillBalance.textContent = schedule.length;
  }

  function calculate() {
    var amount = parseFloat(els.loanAmount.value);
    var rate = parseFloat(els.interestRate.value);
    var years = parseFloat(els.termYears.value);

    if (!isFinite(amount) || amount <= 0 || !isFinite(rate) || rate < 0 || !isFinite(years) || years <= 0) {
      els.tableEmpty.hidden = false;
      els.chartEmpty.hidden = false;
      els.chart.innerHTML = '';
      els.amortBody.innerHTML = '';
      els.monthlyPayment.textContent = '$0.00';
      els.totalInterest.textContent = '$0.00';
      els.totalPaid.textContent = '$0.00';
      schedule = [];
      updatePills();
      window.knowiReportReady = true;
      return;
    }

    lastValid = { amount: amount, rate: rate, years: years };
    var result = buildSchedule(amount, rate, years);
    schedule = result.rows;
    currentPage = 1;

    var totalPaid = result.payment * schedule.length;
    var totalInterest = totalPaid - amount;

    els.monthlyPayment.textContent = fmtMoney(result.payment);
    els.totalInterest.textContent = fmtMoney(totalInterest);
    els.totalPaid.textContent = fmtMoney(totalPaid);

    els.tableEmpty.hidden = true;
    els.chartEmpty.hidden = true;
    renderTable();
    renderChart();
    updatePills();
    window.knowiReportReady = true;
  }

  function onInput() {
    var amount = parseFloat(els.loanAmount.value);
    var rate = parseFloat(els.interestRate.value);
    var years = parseFloat(els.termYears.value);
    if (isFinite(amount) && amount > 0 && isFinite(rate) && rate >= 0 && isFinite(years) && years > 0) {
      calculate();
    }
  }

  els.form.addEventListener('submit', function (e) {
    e.preventDefault();
    calculate();
  });

  [els.loanAmount, els.interestRate, els.termYears].forEach(function (el) {
    el.addEventListener('input', onInput);
  });

  els.prevPage.addEventListener('click', function () {
    if (currentPage > 1) {
      currentPage--;
      renderTable();
    }
  });

  els.nextPage.addEventListener('click', function () {
    var totalPages = Math.max(1, Math.ceil(schedule.length / PAGE_SIZE));
    if (currentPage < totalPages) {
      currentPage++;
      renderTable();
    }
  });

  calculate();
})();