window.knowiReportReady = false;

(function () {
  "use strict";

  var STATUSES = ["To do", "In progress", "Done"];
  var PAGE_SIZE = 50;

  var state = {
    tasks: [],
    filter: "All",
    visibleCount: PAGE_SIZE,
    editingId: null,
    pendingDeleteId: null,
    dbUnavailable: false,
    loaded: false
  };

  var els = {};

  function qs(id) {
    return document.getElementById(id);
  }

  function cacheEls() {
    els.navCount = qs("nav-count");
    els.viewerName = qs("viewer-name");
    els.viewerAvatar = qs("viewer-avatar");
    els.sessionExpired = qs("session-expired");
    els.filterRow = qs("filter-row");
    els.loadingState = qs("loading-state");
    els.errorState = qs("error-state");
    els.emptyState = qs("empty-state");
    els.listWrap = qs("list-wrap");
    els.taskRows = qs("task-rows");
    els.showMoreWrap = qs("show-more-wrap");
    els.showMoreBtn = qs("show-more-btn");
    els.addTaskBtn = qs("add-task-btn");
    els.emptyAddBtn = qs("empty-add-btn");
    els.modalOverlay = qs("task-modal-overlay");
    els.modalTitle = qs("modal-title");
    els.taskForm = qs("task-form");
    els.titleInput = qs("task-title");
    els.ownerInput = qs("task-owner");
    els.statusSelect = qs("task-status");
    els.formError = qs("form-error");
    els.modalCancelBtn = qs("modal-cancel-btn");
    els.modalSaveBtn = qs("modal-save-btn");
    els.confirmOverlay = qs("confirm-delete-overlay");
    els.confirmText = qs("confirm-text");
    els.confirmCancelBtn = qs("confirm-cancel-btn");
    els.confirmDeleteBtn = qs("confirm-delete-btn");
    els.toast = qs("toast");
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function statusClass(status) {
    if (status === "Done") return "status-done";
    if (status === "In progress") return "status-progress";
    return "status-todo";
  }

  function showToast(message, isError) {
    els.toast.textContent = message;
    els.toast.classList.toggle("toast-error", !!isError);
    els.toast.hidden = false;
    window.clearTimeout(els.toast._timer);
    els.toast._timer = window.setTimeout(function () {
      els.toast.hidden = true;
    }, 3200);
  }

  function showSessionExpired() {
    state.dbUnavailable = false;
    els.sessionExpired.hidden = false;
    els.loadingState.hidden = true;
    els.errorState.hidden = true;
    els.emptyState.hidden = true;
    els.listWrap.hidden = true;
    els.filterRow.hidden = true;
    els.showMoreWrap.hidden = true;
    els.addTaskBtn.hidden = true;
  }

  function apiFetch(url, opts) {
    return fetch(url, opts).then(function (res) {
      if (res.status === 401) {
        showSessionExpired();
        throw new Error("session-expired");
      }
      return res;
    });
  }

  function loadSession() {
    apiFetch("api/session")
      .then(function (res) { return res.ok ? res.json() : { user: null }; })
      .then(function (data) {
        var user = data && data.user;
        if (user && user.name) {
          els.viewerName.textContent = user.name;
          els.viewerAvatar.textContent = user.name.trim().slice(0, 1).toUpperCase();
        } else {
          els.viewerName.textContent = "Signed in via Knowi";
          els.viewerAvatar.textContent = "?";
        }
      })
      .catch(function () {});
  }

  function loadTasks() {
    els.loadingState.hidden = false;
    els.errorState.hidden = true;
    els.emptyState.hidden = true;
    els.listWrap.hidden = true;
    els.filterRow.hidden = true;
    els.showMoreWrap.hidden = true;

    apiFetch("api/tasks")
      .then(function (res) {
        if (res.status === 503) {
          state.dbUnavailable = true;
          throw new Error("unavailable");
        }
        if (!res.ok) {
          throw new Error("failed");
        }
        return res.json();
      })
      .then(function (data) {
        state.tasks = (data.tasks || []).map(function (t) {
          return { id: t.id, title: t.title, owner: t.owner, status: t.status };
        });
        state.dbUnavailable = false;
        state.loaded = true;
        render();
      })
      .catch(function (err) {
        if (err.message === "session-expired") return;
        state.loaded = true;
        els.loadingState.hidden = true;
        els.errorState.hidden = false;
        els.errorState.textContent = state.dbUnavailable
          ? "The task database is unavailable right now. Try again in a moment."
          : "Something went wrong loading tasks. Try again in a moment.";
        els.navCount.textContent = "0";
        markReportReady();
      });
  }

  function markReportReady() {
    window.knowiReportReady = true;
  }

  function filteredTasks() {
    if (state.filter === "All") return state.tasks;
    return state.tasks.filter(function (t) { return t.status === state.filter; });
  }

  function renderFilterChips() {
    var counts = { All: state.tasks.length };
    STATUSES.forEach(function (s) { counts[s] = 0; });
    state.tasks.forEach(function (t) {
      if (counts.hasOwnProperty(t.status)) counts[t.status] += 1;
    });

    var options = ["All"].concat(STATUSES.filter(function (s) {
      return state.tasks.some(function (t) { return t.status === s; }) || s === state.filter;
    }));
    if (options.indexOf(state.filter) === -1) options.push(state.filter);

    els.filterRow.innerHTML = "";
    options.forEach(function (opt) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "filter-chip";
      btn.setAttribute("aria-pressed", String(state.filter === opt));
      btn.innerHTML = escapeHtml(opt) + ' <span class="chip-count">' + (counts[opt] || 0) + "</span>";
      btn.addEventListener("click", function () {
        state.filter = opt;
        state.visibleCount = PAGE_SIZE;
        render();
      });
      els.filterRow.appendChild(btn);
    });
  }

  function renderRows() {
    var list = filteredTasks();
    var visible = list.slice(0, state.visibleCount);

    els.taskRows.innerHTML = "";
    visible.forEach(function (t) {
      var tr = document.createElement("tr");

      var titleTd = document.createElement("td");
      var titleSpan = document.createElement("span");
      titleSpan.className = "task-title";
      titleSpan.textContent = t.title;
      titleTd.appendChild(titleSpan);

      var ownerTd = document.createElement("td");
      ownerTd.className = "task-owner";
      ownerTd.textContent = t.owner;

      var statusTd = document.createElement("td");
      var chip = document.createElement("span");
      chip.className = "status-chip " + statusClass(t.status);
      chip.textContent = t.status;
      statusTd.appendChild(chip);

      var actionsTd = document.createElement("td");
      actionsTd.className = "actions-cell";
      var actionsWrap = document.createElement("div");
      actionsWrap.className = "row-actions";

      var editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn-icon";
      editBtn.setAttribute("aria-label", "Edit " + t.title);
      editBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M11.3 2.3a1.4 1.4 0 0 1 2 2L4.8 12.8l-2.7.6.6-2.7L11.3 2.3Z" stroke="currentColor" stroke-width="1.3" fill="none"/></svg>';
      editBtn.addEventListener("click", function () { openModal("edit", t); });

      var deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn-icon danger";
      deleteBtn.setAttribute("aria-label", "Delete " + t.title);
      deleteBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 4.5h10M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4.5 4.5 5 13a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l.5-8.5" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/></svg>';
      deleteBtn.addEventListener("click", function () { openDeleteConfirm(t); });

      actionsWrap.appendChild(editBtn);
      actionsWrap.appendChild(deleteBtn);
      actionsTd.appendChild(actionsWrap);

      tr.appendChild(titleTd);
      tr.appendChild(ownerTd);
      tr.appendChild(statusTd);
      tr.appendChild(actionsTd);
      els.taskRows.appendChild(tr);
    });

    els.showMoreWrap.hidden = list.length <= state.visibleCount;
  }

  function render() {
    els.loadingState.hidden = true;
    els.errorState.hidden = true;

    els.navCount.textContent = String(state.tasks.length);

    if (state.tasks.length === 0) {
      els.filterRow.hidden = true;
      els.listWrap.hidden = true;
      els.showMoreWrap.hidden = true;
      els.emptyState.hidden = false;
      markReportReady();
      return;
    }

    els.emptyState.hidden = true;
    els.filterRow.hidden = false;
    renderFilterChips();

    var list = filteredTasks();
    if (list.length === 0) {
      els.listWrap.hidden = true;
      els.showMoreWrap.hidden = true;
    } else {
      els.listWrap.hidden = false;
      renderRows();
    }
    markReportReady();
  }

  var lastFocusedEl = null;

  function openModal(mode, task) {
    lastFocusedEl = document.activeElement;
    state.editingId = mode === "edit" ? task.id : null;
    els.modalTitle.textContent = mode === "edit" ? "Edit task" : "Add task";
    els.titleInput.value = mode === "edit" ? task.title : "";
    els.ownerInput.value = mode === "edit" ? task.owner : "";
    els.statusSelect.value = mode === "edit" ? task.status : "To do";
    els.formError.textContent = "";
    els.formError.hidden = true;
    els.modalOverlay.hidden = false;
    els.titleInput.focus();
  }

  function closeModal() {
    els.modalOverlay.hidden = true;
    state.editingId = null;
    if (lastFocusedEl) lastFocusedEl.focus();
  }

  function openDeleteConfirm(task) {
    lastFocusedEl = document.activeElement;
    state.pendingDeleteId = task.id;
    els.confirmText.textContent = 'Delete "' + task.title + '"? This can’t be undone.';
    els.confirmOverlay.hidden = false;
    els.confirmCancelBtn.focus();
  }

  function closeDeleteConfirm() {
    els.confirmOverlay.hidden = true;
    state.pendingDeleteId = null;
    if (lastFocusedEl) lastFocusedEl.focus();
  }

  function submitForm(e) {
    e.preventDefault();
    var title = els.titleInput.value.trim();
    var owner = els.ownerInput.value.trim();
    var status = els.statusSelect.value;

    if (!title) {
      els.formError.textContent = "Enter a title for this task.";
      els.formError.hidden = false;
      els.titleInput.focus();
      return;
    }
    if (!owner) {
      els.formError.textContent = "Enter who owns this task.";
      els.formError.hidden = false;
      els.ownerInput.focus();
      return;
    }

    els.formError.hidden = true;
    els.modalSaveBtn.disabled = true;

    var isEdit = state.editingId !== null;
    var url = isEdit ? "api/tasks/" + state.editingId : "api/tasks";
    var method = isEdit ? "PUT" : "POST";

    apiFetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title, owner: owner, status: status })
    })
      .then(function (res) {
        if (res.status === 503) {
          showToast("The task database is unavailable right now. Try again shortly.", true);
          return null;
        }
        if (!res.ok) {
          return res.json().then(function (d) {
            throw new Error((d && d.error) || "Save failed");
          });
        }
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        closeModal();
        showToast(isEdit ? "Task updated." : "Task added.", false);
        loadTasks();
      })
      .catch(function (err) {
        if (err.message === "session-expired") return;
        els.formError.textContent = err.message || "Couldn’t save this task. Try again.";
        els.formError.hidden = false;
      })
      .finally(function () {
        els.modalSaveBtn.disabled = false;
      });
  }

  function confirmDelete() {
    if (state.pendingDeleteId === null) return;
    els.confirmDeleteBtn.disabled = true;
    apiFetch("api/tasks/" + state.pendingDeleteId, { method: "DELETE" })
      .then(function (res) {
        if (res.status === 503) {
          showToast("The task database is unavailable right now. Try again shortly.", true);
          return;
        }
        if (!res.ok && res.status !== 204) {
          throw new Error("Delete failed");
        }
        closeDeleteConfirm();
        showToast("Task deleted.", false);
        loadTasks();
      })
      .catch(function (err) {
        if (err.message === "session-expired") return;
        showToast("Couldn’t delete this task. Try again.", true);
      })
      .finally(function () {
        els.confirmDeleteBtn.disabled = false;
      });
  }

  function bindEvents() {
    els.addTaskBtn.addEventListener("click", function () { openModal("add"); });
    els.emptyAddBtn.addEventListener("click", function () { openModal("add"); });
    els.modalCancelBtn.addEventListener("click", closeModal);
    els.taskForm.addEventListener("submit", submitForm);
    els.confirmCancelBtn.addEventListener("click", closeDeleteConfirm);
    els.confirmDeleteBtn.addEventListener("click", confirmDelete);
    els.showMoreBtn.addEventListener("click", function () {
      state.visibleCount += PAGE_SIZE;
      renderRows();
    });

    [els.modalOverlay, els.confirmOverlay].forEach(function (overlay) {
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) {
          if (overlay === els.modalOverlay) closeModal();
          else closeDeleteConfirm();
        }
      });
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (!els.modalOverlay.hidden) closeModal();
        if (!els.confirmOverlay.hidden) closeDeleteConfirm();
      }
    });
  }

  function init() {
    cacheEls();
    bindEvents();
    loadSession();
    loadTasks();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
