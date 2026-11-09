window.knowiReportReady = false;

(function () {
  'use strict';

  const PAGE_SIZE = 50;
  const PRIORITY_ORDER = { Low: 0, Medium: 1, High: 2, Urgent: 3 };

  const state = {
    me: null,
    tickets: [],
    categories: [],
    statuses: [],
    priorities: [],
    filterCategory: '',
    filterStatus: '',
    sortKey: 'created',
    sortDir: 'desc',
    visible: PAGE_SIZE,
    selectedId: null,
    loading: true,
    error: null,
    sessionExpired: false
  };

  const $ = (id) => document.getElementById(id);

  const el = {
    sidebar: $('sidebar'),
    viewer: $('viewer'),
    viewerAvatar: $('viewer-avatar'),
    viewerName: $('viewer-name'),
    viewerEmail: $('viewer-email'),
    kpis: $('kpis'),
    kpiOpen: $('kpi-open'),
    kpiInprogress: $('kpi-inprogress'),
    kpiResolved: $('kpi-resolved'),
    filterCategory: $('filter-category'),
    filterStatus: $('filter-status'),
    table: $('tickets-table'),
    tbody: $('tickets-body'),
    tableCount: $('table-count'),
    showMore: $('show-more'),
    detail: $('detail'),
    detailId: $('detail-id'),
    detailTitle: $('detail-title'),
    detailClose: $('detail-close'),
    detailRequester: $('detail-requester'),
    detailCategory: $('detail-category'),
    detailPriority: $('detail-priority'),
    detailCreated: $('detail-created'),
    statusForm: $('status-form'),
    statusSelect: $('status-select'),
    statusSave: $('status-save'),
    formMsg: $('form-msg'),
    stateBox: $('state'),
    stateIcon: $('state-icon'),
    stateTitle: $('state-title'),
    stateBody: $('state-body'),
    stateAction: $('state-action')
  };

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatDateTime(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function statusClass(status) {
    if (status === 'Resolved') return 'chip-resolved';
    if (status === 'In progress') return 'chip-inprogress';
    return 'chip-open';
  }

  function priorityClass(priority) {
    if (priority === 'Urgent') return 'chip-urgent';
    if (priority === 'High') return 'chip-high';
    if (priority === 'Medium') return 'chip-medium';
    return 'chip-low';
  }

  function latestDayKey() {
    let max = null;
    for (const t of state.tickets) {
      const d = new Date(t.created);
      if (isNaN(d.getTime())) continue;
      const key = d.toDateString();
      if (max === null || key > max) max = key;
    }
    return max;
  }

  function computeKpis() {
    const latest = latestDayKey();
    let open = 0;
    let inprogress = 0;
    let resolvedToday = 0;
    for (const t of state.tickets) {
      if (t.status === 'Open') open++;
      else if (t.status === 'In progress') inprogress++;
      if (t.status === 'Resolved' && latest && new Date(t.created).toDateString() === latest) {
        resolvedToday++;
      }
    }
    return { open, inprogress, resolvedToday };
  }

  function renderKpis() {
    const k = computeKpis();
    el.kpiOpen.textContent = k.open;
    el.kpiInprogress.textContent = k.inprogress;
    el.kpiResolved.textContent = k.resolvedToday;
    const counts = { all: state.tickets.length, open: k.open, inprogress: k.inprogress, resolved: 0 };
    for (const t of state.tickets) if (t.status === 'Resolved') counts.resolved++;
    const map = { all: 'count-all', open: 'count-open', inprogress: 'count-inprogress', resolved: 'count-resolved' };
    for (const key in map) {
      const node = document.getElementById(map[key]);
      if (node) node.textContent = counts[key];
    }
  }

  function getFiltered() {
    let rows = state.tickets.slice();
    if (state.filterCategory) rows = rows.filter((t) => t.category === state.filterCategory);
    if (state.filterStatus) rows = rows.filter((t) => t.status === state.filterStatus);
    const key = state.sortKey;
    const dir = state.sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      let av, bv;
      if (key === 'priority') {
        av = PRIORITY_ORDER[a.priority] ?? 99;
        bv = PRIORITY_ORDER[b.priority] ?? 99;
      } else if (key === 'created') {
        av = new Date(a.created).getTime();
        bv = new Date(b.created).getTime();
      } else if (key === 'id') {
        av = a.id;
        bv = b.id;
      } else {
        av = String(a[key] || '').toLowerCase();
        bv = String(b[key] || '').toLowerCase();
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return rows;
  }

  function renderTable() {
    const rows = getFiltered();
    const visibleRows = rows.slice(0, state.visible);
    let html = '';
    for (const t of visibleRows) {
      const selected = t.id === state.selectedId ? ' is-selected' : '';
      html +=
        '<tr class="ticket-row' + selected + '" data-id="' + t.id + '" tabindex="0" role="button" aria-label="Open ticket ' + t.id + '">' +
        '<td class="cell-id">' + t.id + '</td>' +
        '<td class="cell-subject">' + escapeHtml(t.subject) + '</td>' +
        '<td>' + escapeHtml(t.requester) + '</td>' +
        '<td>' + escapeHtml(t.category) + '</td>' +
        '<td><span class="chip ' + priorityClass(t.priority) + '">' + escapeHtml(t.priority) + '</span></td>' +
        '<td><span class="chip ' + statusClass(t.status) + '">' + escapeHtml(t.status) + '</span></td>' +
        '<td class="cell-created">' + formatDate(t.created) + '</td>' +
        '</tr>';
    }
    if (visibleRows.length === 0) {
      html = '<tr class="empty-row"><td colspan="7">No tickets match the current filters.</td></tr>';
    }
    el.tbody.innerHTML = html;
    el.tableCount.textContent = rows.length + (rows.length === 1 ? ' ticket' : ' tickets');
    el.showMore.hidden = rows.length <= state.visible;
    updateSortIndicators();
  }

  function updateSortIndicators() {
    const ths = el.table.querySelectorAll('th[data-key]');
    ths.forEach((th) => {
      const key = th.getAttribute('data-key');
      const btn = th.querySelector('.th-btn');
      if (key === state.sortKey) {
        th.setAttribute('aria-sort', state.sortDir === 'asc' ? 'ascending' : 'descending');
        if (btn) btn.textContent = btn.textContent.replace(/ [▲▼]$/, '') + (state.sortDir === 'asc' ? ' ▲' : ' ▼');
      } else {
        th.setAttribute('aria-sort', 'none');
        if (btn) btn.textContent = btn.textContent.replace(/ [▲▼]$/, '');
      }
    });
  }

  function resetSortButtons() {
    const ths = el.table.querySelectorAll('th[data-key]');
    ths.forEach((th) => {
      const btn = th.querySelector('.th-btn');
      if (btn) btn.textContent = btn.textContent.replace(/ [▲▼]$/, '');
      th.setAttribute('aria-sort', 'none');
    });
  }

  function renderDetail() {
    const t = state.tickets.find((x) => x.id === state.selectedId);
    if (!t) {
      el.detail.hidden = true;
      return;
    }
    el.detail.hidden = false;
    el.detailId.textContent = 'Ticket #' + t.id;
    el.detailTitle.textContent = t.subject;
    el.detailRequester.textContent = t.requester;
    el.detailCategory.textContent = t.category;
    el.detailPriority.textContent = t.priority;
    el.detailCreated.textContent = formatDateTime(t.created);
    el.statusSelect.innerHTML = state.statuses
      .map((s) => '<option value="' + escapeHtml(s) + '"' + (s === t.status ? ' selected' : '') + '>' + escapeHtml(s) + '</option>')
      .join('');
    el.formMsg.textContent = '';
  }

  function renderViewer() {
    if (state.me && state.me.name) {
      el.viewer.hidden = false;
      el.viewerName.textContent = state.me.name;
      el.viewerEmail.textContent = state.me.email || '';
      const initials = state.me.name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0].toUpperCase())
        .join('');
      el.viewerAvatar.textContent = initials || '?';
    } else {
      el.viewer.hidden = true;
    }
  }

  function showState(kind) {
    el.stateBox.hidden = false;
    el.kpis.hidden = true;
    el.detail.hidden = true;
    const panel = document.querySelector('.panel');
    if (panel) panel.hidden = true;
    if (kind === 'error') {
      el.stateTitle.textContent = 'Something went wrong';
      el.stateBody.textContent = 'We could not load the ticket board. Please try again.';
      el.stateAction.hidden = true;
      el.stateAction.textContent = 'Try again';
    } else {
      el.stateTitle.textContent = 'Session expired';
      el.stateBody.textContent = 'Your sign-in has expired. Please sign in again to continue.';
      el.stateAction.hidden = false;
      el.stateAction.textContent = 'Sign in again';
    }
  }

  function hideState() {
    el.stateBox.hidden = true;
    el.kpis.hidden = false;
    const panel = document.querySelector('.panel');
    if (panel) panel.hidden = false;
  }

  function setLoading(loading) {
    state.loading = loading;
    if (loading) {
      el.tbody.innerHTML =
        '<tr class="skeleton-row"><td colspan="7"><div class="skeleton"></div></td></tr>';
    }
  }

  function populateFilters() {
    el.filterCategory.innerHTML = '<option value="">All categories</option>' +
      state.categories.map((c) => '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>').join('');
    el.filterStatus.innerHTML = '<option value="">All statuses</option>' +
      state.statuses.map((s) => '<option value="' + escapeHtml(s) + '">' + escapeHtml(s) + '</option>').join('');
  }

  function applyNavFilter(status) {
    state.filterStatus = status;
    el.filterStatus.value = status;
    state.visible = PAGE_SIZE;
    renderTable();
  }

  function setActiveNav(status) {
    const links = document.querySelectorAll('.nav-link');
    links.forEach((link) => {
      const nav = link.getAttribute('data-nav');
      let active = false;
      if (nav === 'all') active = !state.filterStatus;
      else if (nav === 'open') active = state.filterStatus === 'Open';
      else if (nav === 'inprogress') active = state.filterStatus === 'In progress';
      else if (nav === 'resolved') active = state.filterStatus === 'Resolved';
      link.classList.toggle('is-active', active);
    });
  }

  function selectTicket(id) {
    state.selectedId = id;
    renderTable();
    renderDetail();
    if (window.matchMedia('(max-width: 860px)').matches) {
      el.detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function closeDetail() {
    state.selectedId = null;
    renderTable();
    renderDetail();
  }

  async function load() {
    setLoading(true);
    try {
      const meRes = await fetch('api/me', { headers: { Accept: 'application/json' } });
      if (meRes.status === 401) {
        state.sessionExpired = true;
        hideState();
        showState('session');
        window.knowiReportReady = true;
        return;
      }
      const me = meRes.ok ? await meRes.json() : null;
      state.me = me || null;

      const res = await fetch('api/tickets', { headers: { Accept: 'application/json' } });
      if (res.status === 401) {
        state.sessionExpired = true;
        hideState();
        showState('session');
        window.knowiReportReady = true;
        return;
      }
      if (!res.ok) throw new Error('Failed to load tickets');
      const data = await res.json();
      state.tickets = data.tickets || [];
      state.categories = data.categories || [];
      state.statuses = data.statuses || [];
      state.priorities = data.priorities || [];
      state.error = null;
      hideState();
      populateFilters();
      renderViewer();
      renderKpis();
      renderTable();
      renderDetail();
      setActiveNav();
    } catch (err) {
      state.error = err;
      hideState();
      showState('error');
    } finally {
      setLoading(false);
      window.knowiReportReady = true;
    }
  }

  function bindEvents() {
    el.filterCategory.addEventListener('change', () => {
      state.filterCategory = el.filterCategory.value;
      state.visible = PAGE_SIZE;
      renderTable();
    });
    el.filterStatus.addEventListener('change', () => {
      state.filterStatus = el.filterStatus.value;
      state.visible = PAGE_SIZE;
      renderTable();
      setActiveNav();
    });

    el.showMore.addEventListener('click', () => {
      state.visible += PAGE_SIZE;
      renderTable();
    });

    const ths = el.table.querySelectorAll('th[data-key]');
    ths.forEach((th) => {
      const key = th.getAttribute('data-key');
      const btn = th.querySelector('.th-btn');
      const handler = () => {
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortKey = key;
          state.sortDir = 'asc';
        }
        resetSortButtons();
        renderTable();
      };
      if (btn) btn.addEventListener('click', handler);
      th.addEventListener('click', (e) => {
        if (e.target.closest('.th-btn')) return;
        handler();
      });
    });

    el.tbody.addEventListener('click', (e) => {
      const row = e.target.closest('tr.ticket-row');
      if (!row) return;
      selectTicket(Number(row.getAttribute('data-id')));
    });
    el.tbody.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const row = e.target.closest('tr.ticket-row');
      if (!row) return;
      e.preventDefault();
      selectTicket(Number(row.getAttribute('data-id')));
    });

    el.detailClose.addEventListener('click', closeDetail);

    el.statusForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ticket = state.tickets.find((t) => t.id === state.selectedId);
      if (!ticket) return;
      const newStatus = el.statusSelect.value;
      el.statusSave.disabled = true;
      el.formMsg.textContent = 'Saving…';
      try {
        const res = await fetch('api/tickets/' + ticket.id + '/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ status: newStatus })
        });
        if (res.status === 401) {
          state.sessionExpired = true;
          hideState();
          showState('session');
          window.knowiReportReady = true;
          return;
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to update status');
        }
        const data = await res.json();
        const updated = data.ticket;
        const idx = state.tickets.findIndex((t) => t.id === ticket.id);
        if (idx !== -1) state.tickets[idx] = updated;
        renderKpis();
        renderTable();
        renderDetail();
        el.formMsg.textContent = 'Status updated to ' + newStatus + '.';
      } catch (err) {
        el.formMsg.textContent = err.message || 'Failed to update status';
      } finally {
        el.statusSave.disabled = false;
      }
    });

    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const nav = link.getAttribute('data-nav');
        let status = '';
        if (nav === 'open') status = 'Open';
        else if (nav === 'inprogress') status = 'In progress';
        else if (nav === 'resolved') status = 'Resolved';
        applyNavFilter(status);
        setActiveNav();
      });
    });
  }

  function init() {
    bindEvents();
    load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();