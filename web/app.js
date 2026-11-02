window.knowiReportReady = false;

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Element references
  // ---------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);

  const taskCountEl = $('task-count');
  const viewerNameEl = $('viewer-name');

  const addForm = $('add-form');
  const newTitle = $('new-title');
  const newOwner = $('new-owner');
  const newStatus = $('new-status');
  const addSubmit = $('add-submit');

  const statusFilter = $('status-filter');
  const taskList = $('task-list');
  const loadingEl = $('loading');
  const errorState = $('error-state');
  const errorMessage = $('error-message');
  const emptyState = $('empty-state');
  const retryBtn = $('retry-btn');

  const modalBackdrop = $('modal-backdrop');
  const editForm = $('edit-form');
  const editTitle = $('edit-title');
  const editOwner = $('edit-owner');
  const editStatus = $('edit-status');
  const modalSave = $('modal-save');
  const modalCancel = $('modal-cancel');
  const modalDelete = $('modal-delete');

  const toastEl = $('toast');

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let tasks = [];
  let editingId = null;
  let toastTimer = null;
  let lastFocused = null;

  const STATUSES = ['To do', 'In progress', 'Done'];

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function statusClass(status) {
    if (status === 'Done') return 'pill-done';
    if (status === 'In progress') return 'pill-progress';
    return 'pill-todo';
  }

  function showToast(message, kind) {
    if (toastTimer) clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.className = 'toast ' + (kind === 'error' ? 'toast-error' : 'toast-success');
    toastEl.hidden = false;
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
      toastEl.className = 'toast';
    }, 3200);
  }

  function setLoading(on) {
    loadingEl.hidden = !on;
    if (on) {
      errorState.hidden = true;
      emptyState.hidden = true;
    }
  }

  function showError(message) {
    loadingEl.hidden = true;
    emptyState.hidden = true;
    taskList.innerHTML = '';
    errorMessage.textContent = message || 'We couldn\'t load your tasks. Please try again.';
    errorState.hidden = false;
  }

  function showEmpty() {
    loadingEl.hidden = true;
    errorState.hidden = true;
    emptyState.hidden = false;
    taskList.innerHTML = '';
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function renderFilterOptions() {
    const current = statusFilter.value;
    const present = new Set(tasks.map((t) => t.status));
    const options = ['All'].concat(STATUSES.filter((s) => present.has(s)));
    statusFilter.innerHTML = '';
    options.forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      statusFilter.appendChild(o);
    });
    if (options.includes(current)) {
      statusFilter.value = current;
    } else {
      statusFilter.value = 'All';
    }
  }

  function renderList() {
    const filter = statusFilter.value;
    const visible =
      filter === 'All' ? tasks : tasks.filter((t) => t.status === filter);

    if (visible.length === 0) {
      taskList.innerHTML = '';
      if (tasks.length === 0) {
        emptyState.hidden = false;
      } else {
        emptyState.hidden = true;
        taskList.innerHTML =
          '<div class="no-results"><p>No tasks match this filter.</p></div>';
      }
      return;
    }

    emptyState.hidden = true;
    const rows = visible
      .map((t) => {
        const created = formatDate(t.created_at);
        return (
          '<div class="task-row" role="listitem" data-id="' + t.id + '">' +
          '<div class="task-main">' +
          '<span class="task-title">' + escapeHtml(t.title) + '</span>' +
          '<span class="task-owner">' +
          (t.owner ? escapeHtml(t.owner) : '<span class="task-owner-empty">Unassigned</span>') +
          '</span>' +
          '</div>' +
          '<span class="status-pill ' + statusClass(t.status) + '">' +
          escapeHtml(t.status) +
          '</span>' +
          '<span class="task-date">' + (created ? escapeHtml(created) : '—') + '</span>' +
          '<div class="task-actions">' +
          '<button class="btn btn-ghost btn-sm" type="button" data-action="edit" data-id="' +
          t.id +
          '" aria-label="Edit task: ' +
          escapeHtml(t.title) +
          '"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 20h4l10-10-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path><path d="M13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg><span>Edit</span></button>' +
          '<button class="btn btn-ghost btn-sm btn-danger-ghost" type="button" data-action="delete" data-id="' +
          t.id +
          '" aria-label="Delete task: ' +
          escapeHtml(t.title) +
          '"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 7h14M9 7V5h6v2M8 7l1 12h6l1-12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path></svg><span>Delete</span></button>' +
          '</div>' +
          '</div>'
        );
      })
      .join('');
    taskList.innerHTML = rows;
  }

  function updateCount() {
    taskCountEl.textContent = String(tasks.length);
  }

  function render() {
    renderFilterOptions();
    renderList();
    updateCount();
    window.knowiReportReady = true;
  }

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------
  async function loadTasks() {
    setLoading(true);
    try {
      const res = await fetch('api/tasks', {
        headers: { Accept: 'application/json' },
      });
      if (res.status === 401) {
        window.location.href = 'login';
        return;
      }
      if (!res.ok) {
        let msg = 'We couldn\'t load your tasks. Please try again.';
        try {
          const j = await res.json();
          if (j && j.error) msg = j.error;
        } catch (e) {}
        showError(msg);
        return;
      }
      const data = await res.json();
      tasks = Array.isArray(data.tasks) ? data.tasks : [];
      render();
    } catch (err) {
      showError('Network error. Please check your connection and try again.');
    }
  }

  // ---------------------------------------------------------------------------
  // Modal
  // ---------------------------------------------------------------------------
  function openModal(task) {
    editingId = task.id;
    editTitle.value = task.title || '';
    editOwner.value = task.owner || '';
    editStatus.value = STATUSES.includes(task.status) ? task.status : 'To do';
    lastFocused = document.activeElement;
    modalBackdrop.hidden = false;
    document.body.classList.add('modal-open');
    editTitle.focus();
  }

  function closeModal() {
    modalBackdrop.hidden = true;
    document.body.classList.remove('modal-open');
    editingId = null;
    if (lastFocused && typeof lastFocused.focus === 'function') {
      lastFocused.focus();
    }
  }

  function trapFocus(e) {
    if (modalBackdrop.hidden) return;
    if (e.key !== 'Tab') return;
    const focusables = modalBackdrop.querySelectorAll(
      'button, input, select, [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------
  async function createTask() {
    const title = newTitle.value.trim();
    if (!title) {
      newTitle.focus();
      newTitle.classList.add('input-error');
      setTimeout(() => newTitle.classList.remove('input-error'), 1200);
      return;
    }
    addSubmit.disabled = true;
    try {
      const res = await fetch('api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title,
          owner: newOwner.value.trim(),
          status: newStatus.value,
        }),
      });
      if (res.status === 401) {
        window.location.href = 'login';
        return;
      }
      if (!res.ok) {
        let msg = 'Could not add the task.';
        try {
          const j = await res.json();
          if (j && j.error) msg = j.error;
        } catch (e) {}
        showToast(msg, 'error');
        return;
      }
      const data = await res.json();
      if (data && data.task) {
        tasks.unshift(data.task);
      }
      newTitle.value = '';
      newOwner.value = '';
      newStatus.value = 'To do';
      showToast('Task added');
      render();
    } catch (err) {
      showToast('Network error. Please try again.', 'error');
    } finally {
      addSubmit.disabled = false;
    }
  }

  async function saveEdit() {
    if (editingId === null) return;
    const title = editTitle.value.trim();
    if (!title) {
      editTitle.focus();
      editTitle.classList.add('input-error');
      setTimeout(() => editTitle.classList.remove('input-error'), 1200);
      return;
    }
    modalSave.disabled = true;
    try {
      const res = await fetch('api/tasks/' + editingId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title,
          owner: editOwner.value.trim(),
          status: editStatus.value,
        }),
      });
      if (res.status === 401) {
        window.location.href = 'login';
        return;
      }
      if (!res.ok) {
        let msg = 'Could not save the task.';
        try {
          const j = await res.json();
          if (j && j.error) msg = j.error;
        } catch (e) {}
        showToast(msg, 'error');
        return;
      }
      const data = await res.json();
      const idx = tasks.findIndex((t) => t.id === editingId);
      if (idx !== -1 && data && data.task) {
        tasks[idx] = data.task;
      }
      closeModal();
      showToast('Task updated');
      render();
    } catch (err) {
      showToast('Network error. Please try again.', 'error');
    } finally {
      modalSave.disabled = false;
    }
  }

  async function deleteTask(id) {
    modalDelete.disabled = true;
    try {
      const res = await fetch('api/tasks/' + id, { method: 'DELETE' });
      if (res.status === 401) {
        window.location.href = 'login';
        return;
      }
      if (!res.ok) {
        let msg = 'Could not delete the task.';
        try {
          const j = await res.json();
          if (j && j.error) msg = j.error;
        } catch (e) {}
        showToast(msg, 'error');
        return;
      }
      tasks = tasks.filter((t) => t.id !== id);
      closeModal();
      showToast('Task deleted');
      render();
    } catch (err) {
      showToast('Network error. Please try again.', 'error');
    } finally {
      modalDelete.disabled = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Viewer identity (from trusted X-Knowi-App-User header, if exposed)
  // ---------------------------------------------------------------------------
  function initViewer() {
    const header = document.documentElement.getAttribute('data-knowi-user');
    if (header) {
      try {
        const decoded = decodeURIComponent(escape(atob(header)));
        const u = JSON.parse(decoded);
        if (u && u.name) viewerNameEl.textContent = u.name;
      } catch (e) {}
    }
  }

  // ---------------------------------------------------------------------------
  // Event wiring
  // ---------------------------------------------------------------------------
  addForm.addEventListener('submit', (e) => {
    e.preventDefault();
    createTask();
  });

  statusFilter.addEventListener('change', renderList);

  retryBtn.addEventListener('click', loadTasks);

  taskList.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = Number(btn.getAttribute('data-id'));
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    if (btn.getAttribute('data-action') === 'edit') {
      openModal(task);
    } else if (btn.getAttribute('data-action') === 'delete') {
      if (window.confirm('Delete this task? This cannot be undone.')) {
        deleteTask(id);
      }
    }
  });

  editForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveEdit();
  });

  modalCancel.addEventListener('click', closeModal);
  modalDelete.addEventListener('click', () => {
    if (editingId === null) return;
    if (window.confirm('Delete this task? This cannot be undone.')) {
      deleteTask(editingId);
    }
  });

  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modalBackdrop.hidden) {
      closeModal();
    }
  });
  document.addEventListener('keydown', trapFocus);

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  initViewer();
  loadTasks();
})();