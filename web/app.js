window.knowiReportReady = false;

const state = {
  amount: 350000,
  rate: 6.5,
  years: 30,
  schedule: [],
  visibleRows: 50,
};

const PAGE_SIZE = 50;

function el(id) {
  return document.getElementById(id);
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function computeSchedule(amount, annualRatePct, years) {
  const months = Math.round(years * 12);
  const monthlyRate = annualRatePct / 100 / 12;
  let payment;
  if (monthlyRate === 0) {
    payment = amount / months;
  } else {
    payment = (amount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
  }

  const rows = [];
  let balance = amount;
  let totalInterest = 0;

  for (let m = 1; m <= months; m += 1) {
    const interest = balance * monthlyRate;
    let principal = payment - interest;
    if (m === months) {
      principal = balance;
    }
    balance = Math.max(0, balance - principal);
    totalInterest += interest;
    rows.push({
      month: m,
      payment: m === months ? principal + interest : payment,
      principal,
      interest,
      balance,
    });
  }

  return { payment, months, rows, totalInterest, totalPaid: amount + totalInterest };
}

function validate(amount, rate, years) {
  const errors = { amount: '', rate: '', years: '' };
  if (!Number.isFinite(amount) || amount <= 0) {
    errors.amount = 'Enter an amount greater than 0.';
  } else if (amount > 100000000) {
    errors.amount = 'Enter an amount under $100,000,000.';
  }
  if (!Number.isFinite(rate) || rate < 0) {
    errors.rate = 'Enter a rate of 0 or more.';
  } else if (rate > 50) {
    errors.rate = 'Enter a rate under 50%.';
  }
  if (!Number.isFinite(years) || years <= 0) {
    errors.years = 'Enter a term greater than 0.';
  } else if (years > 50) {
    errors.years = 'Enter a term under 50 years.';
  }
  return errors;
}

function renderErrors(errors) {
  el('amount-error').textContent = errors.amount;
  el('rate-error').textContent = errors.rate;
  el('years-error').textContent = errors.years;
  el('amount-input').setAttribute('aria-invalid', errors.amount ? 'true' : 'false');
  el('rate-input').setAttribute('aria-invalid', errors.rate ? 'true' : 'false');
  el('years-input').setAttribute('aria-invalid', errors.years ? 'true' : 'false');
}

function renderResults(amount, result) {
  el('monthly-payment').textContent = formatCurrency(result.payment);
  el('total-principal').textContent = formatCurrency(amount);
  el('total-interest').textContent = formatCurrency(result.totalInterest);
  el('total-paid').textContent = formatCurrency(result.totalPaid);
  el('payoff-months').textContent = `${result.months} payments`;
}

function buildChart(rows) {
  const svg = el('balance-chart');
  svg.innerHTML = '';
  if (!rows.length) return;

  const width = 720;
  const height = 280;
  const padLeft = 72;
  const padRight = 16;
  const padTop = 16;
  const padBottom = 32;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxBalance = rows[0].balance + rows[0].principal;
  const maxMonth = rows[rows.length - 1].month;

  const xFor = (month) => padLeft + (month / maxMonth) * plotW;
  const yFor = (balance) => padTop + plotH - (balance / maxBalance) * plotH;

  const points = [{ month: 0, balance: maxBalance }, ...rows];
  const step = Math.max(1, Math.floor(points.length / 240));
  const sampled = points.filter((_, i) => i % step === 0 || i === points.length - 1);

  const linePath = sampled
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(p.month).toFixed(1)},${yFor(p.balance).toFixed(1)}`)
    .join(' ');

  const areaPath = `${linePath} L${xFor(sampled[sampled.length - 1].month).toFixed(1)},${(padTop + plotH).toFixed(1)} L${xFor(0).toFixed(1)},${(padTop + plotH).toFixed(1)} Z`;

  const ns = 'http://www.w3.org/2000/svg';
  const gridGroup = document.createElementNS(ns, 'g');
  gridGroup.setAttribute('class', 'chart-grid');

  const yTicks = 4;
  for (let i = 0; i <= yTicks; i += 1) {
    const value = maxBalance - (maxBalance / yTicks) * i;
    const y = yFor(value);
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', String(padLeft));
    line.setAttribute('x2', String(width - padRight));
    line.setAttribute('y1', y.toFixed(1));
    line.setAttribute('y2', y.toFixed(1));
    gridGroup.appendChild(line);

    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', String(padLeft - 10));
    label.setAttribute('y', (y + 4).toFixed(1));
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('class', 'chart-axis-label');
    label.textContent = `$${formatNumber(value / 1000, 0)}k`;
    gridGroup.appendChild(label);
  }

  const totalYears = Math.ceil(maxMonth / 12);
  const yearStep = totalYears > 20 ? 5 : totalYears > 10 ? 2 : 1;
  for (let year = 0; year <= totalYears; year += yearStep) {
    const month = Math.min(maxMonth, year * 12);
    const x = xFor(month);
    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', x.toFixed(1));
    label.setAttribute('y', String(height - padBottom + 20));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'chart-axis-label');
    label.textContent = `Yr ${year}`;
    gridGroup.appendChild(label);
  }

  const area = document.createElementNS(ns, 'path');
  area.setAttribute('d', areaPath);
  area.setAttribute('class', 'chart-area');

  const line = document.createElementNS(ns, 'path');
  line.setAttribute('d', linePath);
  line.setAttribute('class', 'chart-line');

  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Remaining balance declining from ${formatCurrency(maxBalance)} to zero over ${maxMonth} months.`);

  svg.appendChild(gridGroup);
  svg.appendChild(area);
  svg.appendChild(line);
}

function renderTable() {
  const tbody = el('amort-body');
  tbody.innerHTML = '';
  const rowsToShow = state.schedule.slice(0, state.visibleRows);

  if (!rowsToShow.length) {
    el('amort-empty').hidden = false;
    el('amort-table-wrap').hidden = true;
    el('table-footer').hidden = true;
    return;
  }

  el('amort-empty').hidden = true;
  el('amort-table-wrap').hidden = false;

  const frag = document.createDocumentFragment();
  rowsToShow.forEach((row) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>Month ${row.month}</td>
      <td>${formatCurrency(row.payment)}</td>
      <td>${formatCurrency(row.principal)}</td>
      <td>${formatCurrency(row.interest)}</td>
      <td>${formatCurrency(row.balance)}</td>
    `;
    frag.appendChild(tr);
  });
  tbody.appendChild(frag);

  const footer = el('table-footer');
  if (state.visibleRows < state.schedule.length) {
    footer.hidden = false;
    el('show-more-btn').textContent = `Show ${Math.min(PAGE_SIZE, state.schedule.length - state.visibleRows)} more of ${state.schedule.length - state.visibleRows} remaining`;
  } else {
    footer.hidden = true;
  }
}

function recalculate() {
  const amount = parseFloat(el('amount-input').value);
  const rate = parseFloat(el('rate-input').value);
  const years = parseFloat(el('years-input').value);

  const errors = validate(amount, rate, years);
  renderErrors(errors);

  const hasError = errors.amount || errors.rate || errors.years;
  el('results-block').hidden = Boolean(hasError);
  el('chart-card').hidden = Boolean(hasError);
  el('table-card').hidden = Boolean(hasError);
  el('invalid-state').hidden = !hasError;

  if (hasError) {
    state.schedule = [];
    window.knowiReportReady = true;
    return;
  }

  const result = computeSchedule(amount, rate, years);
  state.schedule = result.rows;
  state.visibleRows = PAGE_SIZE;

  renderResults(amount, result);
  buildChart(result.rows);
  renderTable();

  window.knowiReportReady = true;
}

function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

async function loadViewer() {
  const avatar = el('viewer-avatar');
  const nameEl = el('viewer-name');
  const subEl = el('viewer-sub');
  try {
    const res = await fetch('api/me');
    if (res.status === 401) {
      nameEl.textContent = 'Session expired';
      subEl.innerHTML = '<a href="login">Sign in again</a>';
      avatar.textContent = '?';
      return;
    }
    if (!res.ok) throw new Error('Request failed');
    const data = await res.json();
    if (data.viewer) {
      const label = data.viewer.name || data.viewer.email || 'Signed in';
      nameEl.textContent = label;
      subEl.textContent = data.viewer.email && data.viewer.email !== label ? data.viewer.email : 'Signed in';
      avatar.textContent = label.charAt(0).toUpperCase();
    } else {
      nameEl.textContent = 'Signed in';
      subEl.textContent = 'Knowi account';
      avatar.textContent = 'K';
    }
  } catch (err) {
    nameEl.textContent = 'Signed in';
    subEl.textContent = 'Knowi account';
    avatar.textContent = 'K';
  }
}

function init() {
  el('amount-input').value = state.amount;
  el('rate-input').value = state.rate;
  el('years-input').value = state.years;

  const debounced = debounce(recalculate, 150);
  ['amount-input', 'rate-input', 'years-input'].forEach((id) => {
    el(id).addEventListener('input', debounced);
  });

  el('show-more-btn').addEventListener('click', () => {
    state.visibleRows = Math.min(state.schedule.length, state.visibleRows + PAGE_SIZE);
    renderTable();
  });

  recalculate();
  loadViewer();
}

document.addEventListener('DOMContentLoaded', init);
