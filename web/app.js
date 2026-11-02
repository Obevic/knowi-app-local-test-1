window.knowiReportReady = false;

(function () {
  'use strict';

  const STATUSES = ['To do', 'In progress', 'Done'];
  const PAGE_SIZE = 50;

  const state = {
    tasks: [],
    currentFilter: 'All',
    editingId: null,
    deletingId: null,
    visibleCount: PAGE_SIZE,
    loading: false,
    saving: false,
  };

  // ---- Element refs ----
  const $ = (id) => document.getElementById(id);
  const taskList = $('taskList');
  const filterBar = $('filterBar');
  const navCount = $('navCount');
  const listMeta = $('listMeta');
  const loadingState = $('loadingState');
  const errorState = $('errorState');
  const emptyState = $('emptyState');
  const emptyTitle = $('emptyTitle');
  const emptyBody = $('emptyBody');
  const errorBody = $('errorBody');
  const retryBtn = $('retryBtn');
  const addBtn = $('addBtn');
  const emptyAddBtn = $('emptyAddBtn');

  const taskModal = $('taskModal');
  const modalTitle = $('modalTitle');
  const modalClose = $('modalClose');
  const modalCancel = $('modalCancel');
  const modalSave = $('modalSave');
  const taskForm = $('taskForm');
  const fTitle = $('fTitle');
  const fOwner = $('fOwner');
  const fStatus = $('fStatus');

  const confirmModal = $('confirmModal');
  const confirmBody = $('confirmBody');
  const confirmCancel = $('confirmCancel');
  const confirmDelete = $('confirmDelete');

  const toast = $('toast');
  let toastTimer = null;

  // ---- Helpers ----
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function statusClass(status) {
    if (status === 'Done') return 'st-done';
    if (status === 'In progress') return 'st-progress';
    return 'st-todo';
  }

  function formatDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '—';
    const opts = { year: 'numeric', month: 'short', day: 'numeric' };
    return d.toLocaleDateString(undefined, opts);
  }

  function showToast(message, kind) {
    if (toastTimer) clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = 'toast ' + (kind === 'error' ? 'toast-error' : 'toast-ok');
    toast.hidden = false;
    toastTimer = setTimeout(() => {
      toast.hidden = true;
      toast.className = 'toast';
    }, 2600);
  }

  function setStates({ loading, error, empty }) {
    loadingState.hidden = !loading;
    errorState.hidden = !error;
    emptyState.hidden = !empty;
    taskList.hidden = loading || error || empty;
  }

  // ---- API ----
  async function api(path, options) {
    const opts = options || {};
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (!res.ok) {
      const msg = (data && data.error) || 'Request failed';
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // ---- Data ----
  async function loadTasks() {
    state.loading = true;
    setStates({ loading: true, error: false, empty: false });
    try {
      const data = await api('api/tasks');
      state.tasks = data.tasks || [];
      state.visibleCount = PAGE_SIZE;
      render();
    } catch (err) {
      if (err.status === 401) {
        showSessionExpired();
        return;
      }
      state.tasks = [];
      setStates({ loading: false, error: true, empty: false });
      errorBody.textContent =
        err.status === 503
          ? 'The task database is not available right now. Please try again in a moment.'
          : 'Something went wrong while fetching your tasks.';
    } finally {
      state.loading = false;
    }
  }

  function showSessionExpired() {
    loadingState.hidden = true;
    errorState.hidden = false;
    emptyState.hidden = true;
    taskList.hidden = true;
    emptyTitle.textContent = 'Session expired';
    emptyBody.textContent = 'Your session has ended. Please sign in again to continue.';
    emptyAddBtn.hidden = true;
    retryBtn.hidden = true;
    errorBody.textContent = '';
    // Reuse empty state for a clean sign-in prompt
    errorState.hidden = true;
    emptyState.hidden = false;
    emptyTitle.textContent = 'Session expired';
    emptyBody.textContent = 'Please sign in again to continue.';
    emptyAddBtn.hidden = true;
    retryBtn.hidden = true;
  }

  // ---- Rendering ----
  function render() {
    renderFilter();
    renderList();
    renderMeta();
    window.knowiReportReady = true;
  }

  function renderFilter() {
    const present = new Set(state.tasks.map((t) => t.status));
    const options = ['All'].concat(STATUSES.filter((s) => present.has(s)));
    // Keep current filter if it still exists, else fall back to All
    if (!options.includes(state.currentFilter)) state.currentFilter = 'All';

    filterBar.innerHTML = '';
    options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip' + (opt === state.currentFilter ? ' chip-active' : '');
      btn.setAttribute('aria-pressed', opt === state.currentFilter ? 'true' : 'false');
      btn.textContent = opt;
      btn.addEventListener('click', () => {
        state.currentFilter = opt;
        state.visibleCount = PAGE_SIZE;
        renderFilter();
        renderList();
        renderMeta();
      });
      filterBar.appendChild(btn);
    });
  }

  function filteredTasks() {
    if (state.currentFilter === 'All') return state.tasks;
    return state.tasks.filter((t) => t.status === state.currentFilter);
  }

  function renderList() {
    const rows = filteredTasks();
    const visible = rows.slice(0, state.visibleCount);

    taskList.innerHTML = '';
    visible.forEach((task) => {
      const li = document.createElement('li');
      li.className = 'ledger-row';

      const title = document.createElement('span');
      title.className = 'cell-title';
      title.textContent = task.title;

      const owner = document.createElement('span');
      owner.className = 'cell-owner';
      owner.textContent = task.owner || '—';

      const status = document.createElement('span');
      status.className = 'cell-status';
      const pill = document.createElement('span');
      pill.className = 'status-pill ' + statusClass(task.status);
      pill.textContent = task.status;
      status.appendChild(pill);

      const date = document.createElement('span');
      date.className = 'cell-date';
      date.textContent = formatDate(task.created_at);

      const actions = document.createElement('span');
      actions.className = 'cell-actions';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'row-btn';
      editBtn.textContent = 'Edit';
      editBtn.setAttribute('aria-label', 'Edit task ' + task.title);
      editBtn.addEventListener('click', () => openEdit(task));

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'row-btn row-btn-danger';
      delBtn.textContent = 'Delete';
      delBtn.setAttribute('aria-label', 'Delete task ' + task.title);
      delBtn.addEventListener('click', () => openDelete(task));

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      li.appendChild(title);
      li.appendChild(owner);
      li.appendChild(status);
      li.appendChild(date);
      li.appendChild(actions);
      taskList.appendChild(li);
    });

    // Empty state
    if (state.tasks.length === 0) {
      emptyTitle.textContent = 'No tasks yet';
      emptyBody.textContent = 'Add your first task to start tracking work.';
      emptyAddBtn.hidden = false;
      setStates({ loading: false, error: false, empty: true });
      return;
    }

    if (rows.length === 0) {
      emptyTitle.textContent = 'No tasks in this view';
      emptyBody.textContent =
        'There are no tasks with the status “' + state.currentFilter + '”.';
      emptyAddBtn.hidden = true;
      setStates({ loading: false, error: false, empty: true });
      return;
    }

    setStates({ loading: false, error: false, empty: false });

    // Show more
    const more = document.createElement('li');
    more.className = 'ledger-more';
    if (rows.length > state.visibleCount) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary btn-sm';
      btn.textContent = 'Show more (' + (rows.length - state.visibleCount) + ' remaining)';
      btn.addEventListener('click', () => {
        state.visibleCount += PAGE_SIZE;
        renderList();
      });
      more.appendChild(btn);
      taskList.appendChild(more);
    }
  }

  function renderMeta() {
    const total = state.tasks.length;
    navCount.textContent = String(total);
    const rows = filteredTasks();
    if (state.currentFilter === 'All') {
      listMeta.textContent = total + (total === 1 ? ' task' : ' tasks');
    } else {
      listMeta.textContent = rows.length + ' of ' + total;
    }
  }

  // ---- Modal: add / edit ----
  let lastFocused = null;

  function openModal(overlay) {
    lastFocused = document.activeElement;
    overlay.hidden = false;
    // focus first field
    setTimeout(() => {
      const first = overlay.querySelector('input, select, button');
      if (first) first.focus();
    }, 0);
  }

  function closeModals() {
    taskModal.hidden = true;
    confirmModal.hidden = true;
    if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
  }

  function openAdd() {
    state.editingId = null;
    modalTitle.textContent = 'Add task';
    fTitle.value = '';
    fOwner.value = '';
    fStatus.value = 'To do';
    modalSave.disabled = false;
    openModal(taskModal);
  }

  function openEdit(task) {
    state.editingId = task.id;
    modalTitle.textContent = 'Edit task';
    fTitle.value = task.title;
    fOwner.value = task.owner;
    fStatus.value = task.status;
    modalSave.disabled = false;
    openModal(taskModal);
  }

  async function saveTask(e) {
    e.preventDefault();
    if (state.saving) return;
    const title = fTitle.value.trim();
    const owner = fOwner.value.trim();
    const status = fStatus.value;

    if (!title) {
      fTitle.focus();
      showToast('Title is required', 'error');
      return;
    }
    if (!owner) {
      fOwner.focus();
      showToast('Owner is required', 'error');
      return;
    }

    state.saving = true;
    modalSave.disabled = true;
    try {
      if (state.editingId === null) {
        const data = await api('api/tasks', {
          method: 'POST',
          body: { title, owner, status },
        });
        state.tasks.unshift(data.task);
        showToast('Task added');
      } else {
        const data = await api('api/tasks/' + state.editingId, {
          method: 'PATCH',
          body: { title, owner, status },
        });
        const idx = state.tasks.findIndex((t) => t.id === state.editingId);
        if (idx !== -1) state.tasks[idx] = data.task;
        showToast('Task updated');
      }
      closeModals();
      state.visibleCount = PAGE_SIZE;
      render();
    } catch (err) {
      if (err.status === 401) {
        closeModals();
        showSessionExpired();
        return;
      }
      showToast(err.message || 'Could not save task', 'error');
    } finally {
      state.saving = false;
      modalSave.disabled = false;
    }
  }

  // ---- Delete ----
  function openDelete(task) {
    state.deletingId = task.id;
    confirmBody.textContent =
      'Delete “' + task.title + '”? This can’t be undone.';
    openModal(confirmModal);
  }

  async function doDelete() {
    if (state.deletingId === null) return;
    const id = state.deletingId;
    confirmDelete.disabled = true;
    try {
      await api('api/tasks/' + id, { method: 'DELETE' });
      state.tasks = state.tasks.filter((t) => t.id !== id);
      state.deletingId = null;
      closeModals();
      showToast('Task deleted');
      render();
    } catch (err) {
      if (err.status === 401) {
        closeModals();
        showSessionExpired();
        return;
      }
      showToast(err.message || 'Could not delete task', 'error');
    } finally {
      confirmDelete.disabled = false;
    }
  }

  // ---- Wire up ----
  addBtn.addEventListener('click', openAdd);
  emptyAddBtn.addEventListener('click', openAdd);
  retryBtn.addEventListener('click', loadTasks);
  modalClose.addEventListener('click', closeModals);
  modalCancel.addEventListener('click', closeModals);
  taskForm.addEventListener('submit', saveTask);
  confirmCancel.addEventListener('click', closeModals);
  confirmDelete.addEventListener('click', doDelete);

  // Close on overlay click
  [taskModal, confirmModal].forEach((overlay) => {
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) closeModals();
    });
  });

  // Escape to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!taskModal.hidden || !confirmModal.hidden) closeModals();
    }
  });

  // ---- Init ----
  loadTasks();
})();