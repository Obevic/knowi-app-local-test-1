window.knowiReportReady = false;

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Element references
  // ---------------------------------------------------------------------------
  var app = document.getElementById('app');
  var navCount = document.getElementById('nav-count');
  var viewerName = document.getElementById('viewer-name');
  var addBtn = document.getElementById('add-btn');
  var filterBar = document.getElementById('filter-bar');
  var taskRows = document.getElementById('task-rows');
  var emptyState = document.getElementById('empty-state');
  var errorBanner = document.getElementById('error-banner');
  var sessionExpired = document.getElementById('session-expired');
  var loginLink = document.getElementById('login-link');

  var taskModal = document.getElementById('task-modal');
  var taskForm = document.getElementById('task-form');
  var taskTitle = document.getElementById('task-title');
  var taskOwner = document.getElementById('task-owner');
  var taskStatus = document.getElementById('task-status');
  var taskSave = document.getElementById('task-save');
  var taskCancel = document.getElementById('task-cancel');
  var taskEditId = document.getElementById('task-edit-id');
  var taskModalTitle = document.getElementById('task-modal-title');

  var deleteModal = document.getElementById('delete-modal');
  var deleteConfirm = document.getElementById('delete-confirm');
  var deleteCancel = document.getElementById('delete-cancel');
  var deleteId = document.getElementById('delete-id');

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  var allTasks = [];
  var activeFilter = 'all';
  var PAGE_SIZE = 50;
  var visibleCount = PAGE_SIZE;
  var lastFocused = null;

  var STATUS_ORDER = ['To do', 'In progress', 'Done'];

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(value) {
    if (!value) return '—';
    var d = new Date(value);
    if (isNaN(d.getTime())) return '—';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var day = d.getDate();
    var month = months[d.getMonth()];
    var year = d.getFullYear();
    var h = d.getHours();
    var m = d.getMinutes();
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    var mm = m < 10 ? '0' + m : '' + m;
    return month + ' ' + day + ', ' + year + ' · ' + h12 + ':' + mm + ' ' + ampm;
  }

  function statusClass(status) {
    if (status === 'Done') return 'status-done';
    if (status === 'In progress') return 'status-progress';
    return 'status-todo';
  }

  function counts() {
    var c = { all: allTasks.length, 'To do': 0, 'In progress': 0, 'Done': 0 };
    for (var i = 0; i < allTasks.length; i++) {
      var s = allTasks[i].status;
      if (c[s] !== undefined) c[s] += 1;
    }
    return c;
  }

  function filteredTasks() {
    if (activeFilter === 'all') return allTasks.slice();
    return allTasks.filter(function (t) { return t.status === activeFilter; });
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function renderSkeleton() {
    var html = '';
    for (var i = 0; i < 6; i++) {
      html +=
        '<tr class="skeleton-row">' +
        '<td class="col-task"><span class="sk sk-title"></span></td>' +
        '<td class="col-owner"><span class="sk sk-owner"></span></td>' +
        '<td class="col-status"><span class="sk sk-pill"></span></td>' +
        '<td class="col-created"><span class="sk sk-date"></span></td>' +
        '<td class="col-actions"></td>' +
        '</tr>';
    }
    taskRows.innerHTML = html;
    emptyState.hidden = true;
  }

  function renderTable() {
    var list = filteredTasks();
    var total = list.length;
    var shown = Math.min(visibleCount, total);

    if (total === 0) {
      taskRows.innerHTML = '';
      emptyState.hidden = false;
      return;
    }

    var html = '';
    for (var i = 0; i < shown; i++) {
      var t = list[i];
      var id = t.id;
      html +=
        '<tr data-id="' + id + '">' +
        '<td class="col-task"><span class="task-name">' + escapeHtml(t.title) + '</span></td>' +
        '<td class="col-owner">' + escapeHtml(t.owner) + '</td>' +
        '<td class="col-status"><span class="status-pill ' + statusClass(t.status) + '">' + escapeHtml(t.status) + '</span></td>' +
        '<td class="col-created">' + formatDate(t.created_at) + '</td>' +
        '<td class="col-actions">' +
        '<button class="row-btn edit-btn" data-id="' + id + '" type="button" aria-label="Edit task ' + escapeHtml(t.title) + '">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 20h4L18.5 9.5a2 2 0 0 0-2.8-2.8L5.2 17.2 4 20z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path></svg>' +
        '</button>' +
        '<button class="row-btn delete-btn" data-id="' + id + '" type="button" aria-label="Delete task ' + escapeHtml(t.title) + '">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path></svg>' +
        '</button>' +
        '</td>' +
        '</tr>';
    }

    if (total > shown) {
      html +=
        '<tr class="more-row"><td colspan="5">' +
        '<button class="show-more" type="button">Show more (' + (total - shown) + ' remaining)</button>' +
        '</td></tr>';
    }

    taskRows.innerHTML = html;
    emptyState.hidden = true;
  }

  function updateCounts() {
    var c = counts();
    if (navCount) navCount.textContent = c.all;
    var btns = filterBar.querySelectorAll('.filter-btn');
    for (var i = 0; i < btns.length; i++) {
      var st = btns[i].getAttribute('data-status');
      var pill = btns[i].querySelector('.filter-count');
      if (pill) pill.textContent = c[st] !== undefined ? c[st] : 0;
    }
  }

  function updateFilterActive() {
    var btns = filterBar.querySelectorAll('.filter-btn');
    for (var i = 0; i < btns.length; i++) {
      var st = btns[i].getAttribute('data-status');
      if (st === activeFilter) {
        btns[i].classList.add('active');
        btns[i].setAttribute('aria-pressed', 'true');
      } else {
        btns[i].classList.remove('active');
        btns[i].setAttribute('aria-pressed', 'false');
      }
    }
  }

  function render() {
    updateCounts();
    updateFilterActive();
    renderTable();
    window.knowiReportReady = true;
  }

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------
  function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.hidden = false;
  }

  function hideError() {
    errorBanner.hidden = true;
    errorBanner.textContent = '';
  }

  function showSessionExpired() {
    if (app) app.classList.add('session-expired-active');
    if (sessionExpired) sessionExpired.hidden = false;
    if (loginLink) loginLink.href = 'login';
    hideError();
  }

  function hideSessionExpired() {
    if (app) app.classList.remove('session-expired-active');
    if (sessionExpired) sessionExpired.hidden = true;
  }

  function loadTasks() {
    hideError();
    hideSessionExpired();
    renderSkeleton();
    window.knowiReportReady = false;

    fetch('api/tasks', { headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (res.status === 401) {
          showSessionExpired();
          return null;
        }
        if (!res.ok) {
          return res.json().catch(function () { return {}; }).then(function (j) {
            throw new Error(j.error || 'Failed to load tasks');
          });
        }
        return res.json();
      })
      .then(function (data) {
        if (data === null) return;
        allTasks = data.tasks || [];
        visibleCount = PAGE_SIZE;
        render();
      })
      .catch(function (err) {
        taskRows.innerHTML = '';
        emptyState.hidden = true;
        showError(err.message || 'Something went wrong. Please try again.');
      });
  }

  // ---------------------------------------------------------------------------
  // Modal helpers
  // ---------------------------------------------------------------------------
  function openModal(backdrop, focusEl) {
    lastFocused = document.activeElement;
    backdrop.hidden = false;
    if (focusEl) {
      setTimeout(function () { focusEl.focus(); }, 0);
    }
  }

  function closeModal(backdrop) {
    backdrop.hidden = true;
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function openAddModal() {
    taskForm.reset();
    taskEditId.value = '';
    taskModalTitle.textContent = 'Add task';
    taskSave.textContent = 'Save task';
    openModal(taskModal, taskTitle);
  }

  function openEditModal(id) {
    var task = null;
    for (var i = 0; i < allTasks.length; i++) {
      if (allTasks[i].id === id) { task = allTasks[i]; break; }
    }
    if (!task) return;
    taskTitle.value = task.title;
    taskOwner.value = task.owner;
    taskStatus.value = task.status;
    taskEditId.value = String(id);
    taskModalTitle.textContent = 'Edit task';
    taskSave.textContent = 'Save changes';
    openModal(taskModal, taskTitle);
  }

  function openDeleteModal(id) {
    deleteId.value = String(id);
    openModal(deleteModal, deleteConfirm);
  }

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------
  function saveTask() {
    var title = taskTitle.value.trim();
    var owner = taskOwner.value.trim();
    var status = taskStatus.value;
    if (!title || !owner) return;

    taskSave.disabled = true;
    var id = taskEditId.value;

    var req;
    if (id) {
      req = fetch('api/tasks/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title, owner: owner, status: status })
      });
    } else {
      req = fetch('api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title, owner: owner, status: status })
      });
    }

    req
      .then(function (res) {
        if (res.status === 401) {
          closeModal(taskModal);
          showSessionExpired();
          return null;
        }
        if (!res.ok) {
          return res.json().catch(function () { return {}; }).then(function (j) {
            throw new Error(j.error || 'Failed to save task');
          });
        }
        return res.json();
      })
      .then(function (data) {
        if (data === null) return;
        var task = data.task;
        if (id) {
          for (var i = 0; i < allTasks.length; i++) {
            if (allTasks[i].id === task.id) {
              allTasks[i] = task;
              break;
            }
          }
        } else {
          allTasks.unshift(task);
        }
        closeModal(taskModal);
        render();
      })
      .catch(function (err) {
        showError(err.message || 'Failed to save task');
      })
      .then(function () {
        taskSave.disabled = false;
      });
  }

  function deleteTask() {
    var id = Number(deleteId.value);
    if (!id) return;

    deleteConfirm.disabled = true;

    fetch('api/tasks/' + id, { method: 'DELETE' })
      .then(function (res) {
        if (res.status === 401) {
          closeModal(deleteModal);
          showSessionExpired();
          return null;
        }
        if (!res.ok) {
          return res.json().catch(function () { return {}; }).then(function (j) {
            throw new Error(j.error || 'Failed to delete task');
          });
        }
        return res.json();
      })
      .then(function (data) {
        if (data === null) return;
        allTasks = allTasks.filter(function (t) { return t.id !== id; });
        closeModal(deleteModal);
        render();
      })
      .catch(function (err) {
        showError(err.message || 'Failed to delete task');
      })
      .then(function () {
        deleteConfirm.disabled = false;
      });
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------
  addBtn.addEventListener('click', openAddModal);

  taskCancel.addEventListener('click', function () {
    closeModal(taskModal);
  });

  taskForm.addEventListener('submit', function (e) {
    e.preventDefault();
    saveTask();
  });

  deleteCancel.addEventListener('click', function () {
    closeModal(deleteModal);
  });

  deleteConfirm.addEventListener('click', deleteTask);

  filterBar.addEventListener('click', function (e) {
    var btn = e.target.closest('.filter-btn');
    if (!btn) return;
    activeFilter = btn.getAttribute('data-status');
    visibleCount = PAGE_SIZE;
    render();
  });

  taskRows.addEventListener('click', function (e) {
    var editBtn = e.target.closest('.edit-btn');
    if (editBtn) {
      openEditModal(Number(editBtn.getAttribute('data-id')));
      return;
    }
    var delBtn = e.target.closest('.delete-btn');
    if (delBtn) {
      openDeleteModal(Number(delBtn.getAttribute('data-id')));
      return;
    }
    var moreBtn = e.target.closest('.show-more');
    if (moreBtn) {
      visibleCount += PAGE_SIZE;
      renderTable();
    }
  });

  // Close modals on backdrop click
  [taskModal, deleteModal].forEach(function (backdrop) {
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) closeModal(backdrop);
    });
  });

  // Escape key closes modals
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (!taskModal.hidden) closeModal(taskModal);
      if (!deleteModal.hidden) closeModal(deleteModal);
    }
  });

  // ---------------------------------------------------------------------------
  // Viewer identity (best-effort from trusted header via a lightweight probe)
  // ---------------------------------------------------------------------------
  function setViewer(name) {
    if (viewerName && name) viewerName.textContent = name;
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  loadTasks();
})();