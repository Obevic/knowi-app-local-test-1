window.knowiReportReady = false;

(function () {
  'use strict';

  var PAGE_SIZE = 50;
  var state = {
    tickets: [],
    categories: [],
    statuses: [],
    priorities: [],
    filterCategory: '',
    filterStatus: '',
    sortField: 'created',
    sortDir: 'desc',
    visible: PAGE_SIZE,
    viewer: null,
    currentTicketId: null,
    loading: true,
    error: null
  };

  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function cacheEls() {
    els.sidebar = $('sidebar');
    els.kpiOpen = $('kpiOpen');
    els.kpiProgress = $('kpiProgress');
    els.kpiResolved = $('kpiResolved');
    els.filterCategory = $('filterCategory');
    els.filterStatus = $('filterStatus');
    els.ticketBody = $('ticketBody');
    els.tableCount = $('tableCount');
    els.showMore = $('showMore');
    els.detailOverlay = $('detailOverlay');
    els.detailId = $('detailId');
    els.detailTitle = $('detailTitle');
    els.detailClose = $('detailClose');
    els.detailRequester = $('detailRequester');
    els.detailCategory = $('detailCategory');
    els.detailPriority = $('detailPriority');
    els.detailCreated = $('detailCreated');
    els.detailStatus = $('detailStatus');
    els.statusForm = $('statusForm');
    els.statusSelect = $('statusSelect');
    els.statusSubmit = $('statusSubmit');
    els.formMsg = $('formMsg');
    els.viewer = $('viewer');
    els.viewerAvatar = $('viewerAvatar');
    els.viewerName = $('viewerName');
    els.viewerEmail = $('viewerEmail');
    els.stateBlock = $('stateBlock');
    els.stateTitle = $('stateTitle');
    els.stateText = $('stateText');
    els.stateAction = $('stateAction');
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    var m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var day = d.getDate();
    var mon = m[d.getMonth()];
    var yr = d.getFullYear();
    var h = d.getHours();
    var min = d.getMinutes();
    var ap = h >= 12 ? 'PM' : 'AM';
    var hh = h % 12;
    if (hh === 0) hh = 12;
    var mm = (min < 10 ? '0' : '') + min;
    return day + ' ' + mon + ' ' + yr + ' · ' + hh + ':' + mm + ' ' + ap;
  }

  function statusClass(status) {
    if (status === 'Resolved') return 'chip chip-resolved';
    if (status === 'In progress') return 'chip chip-progress';
    return 'chip chip-open';
  }

  function priorityClass(priority) {
    if (priority === 'Urgent') return 'chip chip-urgent';
    if (priority === 'High') return 'chip chip-high';
    if (priority === 'Medium') return 'chip chip-medium';
    return 'chip chip-low';
  }

  function initials(name) {
    if (!name) return '?';
    var parts = String(name).trim().split(/\s+/);
    var a = parts[0] ? parts[0][0] : '';
    var b = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (a + b).toUpperCase() || '?';
  }

  function filteredTickets() {
    return state.tickets.filter(function (t) {
      if (state.filterCategory && t.category !== state.filterCategory) return false;
      if (state.filterStatus && t.status !== state.filterStatus) return false;
      return true;
    });
  }

  function sortedTickets(list) {
    var f = state.sortField;
    var dir = state.sortDir === 'asc' ? 1 : -1;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (f === 'created') {
        av = new Date(a.created).getTime();
        bv = new Date(b.created).getTime();
      } else if (f === 'id') {
        av = a.id;
        bv = b.id;
      } else {
        av = String(a[f] || '').toLowerCase();
        bv = String(b[f] || '').toLowerCase();
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  function renderKpis() {
    var open = 0, prog = 0, resolvedToday = 0;
    var now = Date.now();
    var day = 24 * 60 * 60 * 1000;
    state.tickets.forEach(function (t) {
      if (t.status === 'Open') open++;
      else if (t.status === 'In progress') prog++;
      else if (t.status === 'Resolved') {
        var ts = new Date(t.created).getTime();
        if (now - ts <= day) resolvedToday++;
      }
    });
    els.kpiOpen.textContent = open;
    els.kpiProgress.textContent = prog;
    els.kpiResolved.textContent = resolvedToday;

    var counts = { all: state.tickets.length, open: open, inprogress: prog, resolved: 0 };
    state.tickets.forEach(function (t) { if (t.status === 'Resolved') counts.resolved++; });
    var pills = document.querySelectorAll('[data-count]');
    for (var i = 0; i < pills.length; i++) {
      var key = pills[i].getAttribute('data-count');
      pills[i].textContent = counts[key] != null ? counts[key] : 0;
    }
  }

  function renderFilters() {
    els.filterCategory.innerHTML =
      '<option value="">All categories</option>' +
      state.categories.map(function (c) {
        return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
      }).join('');
    els.filterStatus.innerHTML =
      '<option value="">All statuses</option>' +
      state.statuses.map(function (s) {
        return '<option value="' + esc(s) + '">' + esc(s) + '</option>';
      }).join('');
    els.filterCategory.value = state.filterCategory;
    els.filterStatus.value = state.filterStatus;
  }

  function renderSortIndicators() {
    var btns = document.querySelectorAll('.sort-btn');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var f = b.getAttribute('data-sort');
      var active = f === state.sortField;
      b.classList.toggle('active', active);
      b.setAttribute('aria-sort', active ? (state.sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
      var arrow = b.querySelector('.sort-arrow');
      if (!arrow) {
        arrow = document.createElement('span');
        arrow.className = 'sort-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        b.appendChild(arrow);
      }
      arrow.textContent = active ? (state.sortDir === 'asc' ? '▲' : '▼') : '';
    }
  }

  function renderTable() {
    var list = sortedTickets(filteredTickets());
    var shown = list.slice(0, state.visible);
    var html = '';
    for (var i = 0; i < shown.length; i++) {
      var t = shown[i];
      html +=
        '<tr class="ticket-row" data-id="' + t.id + '" tabindex="0" role="button" aria-label="Open ticket ' + esc(t.id) + '">' +
        '<td class="cell-id">' + t.id + '</td>' +
        '<td class="cell-subject">' + esc(t.subject) + '</td>' +
        '<td class="cell-requester">' + esc(t.requester) + '</td>' +
        '<td class="cell-category">' + esc(t.category) + '</td>' +
        '<td class="cell-priority"><span class="' + priorityClass(t.priority) + '">' + esc(t.priority) + '</span></td>' +
        '<td class="cell-status"><span class="' + statusClass(t.status) + '">' + esc(t.status) + '</span></td>' +
        '<td class="cell-created">' + fmtDate(t.created) + '</td>' +
        '</tr>';
    }
    if (shown.length === 0) {
      html = '<tr class="empty-row"><td colspan="7">No tickets match the current filters.</td></tr>';
    }
    els.ticketBody.innerHTML = html;
    els.tableCount.textContent = shown.length + ' of ' + list.length + ' tickets';
    els.showMore.hidden = state.visible >= list.length;
  }

  function renderViewer() {
    if (state.viewer && state.viewer.name) {
      els.viewer.hidden = false;
      els.viewerAvatar.textContent = initials(state.viewer.name);
      els.viewerName.textContent = state.viewer.name;
      els.viewerEmail.textContent = state.viewer.email || '';
    } else {
      els.viewer.hidden = true;
    }
  }

  function showState(kind) {
    var content = document.querySelector('.content');
    var overlay = els.detailOverlay;
    if (overlay) overlay.hidden = true;
    if (content) content.hidden = true;
    els.stateBlock.hidden = false;
    if (kind === 'error') {
      els.stateTitle.textContent = 'Something went wrong';
      els.stateText.textContent = 'We could not load the ticket board. Please try again in a moment.';
      els.stateAction.hidden = true;
    } else {
      els.stateTitle.textContent = 'Session expired';
      els.stateText.textContent = 'Your sign-in has expired. Please sign in again to continue.';
      els.stateAction.hidden = false;
    }
  }

  function hideState() {
    els.stateBlock.hidden = true;
    var content = document.querySelector('.content');
    if (content) content.hidden = false;
  }

  function openDetail(id) {
    var t = state.tickets.find(function (x) { return x.id === id; });
    if (!t) return;
    state.currentTicketId = id;
    els.detailId.textContent = 'Ticket #' + t.id;
    els.detailTitle.textContent = t.subject;
    els.detailRequester.textContent = t.requester;
    els.detailCategory.textContent = t.category;
    els.detailPriority.textContent = t.priority;
    els.detailCreated.textContent = fmtDate(t.created);
    els.detailStatus.innerHTML = '<span class="' + statusClass(t.status) + '">' + esc(t.status) + '</span>';

    els.statusSelect.innerHTML = state.statuses.map(function (s) {
      return '<option value="' + esc(s) + '"' + (s === t.status ? ' selected' : '') + '>' + esc(s) + '</option>';
    }).join('');
    els.formMsg.textContent = '';
    els.statusSubmit.disabled = false;
    els.detailOverlay.hidden = false;
    document.body.classList.add('no-scroll');
    els.detailClose.focus();
  }

  function closeDetail() {
    els.detailOverlay.hidden = true;
    document.body.classList.remove('no-scroll');
    state.currentTicketId = null;
  }

  function refreshAfterStatusChange(ticket) {
    var idx = state.tickets.findIndex(function (x) { return x.id === ticket.id; });
    if (idx >= 0) state.tickets[idx] = ticket;
    renderKpis();
    renderTable();
    if (state.currentTicketId === ticket.id) {
      els.detailStatus.innerHTML = '<span class="' + statusClass(ticket.status) + '">' + esc(ticket.status) + '</span>';
      els.statusSelect.value = ticket.status;
    }
  }

  function setNavActive(key) {
    var links = document.querySelectorAll('.nav-link');
    for (var i = 0; i < links.length; i++) {
      links[i].classList.toggle('active', links[i].getAttribute('data-nav') === key);
    }
  }

  function bindEvents() {
    els.filterCategory.addEventListener('change', function () {
      state.filterCategory = els.filterCategory.value;
      state.visible = PAGE_SIZE;
      renderTable();
    });
    els.filterStatus.addEventListener('change', function () {
      state.filterStatus = els.filterStatus.value;
      state.visible = PAGE_SIZE;
      renderTable();
    });

    els.showMore.addEventListener('click', function () {
      state.visible += PAGE_SIZE;
      renderTable();
    });

    var sortBtns = document.querySelectorAll('.sort-btn');
    for (var i = 0; i < sortBtns.length; i++) {
      sortBtns[i].addEventListener('click', function () {
        var f = this.getAttribute('data-sort');
        if (state.sortField === f) {
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortField = f;
          state.sortDir = 'asc';
        }
        renderSortIndicators();
        renderTable();
      });
    }

    els.ticketBody.addEventListener('click', function (e) {
      var row = e.target.closest('.ticket-row');
      if (row) openDetail(Number(row.getAttribute('data-id')));
    });
    els.ticketBody.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        var row = e.target.closest('.ticket-row');
        if (row) {
          e.preventDefault();
          openDetail(Number(row.getAttribute('data-id')));
        }
      }
    });

    els.detailClose.addEventListener('click', closeDetail);
    els.detailOverlay.addEventListener('click', function (e) {
      if (e.target === els.detailOverlay) closeDetail();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !els.detailOverlay.hidden) closeDetail();
    });

    els.statusForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (state.currentTicketId == null) return;
      var newStatus = els.statusSelect.value;
      els.statusSubmit.disabled = true;
      els.formMsg.textContent = 'Saving…';
      fetch('api/tickets/' + state.currentTicketId + '/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })
        .then(function (r) {
          return r.json().then(function (data) { return { ok: r.ok, data: data }; });
        })
        .then(function (res) {
          els.statusSubmit.disabled = false;
          if (res.ok) {
            els.formMsg.textContent = 'Status updated.';
            refreshAfterStatusChange(res.data.ticket);
          } else {
            els.formMsg.textContent = res.data.error || 'Could not update status.';
          }
        })
        .catch(function () {
          els.statusSubmit.disabled = false;
          els.formMsg.textContent = 'Network error. Please try again.';
        });
    });

    var navLinks = document.querySelectorAll('.nav-link');
    for (var n = 0; n < navLinks.length; n++) {
      navLinks[n].addEventListener('click', function (e) {
        e.preventDefault();
        var key = this.getAttribute('data-nav');
        setNavActive(key);
        if (key === 'all') {
          state.filterStatus = '';
        } else if (key === 'open') {
          state.filterStatus = 'Open';
        } else if (key === 'inprogress') {
          state.filterStatus = 'In progress';
        } else if (key === 'resolved') {
          state.filterStatus = 'Resolved';
        }
        els.filterStatus.value = state.filterStatus;
        state.visible = PAGE_SIZE;
        renderTable();
      });
    }
  }

  function load() {
    Promise.all([
      fetch('api/me').then(function (r) {
        if (r.status === 401) throw { status: 401 };
        return r.json();
      }),
      fetch('api/tickets').then(function (r) {
        if (r.status === 401) throw { status: 401 };
        if (!r.ok) throw { status: r.status };
        return r.json();
      })
    ])
      .then(function (results) {
        state.viewer = results[0] || null;
        var data = results[1];
        state.tickets = data.tickets || [];
        state.categories = data.categories || [];
        state.statuses = data.statuses || [];
        state.priorities = data.priorities || [];
        state.loading = false;
        hideState();
        renderViewer();
        renderKpis();
        renderFilters();
        renderSortIndicators();
        renderTable();
        window.knowiReportReady = true;
      })
      .catch(function (err) {
        state.loading = false;
        if (err && err.status === 401) {
          showState('expired');
        } else {
          showState('error');
        }
        window.knowiReportReady = true;
      });
  }

  function init() {
    cacheEls();
    bindEvents();
    load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();