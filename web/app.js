window.knowiReportReady = false;

(function () {
  'use strict';

  var STATUSES = ['To do', 'In progress', 'Done'];
  var PAGE_SIZE = 50;

  var state = {
    tasks: [],
    filter: 'All',
    page: 1,
    editingId: null,
    loading: false,
    error: null,
  };

  var el = {};

  function $(id) {
    return document.getElementById(id);
  }

  function cache() {
    el.app = $('app');
    el.sidebar = $('sidebar');
    el.navTasks = $('nav-tasks');
    el.countTasks = $('count-tasks');
    el.viewer = $('viewer');
    el.main = $('main');
    el.btnNew = $('btn-new');
    el.filterStatus = $('filter-status');
    el.taskList = $('task-list');
    el.dialog = $('task-dialog');
    el.dialogTitle = $('dialog-title');
    el.dialogClose = $('dialog-close');
    el.form = $('task-form');
    el.fTitle = $('f-title');
    el.fOwner = $('f-owner');
    el.fStatus = $('f-status');
    el.btnSave = $('btn-save');
    el.btnCancel = $('btn-cancel');
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
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var m = d.getMonth() + 1;
    var day = d.getDate();
    var h = d.getHours();
    var min = d.getMinutes();
    var ampm = h >= 12 ? 'PM' : 'AM';
    var hh = h % 12;
    if (hh === 0) hh = 12;
    var mm = min < 10 ? '0' + min : '' + min;
    return m + '/' + day + '/' + d.getFullYear() + '  ' + hh + ':' + mm + ' ' + ampm;
  }

  function statusClass(status) {
    if (status === 'Done') return 'status-done';
    if (status === 'In progress') return 'status-progress';
    return 'status-todo';
  }

  function visibleTasks() {
    if (state.filter === 'All') return state.tasks;
    return state.tasks.filter(function (t) {
      return t.status === state.filter;
    });
  }

  function renderFilters() {
    var present = [];
    for (var i = 0; i < STATUSES.length; i++) {
      var s = STATUSES[i];
      var found = false;
      for (var j = 0; j < state.tasks.length; j++) {
        if (state.tasks[j].status === s) { found = true; break; }
      }
      if (found) present.push(s);
    }

    var html = '';
    html += chip('All', 'All', state.filter === 'All');
    for (var k = 0; k < present.length; k++) {
      html += chip(present[k], present[k], state.filter === present[k]);
    }
    el.filterStatus.innerHTML = html;
  }

  function chip(value, label, active) {
    return (
      '<button type="button" class="filter-chip' + (active ? ' active' : '') +
      '" data-status="' + esc(value) + '" aria-pressed="' + (active ? 'true' : 'false') + '">' +
      esc(label) + '</button>'
    );
  }

  function renderList() {
    if (state.loading) {
      el.taskList.innerHTML =
        '<div class="shimmer" aria-hidden="true">' +
        '<div class="shimmer-row"></div>' +
        '<div class="shimmer-row"></div>' +
        '<div class="shimmer-row"></div>' +
        '<div class="shimmer-row"></div>' +
        '<div class="shimmer-row"></div>' +
        '</div>';
      return;
    }

    if (state.error) {
      el.taskList.innerHTML =
        '<div class="error" role="alert">' +
        '<p class="error-msg">' + esc(state.error) + '</p>' +
        '<button type="button" class="btn btn-ghost" data-action="retry">Retry</button>' +
        '</div>';
      return;
    }

    var all = state.tasks;
    if (all.length === 0) {
      el.taskList.innerHTML =
        '<div class="empty">' +
        '<p class="empty-title">No tasks yet</p>' +
        '<p class="empty-sub">Create your first task to start tracking work.</p>' +
        '</div>';
      return;
    }

    var visible = visibleTasks();
    if (visible.length === 0) {
      el.taskList.innerHTML =
        '<div class="empty">' +
        '<p class="empty-title">No ' + esc(state.filter) + ' tasks</p>' +
        '<p class="empty-sub">Switch filters or add a new task.</p>' +
        '</div>';
      return;
    }

    var start = (state.page - 1) * PAGE_SIZE;
    var end = Math.min(start + PAGE_SIZE, visible.length);
    var rows = visible.slice(start, end);

    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var t = rows[i];
      html +=
        '<div class="task-row" data-id="' + t.id + '">' +
        '<div class="task-main">' +
        '<span class="task-title">' + esc(t.title) + '</span>' +
        '<span class="task-owner">' + (t.owner ? esc(t.owner) : '<span class="muted">Unassigned</span>') + '</span>' +
        '</div>' +
        '<span class="status-pill ' + statusClass(t.status) + '">' + esc(t.status) + '</span>' +
        '<span class="task-created">' + esc(fmtDate(t.created_at)) + '</span>' +
        '<div class="task-actions">' +
        '<button type="button" class="btn btn-ghost btn-sm" data-action="edit" data-id="' + t.id + '" aria-label="Edit task">Edit</button>' +
        '<button type="button" class="btn btn-ghost btn-sm btn-danger" data-action="delete" data-id="' + t.id + '" aria-label="Delete task">Delete</button>' +
        '</div>' +
        '</div>';
    }

    if (visible.length > PAGE_SIZE) {
      var hasMore = end < visible.length;
      html +=
        '<div class="list-footer">' +
        '<span class="list-count">Showing ' + (start + 1) + '–' + end + ' of ' + visible.length + '</span>' +
        (hasMore ? '<button type="button" class="btn btn-ghost" data-action="more">Show more</button>' : '') +
        '</div>';
    }

    el.taskList.innerHTML = html;
  }

  function renderCount() {
    el.countTasks.textContent = String(state.tasks.length);
  }

  function render() {
    renderCount();
    renderFilters();
    renderList();
  }

  function setLoading(v) {
    state.loading = v;
    if (v) state.error = null;
    render();
  }

  function loadTasks() {
    setLoading(true);
    fetch('api/tasks', { headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (r.status === 401) {
          state.loading = false;
          state.error = 'Your session has expired. Please sign in again.';
          render();
          window.knowiReportReady = true;
          return;
        }
        if (!r.ok) throw new Error('Request failed');
        return r.json();
      })
      .then(function (data) {
        state.tasks = (data && data.tasks) || [];
        state.page = 1;
        setLoading(false);
        window.knowiReportReady = true;
      })
      .catch(function (e) {
        state.loading = false;
        state.error = 'Could not load tasks. Please try again.';
        render();
        window.knowiReportReady = true;
      });
  }

  function openDialog(task) {
    state.editingId = task ? task.id : null;
    el.dialogTitle.textContent = task ? 'Edit task' : 'New task';
    el.fTitle.value = task ? task.title : '';
    el.fOwner.value = task ? task.owner : '';
    el.fStatus.value = task ? task.status : 'To do';
    el.dialog.hidden = false;
    el.fTitle.focus();
  }

  function closeDialog() {
    el.dialog.hidden = true;
    state.editingId = null;
  }

  function saveTask() {
    var title = el.fTitle.value.trim();
    if (!title) {
      el.fTitle.focus();
      return;
    }
    var owner = el.fOwner.value.trim();
    var status = el.fStatus.value;
    var payload = { title: title, owner: owner, status: status };

    el.btnSave.disabled = true;
    var isEdit = state.editingId != null;

    var req = isEdit
      ? fetch('api/tasks/' + state.editingId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : fetch('api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

    req
      .then(function (r) {
        if (!r.ok) throw new Error('Save failed');
        return r.json();
      })
      .then(function () {
        closeDialog();
        loadTasks();
      })
      .catch(function () {
        el.btnSave.disabled = false;
        alert('Could not save the task. Please try again.');
      });
  }

  function deleteTask(id) {
    var task = null;
    for (var i = 0; i < state.tasks.length; i++) {
      if (state.tasks[i].id === id) { task = state.tasks[i]; break; }
    }
    var label = task ? task.title : 'this task';
    if (!window.confirm('Delete "' + label + '"? This cannot be undone.')) return;

    fetch('api/tasks/' + id, { method: 'DELETE' })
      .then(function (r) {
        if (!r.ok) throw new Error('Delete failed');
        return r.json();
      })
      .then(function () {
        loadTasks();
      })
      .catch(function () {
        alert('Could not delete the task. Please try again.');
      });
  }

  function onFilterClick(e) {
    var btn = e.target.closest ? e.target.closest('.filter-chip') : null;
    if (!btn) return;
    state.filter = btn.getAttribute('data-status') || 'All';
    state.page = 1;
    render();
  }

  function onListClick(e) {
    var btn = e.target.closest ? e.target.closest('button[data-action]') : null;
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    if (action === 'edit') {
      var id = Number(btn.getAttribute('data-id'));
      var task = null;
      for (var i = 0; i < state.tasks.length; i++) {
        if (state.tasks[i].id === id) { task = state.tasks[i]; break; }
      }
      if (task) openDialog(task);
    } else if (action === 'delete') {
      deleteTask(Number(btn.getAttribute('data-id')));
    } else if (action === 'more') {
      state.page += 1;
      renderList();
    } else if (action === 'retry') {
      loadTasks();
    }
  }

  function onFormSubmit(e) {
    e.preventDefault();
    saveTask();
  }

  function onDialogKey(e) {
    if (e.key === 'Escape' && !el.dialog.hidden) {
      closeDialog();
    }
  }

  function init() {
    cache();
    el.btnNew.addEventListener('click', function () { openDialog(null); });
    el.dialogClose.addEventListener('click', closeDialog);
    el.btnCancel.addEventListener('click', closeDialog);
    el.form.addEventListener('submit', onFormSubmit);
    el.filterStatus.addEventListener('click', onFilterClick);
    el.taskList.addEventListener('click', onListClick);
    el.dialog.addEventListener('click', function (e) {
      if (e.target === el.dialog) closeDialog();
    });
    document.addEventListener('keydown', onDialogKey);
    loadTasks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();