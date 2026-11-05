window.knowiReportReady = false;

(function () {
  'use strict';

  // Deterministic PRNG (mulberry32) so the synthetic fleet is stable across loads.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const MODELS = [
    'Volvo FH16', 'Scania R500', 'Mercedes Actros', 'MAN TGX', 'DAF XF530',
    'Iveco S-Way', 'Renault T High', 'Ford F-Max', 'Mack Anthem', 'Kenworth T680',
    'Hino 700', 'Isuzu F-Series', 'Mitsubishi Fuso', 'Ford Transit', 'VW Crafter'
  ];

  const DEPOTS = [
    'Northgate', 'Riverside', 'Eastfield', 'Harbour', 'Westmoor',
    'Central', 'Southbank', 'Airport', 'Industrial', 'Greenway'
  ];

  const STATUSES = ['Available', 'In service', 'Retired'];

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function makePlate(rng) {
    const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ';
    const a = letters[Math.floor(rng() * letters.length)];
    const b = letters[Math.floor(rng() * letters.length)];
    const c = letters[Math.floor(rng() * letters.length)];
    const d = letters[Math.floor(rng() * letters.length)];
    const n1 = Math.floor(rng() * 10);
    const n2 = Math.floor(rng() * 10);
    const n3 = Math.floor(rng() * 10);
    const n4 = Math.floor(rng() * 10);
    return a + b + c + d + ' ' + n1 + n2 + n3 + n4;
  }

  function makeDate(rng) {
    const year = 2024 + Math.floor(rng() * 2); // 2024 or 2025
    const month = 1 + Math.floor(rng() * 12);
    const day = 1 + Math.floor(rng() * 28);
    return year + '-' + pad(month) + '-' + pad(day);
  }

  function generateFleet() {
    const rng = mulberry32(20261105);
    const vehicles = [];
    for (let i = 0; i < 30; i++) {
      vehicles.push({
        plate: makePlate(rng),
        model: MODELS[Math.floor(rng() * MODELS.length)],
        depot: DEPOTS[Math.floor(rng() * DEPOTS.length)],
        lastService: makeDate(rng),
        status: STATUSES[Math.floor(rng() * STATUSES.length)]
      });
    }
    return vehicles;
  }

  function chipClass(status) {
    if (status === 'Available') return 'chip chip-available';
    if (status === 'In service') return 'chip chip-service';
    return 'chip chip-retired';
  }

  function formatDate(iso) {
    const parts = iso.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const m = months[parseInt(parts[1], 10) - 1];
    return parts[2] + ' ' + m + ' ' + parts[0];
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function init() {
    const fleet = generateFleet();

    const searchEl = document.getElementById('search');
    const statusFilterEl = document.getElementById('statusFilter');
    const fleetBody = document.getElementById('fleetBody');
    const resultsCount = document.getElementById('resultsCount');
    const emptyState = document.getElementById('emptyState');
    const fleetTable = document.getElementById('fleetTable');
    const navCount = document.getElementById('navCount');
    const depotCount = document.getElementById('depotCount');
    const serviceCount = document.getElementById('serviceCount');
    const viewerName = document.getElementById('viewerName');

    // Populate counts.
    navCount.textContent = fleet.length;
    const uniqueDepots = new Set(fleet.map(v => v.depot));
    depotCount.textContent = uniqueDepots.size;
    const serviced = fleet.filter(v => v.status !== 'Retired').length;
    serviceCount.textContent = serviced;

    // Build status filter options from the data (exact strings).
    const statusSet = new Set(fleet.map(v => v.status));
    const statusOptions = Array.from(statusSet).sort();
    statusOptions.forEach(function (s) {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      statusFilterEl.appendChild(opt);
    });

    // Viewer name from trusted header if present.
    const viewer = window.__knowiViewer;
    if (viewer && viewer.name) {
      viewerName.textContent = viewer.name;
    }

    function render() {
      const query = (searchEl.value || '').trim().toLowerCase();
      const status = statusFilterEl.value;

      const filtered = fleet.filter(function (v) {
        if (status && v.status !== status) return false;
        if (query) {
          const hay = (v.plate + ' ' + v.model + ' ' + v.depot).toLowerCase();
          if (hay.indexOf(query) === -1) return false;
        }
        return true;
      });

      resultsCount.textContent = filtered.length + ' of ' + fleet.length + ' vehicles';

      if (filtered.length === 0) {
        fleetBody.innerHTML = '';
        emptyState.hidden = false;
        fleetTable.hidden = true;
        return;
      }

      emptyState.hidden = true;
      fleetTable.hidden = false;

      const rows = filtered.map(function (v) {
        return (
          '<tr>' +
          '<td class="cell-plate">' + escapeHtml(v.plate) + '</td>' +
          '<td class="cell-model">' + escapeHtml(v.model) + '</td>' +
          '<td class="cell-depot">' + escapeHtml(v.depot) + '</td>' +
          '<td class="cell-date">' + formatDate(v.lastService) + '</td>' +
          '<td class="cell-status"><span class="' + chipClass(v.status) + '">' + escapeHtml(v.status) + '</span></td>' +
          '</tr>'
        );
      });

      fleetBody.innerHTML = rows.join('');
    }

    searchEl.addEventListener('input', render);
    statusFilterEl.addEventListener('change', render);

    render();

    window.knowiReportReady = true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();