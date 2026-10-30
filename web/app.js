window.knowiReportReady = false;

// ---------------------------------------------------------------------------
// Victor Hello — item ledger
//
// Single-page ledger app. Loads the in-memory item list from GET /api/items,
// renders it as a paged ledger table, and offers a dark-mode toggle plus a
// client-side CSV export. No managed database is used; all data is served
// read-only by the server and the CSV is built entirely in the browser.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// localStorage key that persists the user's light/dark theme choice.
const THEME_KEY = 'victor-hello-theme';

// Number of ledger rows shown per page before the "Show more" control appears.
const PAGE_SIZE = 50;

// Maximum number of entries retained in the undo/redo stacks.
const MAX_HISTORY = 50;

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

// The full item list returned by the server. Populated by loadItems().
let allItems = [];

// How many rows are currently rendered in the table body.
let visibleCount = 0;

// Undo stack: array of {action, payload} objects, most recent last.
let undoStack = [];

// Redo stack: array of {action, payload} objects, most recent last.
let redoStack = [];

// Activity history log: array of {id, timestamp, action, detail} objects.
let activityLog = [];

// Next unique ID for activity log entries.
let activityIdCounter = 0;

// Next unique ID for items (used when adding new items client-side).
let nextItemId = 1000;

// Search filter text (case-insensitive substring match on name/category/owner).
let searchQuery = '';

// Category filter value (exact match against item.category).
let categoryFilter = '';

// Status filter value (exact match against item.status).
let statusFilter = '';

// Whether the low-stock banner has been dismissed for this session.
let lowStockDismissed = false;

// The item currently being edited in the modal (null when adding a new item).
let editingItemId = null;

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

// Cached element handles so the render and event code can stay terse.
const els = {
  app: document.getElementById('app'),
  sidebar: document.getElementById('sidebar'),
  nav: document.getElementById('nav'),
  viewer: document.getElementById('viewer'),
  main: document.getElementById('main'),
  pageTitle: document.getElementById('page-title'),
  themeToggle: document.getElementById('theme-toggle'),
  exportBtn: document.getElementById('export-btn'),
  itemsTable: document.getElementById('items-table'),
  itemsBody: document.getElementById('items-body'),
  itemsStatus: document.getElementById('items-status'),
  emptyState: document.getElementById('empty-state'),
  loadingSkeleton: document.getElementById('loading-skeleton'),
  navCount: document.getElementById('nav-count'),
  navCatCount: document.getElementById('nav-cat-count'),
  // New elements
  lowStockBanner: document.getElementById('low-stock-banner'),
  lowStockCount: document.getElementById('low-stock-count'),
  lowStockMessage: document.getElementById('low-stock-message'),
  lowStockDismiss: document.getElementById('low-stock-dismiss'),
  searchInput: document.getElementById('search-input'),
  categoryFilter: document.getElementById('category-filter'),
  statusFilter: document.getElementById('status-filter'),
  newItemBtn: document.getElementById('new-item-btn'),
  importBtn: document.getElementById('import-btn'),
  printBtn: document.getElementById('print-btn'),
  undoBtn: document.getElementById('undo-btn'),
  redoBtn: document.getElementById('redo-btn'),
  reportsGrid: document.getElementById('reports-grid'),
  historyList: document.getElementById('history-list'),
  historyEmpty: document.getElementById('history-empty'),
  clearHistoryBtn: document.getElementById('clear-history-btn'),
  itemModal: document.getElementById('item-modal'),
  itemModalTitle: document.getElementById('item-modal-title'),
  itemModalClose: document.getElementById('item-modal-close'),
  itemForm: document.getElementById('item-form'),
  itemFormCancel: document.getElementById('item-form-cancel'),
  itemFormSave: document.getElementById('item-form-save'),
  fieldName: document.getElementById('field-name'),
  fieldCategory: document.getElementById('field-category'),
  fieldOwner: document.getElementById('field-owner'),
  fieldStatus: document.getElementById('field-status'),
  fieldQuantity: document.getElementById('field-quantity'),
  fieldThreshold: document.getElementById('field-threshold'),
  errName: document.getElementById('err-name'),
  errCategory: document.getElementById('err-category'),
  errOwner: document.getElementById('err-owner'),
  errStatus: document.getElementById('err-status'),
  errQuantity: document.getElementById('err-quantity'),
  errThreshold: document.getElementById('err-threshold'),
  categorySuggestions: document.getElementById('category-suggestions'),
  importModal: document.getElementById('import-modal'),
  importModalClose: document.getElementById('import-modal-close'),
  importTextarea: document.getElementById('import-textarea'),
  importPreview: document.getElementById('import-preview'),
  importStats: document.getElementById('import-stats'),
  importErrors: document.getElementById('import-errors'),
  importTable: document.getElementById('import-table'),
  importTableBody: document.getElementById('import-table-body'),
  importCancel: document.getElementById('import-cancel'),
  importRun: document.getElementById('import-run'),
  toastRegion: document.getElementById('toast-region'),
};

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

// applyTheme
// Adds or removes the "dark" class on <html> to switch the palette, and
// updates the toggle button's pressed state and icon so the control always
// reflects the active theme.
function applyTheme(theme) {
  const isDark = theme === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
  els.themeToggle.setAttribute('aria-pressed', String(isDark));
  // Show the icon that represents the theme you can switch TO.
  const sun = els.themeToggle.querySelector('.icon-sun');
  const moon = els.themeToggle.querySelector('.icon-moon');
  if (sun) sun.style.display = isDark ? 'none' : '';
  if (moon) moon.style.display = isDark ? '' : 'none';
}

// initTheme
// Reads the persisted theme (falling back to the user's system preference)
// and applies it before the first paint so there is no flash of the wrong
// palette.
function initTheme() {
  let theme;
  try {
    theme = localStorage.getItem(THEME_KEY);
  } catch (e) {
    theme = null;
  }
  if (theme !== 'light' && theme !== 'dark') {
    const prefersDark =
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    theme = prefersDark ? 'dark' : 'light';
  }
  applyTheme(theme);
}

// toggleTheme
// Flips between light and dark, persists the choice, and applies it.
function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  const next = isDark ? 'light' : 'dark';
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch (e) {
    // Storage may be unavailable (private mode); the toggle still works.
  }
  applyTheme(next);
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

// loadItems
// Fetches the item ledger from the server, stores it, and triggers a render.
// Shows the shimmer skeleton while in flight and an honest error message if
// the request fails.
async function loadItems() {
  showLoading(true);
  try {
    const res = await fetch('api/items', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error('Request failed with status ' + res.status);
    }
    const data = await res.json();
    allItems = Array.isArray(data.items) ? data.items : [];
    // Ensure nextItemId is higher than any existing ID.
    const maxId = allItems.reduce((max, item) => Math.max(max, item.id || 0), 0);
    nextItemId = maxId + 1;
    visibleCount = Math.min(PAGE_SIZE, allItems.length);
    renderItems();
    updateCounts();
    updateFilterOptions();
    updateCategorySuggestions();
    renderReports();
    updateLowStockBanner();
    showLoading(false);
    setItemsStatus(allItems.length + ' items loaded.');
    window.knowiReportReady = true;
  } catch (err) {
    showLoading(false);
    setItemsStatus('Could not load items. Please try again.');
    window.knowiReportReady = true;
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

// statusClass
// Maps a status string to its CSS class. The mapping is derived from the
// status values actually present in the data so no category is hard-coded or
// guessed; any status not in the known set falls back to a neutral pill.
function statusClass(status) {
  const map = {
    'Done': 'status-done',
    'On track': 'status-ontrack',
    'Due soon': 'status-duesoon',
    'At risk': 'status-atrisk',
    'Waiting': 'status-waiting',
    'In stock': 'status-instock',
    'Low stock': 'status-lowstock',
    'Out of stock': 'status-outofstock',
    'Reserved': 'status-reserved',
    'Discontinued': 'status-discontinued',
  };
  return map[status] || 'status-neutral';
}

// escapeHtml
// Escapes the characters that are significant in HTML so item names and other
// data values render as text, never as markup.
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// formatDate
// Formats an ISO date string (YYYY-MM-DD) into a short, locale-aware label
// for the "Updated" column. Returns the raw value if it cannot be parsed.
function formatDate(value) {
  if (!value) return '';
  const d = new Date(value + 'T00:00:00');
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// getFilteredItems
// Returns the subset of allItems that match the current search query,
// category filter, and status filter. Search is a case-insensitive substring
// match on name, category, and owner. Category and status are exact matches.
function getFilteredItems() {
  return allItems.filter((item) => {
    if (categoryFilter && item.category !== categoryFilter) return false;
    if (statusFilter && item.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const name = (item.name || '').toLowerCase();
      const cat = (item.category || '').toLowerCase();
      const owner = (item.owner || '').toLowerCase();
      if (!name.includes(q) && !cat.includes(q) && !owner.includes(q)) return false;
    }
    return true;
  });
}

// renderItems
// Rebuilds the table body with the currently visible slice of items, toggles
// the empty state, and shows or hides the "Show more" control based on whether
// more rows remain.
function renderItems() {
  const filtered = getFilteredItems();
  const slice = filtered.slice(0, visibleCount);

  // Build the row markup for the visible slice.
  const rows = slice
    .map((item) => {
      const cls = statusClass(item.status);
      const qty = item.quantity != null ? item.quantity : '—';
      const threshold = item.threshold != null ? item.threshold : '—';
      const isLowStock =
        item.quantity != null &&
        item.threshold != null &&
        item.quantity <= item.threshold;
      const qtyClass = isLowStock ? 'qty-low' : '';
      return (
        '<tr data-id="' + item.id + '">' +
        '<td class="col-name">' + escapeHtml(item.name) + '</td>' +
        '<td class="col-cat">' + escapeHtml(item.category) + '</td>' +
        '<td class="col-owner">' + escapeHtml(item.owner) + '</td>' +
        '<td class="col-status"><span class="pill ' + cls + '">' +
        escapeHtml(item.status) + '</span></td>' +
        '<td class="col-qty ' + qtyClass + '">' + escapeHtml(String(qty)) + '</td>' +
        '<td class="col-threshold">' + escapeHtml(String(threshold)) + '</td>' +
        '<td class="col-updated">' + escapeHtml(formatDate(item.updated)) + '</td>' +
        '<td class="col-actions">' +
        '<button type="button" class="btn btn-ghost btn-sm btn-edit" data-id="' + item.id + '" aria-label="Edit ' + escapeHtml(item.name) + '">Edit</button> ' +
        '<button type="button" class="btn btn-ghost btn-sm btn-delete" data-id="' + item.id + '" aria-label="Delete ' + escapeHtml(item.name) + '">Delete</button>' +
        '</td>' +
        '</tr>'
      );
    })
    .join('');

  els.itemsBody.innerHTML = rows;

  // Attach event listeners to edit and delete buttons.
  els.itemsBody.querySelectorAll('.btn-edit').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.getAttribute('data-id'), 10);
      openEditModal(id);
    });
  });
  els.itemsBody.querySelectorAll('.btn-delete').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.getAttribute('data-id'), 10);
      deleteItem(id);
    });
  });

  // Empty state: show only when there are no items at all.
  const isEmpty = allItems.length === 0;
  els.emptyState.hidden = !isEmpty;
  els.itemsTable.style.display = isEmpty ? 'none' : '';

  // Show more control: append a row spanning all columns when more remain.
  const hasMore = visibleCount < filtered.length;
  let moreRow = els.itemsBody.querySelector('tr.more-row');
  if (hasMore) {
    if (!moreRow) {
      moreRow = document.createElement('tr');
      moreRow.className = 'more-row';
      els.itemsBody.appendChild(moreRow);
    }
    moreRow.innerHTML =
      '<td colspan="8"><button type="button" class="btn btn-ghost show-more">Show more</button></td>';
    moreRow.querySelector('button').addEventListener('click', showMore);
  } else if (moreRow) {
    moreRow.remove();
  }
}

// showMore
// Reveals the next page of rows and re-renders.
function showMore() {
  visibleCount = Math.min(visibleCount + PAGE_SIZE, getFilteredItems().length);
  renderItems();
}

// updateCounts
// Sets the sidebar count pills: total items and the number of distinct
// categories, both derived from the loaded data.
function updateCounts() {
  const total = allItems.length;
  const cats = new Set(allItems.map((i) => i.category));
  els.navCount.textContent = String(total);
  els.navCatCount.textContent = String(cats.size);
}

// showLoading
// Toggles the shimmer skeleton and hides the table/empty state while loading.
function showLoading(on) {
  els.loadingSkeleton.hidden = !on;
  els.loadingSkeleton.setAttribute('aria-hidden', String(on));
  if (on) {
    els.itemsTable.style.display = 'none';
    els.emptyState.hidden = true;
    els.exportBtn.disabled = true;
  } else {
    // Restore visibility based on whether there is data.
    if (allItems.length > 0) {
      els.itemsTable.style.display = '';
      els.emptyState.hidden = true;
      els.exportBtn.disabled = false;
    } else {
      els.itemsTable.style.display = 'none';
      els.emptyState.hidden = false;
      els.exportBtn.disabled = true;
    }
  }
}

// setItemsStatus
// Writes a short, polite status line for screen readers and the status region.
function setItemsStatus(message) {
  els.itemsStatus.textContent = message;
}

// ---------------------------------------------------------------------------
// Filter options
// ---------------------------------------------------------------------------

// updateFilterOptions
// Populates the category and status filter dropdowns with distinct values
// derived from the loaded data. The "All" option is always first.
function updateFilterOptions() {
  const categories = [...new Set(allItems.map((i) => i.category))].sort();
  const statuses = [...new Set(allItems.map((i) => i.status))].sort();

  // Rebuild category filter options.
  const prevCat = categoryFilter;
  els.categoryFilter.innerHTML = '<option value="">All categories</option>';
  categories.forEach((cat) => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    els.categoryFilter.appendChild(opt);
  });
  els.categoryFilter.value = prevCat;

  // Rebuild status filter options.
  const prevStatus = statusFilter;
  els.statusFilter.innerHTML = '<option value="">All statuses</option>';
  statuses.forEach((st) => {
    const opt = document.createElement('option');
    opt.value = st;
    opt.textContent = st;
    els.statusFilter.appendChild(opt);
  });
  els.statusFilter.value = prevStatus;
}

// updateCategorySuggestions
// Populates the datalist for the category field in the item form with
// existing category values to assist the user.
function updateCategorySuggestions() {
  const categories = [...new Set(allItems.map((i) => i.category))].sort();
  els.categorySuggestions.innerHTML = '';
  categories.forEach((cat) => {
    const opt = document.createElement('option');
    opt.value = cat;
    els.categorySuggestions.appendChild(opt);
  });
}

// ---------------------------------------------------------------------------
// Low-stock alerts
// ---------------------------------------------------------------------------

// getLowStockItems
// Returns items where quantity is not null, threshold is not null, and
// quantity <= threshold.
function getLowStockItems() {
  return allItems.filter(
    (item) =>
      item.quantity != null &&
      item.threshold != null &&
      item.quantity <= item.threshold
  );
}

// updateLowStockBanner
// Computes the low-stock items and shows or hides the banner accordingly.
// If the banner was previously dismissed, it stays hidden until the data
// changes (a new item is added or edited).
function updateLowStockBanner() {
  const lowStock = getLowStockItems();
  if (lowStock.length === 0) {
    els.lowStockBanner.hidden = true;
    lowStockDismissed = false;
    return;
  }
  if (lowStockDismissed) {
    els.lowStockBanner.hidden = true;
    return;
  }
  els.lowStockCount.textContent = String(lowStock.length);
  els.lowStockMessage.textContent =
    lowStock.length === 1
      ? 'item is at or below its low-stock threshold.'
      : 'items are at or below their low-stock threshold.';
  els.lowStockBanner.hidden = false;
}

// dismissLowStockBanner
// Hides the low-stock banner and sets the dismissed flag.
function dismissLowStockBanner() {
  lowStockDismissed = true;
  els.lowStockBanner.hidden = true;
}

// ---------------------------------------------------------------------------
// Per-category reports
// ---------------------------------------------------------------------------

// renderReports
// Builds and renders per-category report cards in the reports grid. Each card
// shows the category name, item count, total quantity, and a status breakdown.
function renderReports() {
  const categories = [...new Set(allItems.map((i) => i.category))].sort();
  const cards = categories
    .map((cat) => {
      const items = allItems.filter((i) => i.category === cat);
      const count = items.length;
      const totalQty = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
      const statusBreakdown = {};
      items.forEach((i) => {
        statusBreakdown[i.status] = (statusBreakdown[i.status] || 0) + 1;
      });
      const statusLines = Object.entries(statusBreakdown)
        .map(([st, n]) => {
          const cls = statusClass(st);
          return (
            '<span class="report-status"><span class="pill ' + cls + '">' +
            escapeHtml(st) + '</span> <span class="report-status-count">' + n + '</span></span>'
          );
        })
        .join('');
      return (
        '<div class="report-card" role="listitem">' +
        '<h3 class="report-card-title">' + escapeHtml(cat) + '</h3>' +
        '<div class="report-card-stats">' +
        '<div class="report-stat"><span class="report-stat-label">Items</span><span class="report-stat-value">' + count + '</span></div>' +
        '<div class="report-stat"><span class="report-stat-label">Total qty</span><span class="report-stat-value">' + totalQty + '</span></div>' +
        '</div>' +
        '<div class="report-card-statuses">' + statusLines + '</div>' +
        '</div>'
      );
    })
    .join('');
  els.reportsGrid.innerHTML = cards;
}

// ---------------------------------------------------------------------------
// Activity history
// ---------------------------------------------------------------------------

// logActivity
// Appends an entry to the activity log and re-renders the history list.
// action: a short string like 'add', 'edit', 'delete', 'import', 'undo', 'redo'.
// detail: a human-readable description of what happened.
function logActivity(action, detail) {
  activityIdCounter++;
  const entry = {
    id: activityIdCounter,
    timestamp: new Date().toISOString(),
    action: action,
    detail: detail,
  };
  activityLog.push(entry);
  renderHistory();
}

// renderHistory
// Rebuilds the activity history list from the activityLog array. Shows the
// empty state when there are no entries.
function renderHistory() {
  if (activityLog.length === 0) {
    els.historyList.innerHTML = '';
    els.historyEmpty.hidden = false;
    return;
  }
  els.historyEmpty.hidden = true;
  const items = activityLog
    .slice()
    .reverse()
    .map((entry) => {
      const time = new Date(entry.timestamp).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const date = new Date(entry.timestamp).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
      return (
        '<li class="history-item">' +
        '<span class="history-time">' + escapeHtml(date) + ' ' + escapeHtml(time) + '</span>' +
        '<span class="history-action">' + escapeHtml(entry.action) + '</span>' +
        '<span class="history-detail">' + escapeHtml(entry.detail) + '</span>' +
        '</li>'
      );
    })
    .join('');
  els.historyList.innerHTML = items;
}

// clearHistory
// Clears the activity log and re-renders.
function clearHistory() {
  activityLog = [];
  renderHistory();
  setItemsStatus('Activity history cleared.');
}

// ---------------------------------------------------------------------------
// Undo / Redo
// ---------------------------------------------------------------------------

// pushUndo
// Pushes an action onto the undo stack and clears the redo stack.
// action: a string like 'add', 'edit', 'delete', 'import'.
// payload: the data needed to reverse the action.
function pushUndo(action, payload) {
  undoStack.push({ action: action, payload: payload });
  if (undoStack.length > MAX_HISTORY) {
    undoStack.shift();
  }
  redoStack = [];
  updateUndoRedoButtons();
}

// undo
// Pops the most recent action from the undo stack, reverses it, and pushes
// it onto the redo stack.
function undo() {
  if (undoStack.length === 0) return;
  const entry = undoStack.pop();
  redoStack.push(entry);
  applyUndo(entry);
  updateUndoRedoButtons();
  renderItems();
  updateCounts();
  updateFilterOptions();
  updateCategorySuggestions();
  renderReports();
  updateLowStockBanner();
  logActivity('undo', 'Undid: ' + entry.action);
  setItemsStatus('Undid ' + entry.action + '.');
}

// redo
// Pops the most recent action from the redo stack, re-applies it, and pushes
// it back onto the undo stack.
function redo() {
  if (redoStack.length === 0) return;
  const entry = redoStack.pop();
  undoStack.push(entry);
  applyRedo(entry);
  updateUndoRedoButtons();
  renderItems();
  updateCounts();
  updateFilterOptions();
  updateCategorySuggestions();
  renderReports();
  updateLowStockBanner();
  logActivity('redo', 'Redid: ' + entry.action);
  setItemsStatus('Redid ' + entry.action + '.');
}

// applyUndo
// Reverses the given undo entry by mutating allItems.
function applyUndo(entry) {
  const { action, payload } = entry;
  if (action === 'add') {
    // Remove the item that was added.
    allItems = allItems.filter((i) => i.id !== payload.id);
  } else if (action === 'edit') {
    // Restore the item to its previous state.
    const idx = allItems.findIndex((i) => i.id === payload.id);
    if (idx !== -1) {
      allItems[idx] = { ...payload.previous };
    }
  } else if (action === 'delete') {
    // Re-insert the deleted item.
    allItems.push({ ...payload.item });
  } else if (action === 'import') {
    // Remove all items that were added during the import.
    const importedIds = new Set(payload.ids);
    allItems = allItems.filter((i) => !importedIds.has(i.id));
  }
}

// applyRedo
// Re-applies the given redo entry by mutating allItems.
function applyRedo(entry) {
  const { action, payload } = entry;
  if (action === 'add') {
    // Re-add the item.
    allItems.push({ ...payload.item });
  } else if (action === 'edit') {
    // Apply the new state.
    const idx = allItems.findIndex((i) => i.id === payload.id);
    if (idx !== -1) {
      allItems[idx] = { ...payload.next };
    }
  } else if (action === 'delete') {
    // Remove the item again.
    allItems = allItems.filter((i) => i.id !== payload.id);
  } else if (action === 'import') {
    // Re-add all imported items.
    payload.items.forEach((item) => {
      allItems.push({ ...item });
    });
  }
}

// updateUndoRedoButtons
// Enables or disables the undo and redo buttons based on stack contents.
function updateUndoRedoButtons() {
  els.undoBtn.disabled = undoStack.length === 0;
  els.redoBtn.disabled = redoStack.length === 0;
}

// ---------------------------------------------------------------------------
// Item CRUD
// ---------------------------------------------------------------------------

// addItem
// Adds a new item to the ledger with the given fields. Pushes an undo entry.
function addItem(fields) {
  const item = {
    id: nextItemId++,
    name: fields.name,
    category: fields.category,
    owner: fields.owner || '',
    status: fields.status || 'In stock',
    quantity: fields.quantity != null ? fields.quantity : null,
    threshold: fields.threshold != null ? fields.threshold : null,
    updated: new Date().toISOString().slice(0, 10),
  };
  allItems.push(item);
  pushUndo('add', { id: item.id, item: item });
  logActivity('add', 'Added item: ' + item.name);
  setItemsStatus('Item "' + item.name + '" added.');
  renderItems();
  updateCounts();
  updateFilterOptions();
  updateCategorySuggestions();
  renderReports();
  updateLowStockBanner();
}

// editItem
// Updates an existing item with the given fields. Pushes an undo entry.
function editItem(id, fields) {
  const idx = allItems.findIndex((i) => i.id === id);
  if (idx === -1) return;
  const previous = { ...allItems[idx] };
  const next = {
    ...previous,
    name: fields.name,
    category: fields.category,
    owner: fields.owner || '',
    status: fields.status || previous.status,
    quantity: fields.quantity != null ? fields.quantity : previous.quantity,
    threshold: fields.threshold != null ? fields.threshold : previous.threshold,
    updated: new Date().toISOString().slice(0, 10),
  };
  allItems[idx] = next;
  pushUndo('edit', { id: id, previous: previous, next: next });
  logActivity('edit', 'Edited item: ' + next.name);
  setItemsStatus('Item "' + next.name + '" updated.');
  renderItems();
  updateCounts();
  updateFilterOptions();
  updateCategorySuggestions();
  renderReports();
  updateLowStockBanner();
}

// deleteItem
// Removes an item from the ledger by ID. Pushes an undo entry.
function deleteItem(id) {
  const idx = allItems.findIndex((i) => i.id === id);
  if (idx === -1) return;
  const item = allItems[idx];
  allItems.splice(idx, 1);
  pushUndo('delete', { id: id, item: item });
  logActivity('delete', 'Deleted item: ' + item.name);
  setItemsStatus('Item "' + item.name + '" deleted.');
  renderItems();
  updateCounts();
  updateFilterOptions();
  updateCategorySuggestions();
  renderReports();
  updateLowStockBanner();
}

// ---------------------------------------------------------------------------
// Item form modal
// ---------------------------------------------------------------------------

// openNewItemModal
// Opens the item form modal in "add" mode, clearing all fields.
function openNewItemModal() {
  editingItemId = null;
  els.itemModalTitle.textContent = 'New item';
  els.itemFormSave.textContent = 'Save item';
  els.fieldName.value = '';
  els.fieldCategory.value = '';
  els.fieldOwner.value = '';
  els.fieldStatus.value = 'In stock';
  els.fieldQuantity.value = '';
  els.fieldThreshold.value = '';
  clearFormErrors();
  els.itemModal.hidden = false;
  els.fieldName.focus();
}

// openEditModal
// Opens the item form modal in "edit" mode, pre-filling fields from the item.
function openEditModal(id) {
  const item = allItems.find((i) => i.id === id);
  if (!item) return;
  editingItemId = id;
  els.itemModalTitle.textContent = 'Edit item';
  els.itemFormSave.textContent = 'Save changes';
  els.fieldName.value = item.name || '';
  els.fieldCategory.value = item.category || '';
  els.fieldOwner.value = item.owner || '';
  els.fieldStatus.value = item.status || 'In stock';
  els.fieldQuantity.value = item.quantity != null ? String(item.quantity) : '';
  els.fieldThreshold.value = item.threshold != null ? String(item.threshold) : '';
  clearFormErrors();
  els.itemModal.hidden = false;
  els.fieldName.focus();
}

// closeItemModal
// Closes the item form modal.
function closeItemModal() {
  els.itemModal.hidden = true;
  editingItemId = null;
  clearFormErrors();
}

// clearFormErrors
// Hides all field error messages in the item form.
function clearFormErrors() {
  els.errName.hidden = true;
  els.errCategory.hidden = true;
  els.errOwner.hidden = true;
  els.errStatus.hidden = true;
  els.errQuantity.hidden = true;
  els.errThreshold.hidden = true;
}

// showFieldError
// Shows an error message for a specific field.
function showFieldError(errEl, message) {
  errEl.textContent = message;
  errEl.hidden = false;
}

// validateItemForm
// Validates all fields in the item form. Returns true if valid, false otherwise.
// Shows inline error messages for any invalid fields.
function validateItemForm() {
  clearFormErrors();
  let valid = true;

  const name = els.fieldName.value.trim();
  if (!name) {
    showFieldError(els.errName, 'Item name is required.');
    valid = false;
  } else if (name.length > 120) {
    showFieldError(els.errName, 'Name must be 120 characters or fewer.');
    valid = false;
  }

  const category = els.fieldCategory.value.trim();
  if (!category) {
    showFieldError(els.errCategory, 'Category is required.');
    valid = false;
  } else if (category.length > 60) {
    showFieldError(els.errCategory, 'Category must be 60 characters or fewer.');
    valid = false;
  }

  const owner = els.fieldOwner.value.trim();
  if (owner.length > 80) {
    showFieldError(els.errOwner, 'Owner must be 80 characters or fewer.');
    valid = false;
  }

  const status = els.fieldStatus.value;
  if (!status) {
    showFieldError(els.errStatus, 'Status is required.');
    valid = false;
  }

  const qtyStr = els.fieldQuantity.value.trim();
  let quantity = null;
  if (qtyStr !== '') {
    quantity = parseInt(qtyStr, 10);
    if (isNaN(quantity) || quantity < 0) {
      showFieldError(els.errQuantity, 'Quantity must be a non-negative integer.');
      valid = false;
    }
  }

  const threshStr = els.fieldThreshold.value.trim();
  let threshold = null;
  if (threshStr !== '') {
    threshold = parseInt(threshStr, 10);
    if (isNaN(threshold) || threshold < 0) {
      showFieldError(els.errThreshold, 'Threshold must be a non-negative integer.');
      valid = false;
    }
  }

  return valid;
}

// handleItemFormSubmit
// Handles the submit event for the item form. Validates, then adds or edits.
function handleItemFormSubmit(e) {
  e.preventDefault();
  if (!validateItemForm()) return;

  const fields = {
    name: els.fieldName.value.trim(),
    category: els.fieldCategory.value.trim(),
    owner: els.fieldOwner.value.trim(),
    status: els.fieldStatus.value,
    quantity: els.fieldQuantity.value.trim() !== '' ? parseInt(els.fieldQuantity.value, 10) : null,
    threshold: els.fieldThreshold.value.trim() !== '' ? parseInt(els.fieldThreshold.value, 10) : null,
  };

  if (editingItemId !== null) {
    editItem(editingItemId, fields);
  } else {
    addItem(fields);
  }
  closeItemModal();
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

// openImportModal
// Opens the CSV import modal, clearing the textarea and preview.
function openImportModal() {
  els.importTextarea.value = '';
  els.importPreview.hidden = true;
  els.importStats.textContent = '';
  els.importErrors.hidden = true;
  els.importTable.hidden = true;
  els.importTableBody.innerHTML = '';
  els.importRun.disabled = true;
  els.importModal.hidden = false;
  els.importTextarea.focus();
}

// closeImportModal
// Closes the CSV import modal.
function closeImportModal() {
  els.importModal.hidden = true;
}

// parseCsv
// Parses a CSV string into an array of row arrays. Handles quoted fields
// with embedded commas and escaped quotes.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        row.push(field);
        field = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
          i++;
        }
        row.push(field);
        field = '';
        if (row.length > 1 || row[0] !== '') {
          rows.push(row);
        }
        row = [];
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }
  // Push the last field and row.
  row.push(field);
  if (row.length > 1 || row[0] !== '') {
    rows.push(row);
  }
  return rows;
}

// previewImport
// Parses the CSV in the textarea, validates each row, and shows a preview
// table with per-row results.
function previewImport() {
  const text = els.importTextarea.value.trim();
  if (!text) {
    els.importPreview.hidden = true;
    els.importRun.disabled = true;
    return;
  }

  const rows = parseCsv(text);
  if (rows.length < 2) {
    els.importPreview.hidden = false;
    els.importStats.textContent = 'No data rows found. Ensure the CSV has a header row and at least one data row.';
    els.importErrors.hidden = true;
    els.importTable.hidden = true;
    els.importRun.disabled = true;
    return;
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const nameIdx = header.indexOf('name');
  const catIdx = header.indexOf('category');
  const ownerIdx = header.indexOf('owner');
  const statusIdx = header.indexOf('status');
  const qtyIdx = header.indexOf('quantity');
  const threshIdx = header.indexOf('threshold');

  if (nameIdx === -1 || catIdx === -1) {
    els.importPreview.hidden = false;
    els.importStats.textContent = 'Header row must include "name" and "category" columns.';
    els.importErrors.hidden = true;
    els.importTable.hidden = true;
    els.importRun.disabled = true;
    return;
  }

  const dataRows = rows.slice(1);
  let validCount = 0;
  let errorCount = 0;
  const previewRows = [];

  dataRows.forEach((row, idx) => {
    const rowNum = idx + 2; // 1-based, accounting for header
    const name = nameIdx < row.length ? row[nameIdx].trim() : '';
    const category = catIdx < row.length ? row[catIdx].trim() : '';
    const owner = ownerIdx >= 0 && ownerIdx < row.length ? row[ownerIdx].trim() : '';
    const status = statusIdx >= 0 && statusIdx < row.length ? row[statusIdx].trim() : 'In stock';
    const qtyStr = qtyIdx >= 0 && qtyIdx < row.length ? row[qtyIdx].trim() : '';
    const threshStr = threshIdx >= 0 && threshIdx < row.length ? row[threshIdx].trim() : '';

    let quantity = null;
    let threshold = null;
    let error = '';

    if (!name) {
      error = 'Missing name';
    } else if (!category) {
      error = 'Missing category';
    } else {
      if (qtyStr !== '') {
        quantity = parseInt(qtyStr, 10);
        if (isNaN(quantity) || quantity < 0) {
          error = 'Invalid quantity';
        }
      }
      if (!error && threshStr !== '') {
        threshold = parseInt(threshStr, 10);
        if (isNaN(threshold) || threshold < 0) {
          error = 'Invalid threshold';
        }
      }
    }

    if (error) {
      errorCount++;
      previewRows.push({
        rowNum: rowNum,
        name: name,
        category: category,
        owner: owner,
        status: status,
        quantity: quantity,
        threshold: threshold,
        result: 'Error: ' + error,
        valid: false,
      });
    } else {
      validCount++;
      previewRows.push({
        rowNum: rowNum,
        name: name,
        category: category,
        owner: owner,
        status: status,
        quantity: quantity,
        threshold: threshold,
        result: 'OK',
        valid: true,
      });
    }
  });

  els.importPreview.hidden = false;
  els.importStats.textContent =
    validCount + ' valid row(s), ' + errorCount + ' error(s).';

  if (errorCount > 0) {
    els.importErrors.hidden = false;
    els.importErrors.textContent =
      'Rows with errors will be skipped. Fix the CSV and re-import if needed.';
  } else {
    els.importErrors.hidden = true;
  }

  els.importTable.hidden = false;
  els.importTableBody.innerHTML = previewRows
    .map((r) => {
      const cls = r.valid ? 'import-row-ok' : 'import-row-error';
      return (
        '<tr class="' + cls + '">' +
        '<td>' + r.rowNum + '</td>' +
        '<td>' + escapeHtml(r.name) + '</td>' +
        '<td>' + escapeHtml(r.category) + '</td>' +
        '<td>' + escapeHtml(r.owner) + '</td>' +
        '<td>' + escapeHtml(r.status) + '</td>' +
        '<td>' + (r.quantity != null ? r.quantity : '—') + '</td>' +
        '<td>' + (r.threshold != null ? r.threshold : '—') + '</td>' +
        '<td>' + escapeHtml(r.result) + '</td>' +
        '</tr>'
      );
    })
    .join('');

  els.importRun.disabled = validCount === 0;
}

// runImport
// Imports the valid rows from the preview into the ledger. Pushes a single
// undo entry for the entire import.
function runImport() {
  const text = els.importTextarea.value.trim();
  if (!text) return;

  const rows = parseCsv(text);
  if (rows.length < 2) return;

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const nameIdx = header.indexOf('name');
  const catIdx = header.indexOf('category');
  const ownerIdx = header.indexOf('owner');
  const statusIdx = header.indexOf('status');
  const qtyIdx = header.indexOf('quantity');
  const threshIdx = header.indexOf('threshold');

  const dataRows = rows.slice(1);
  const newItems = [];

  dataRows.forEach((row) => {
    const name = nameIdx < row.length ? row[nameIdx].trim() : '';
    const category = catIdx < row.length ? row[catIdx].trim() : '';
    const owner = ownerIdx >= 0 && ownerIdx < row.length ? row[ownerIdx].trim() : '';
    const status = statusIdx >= 0 && statusIdx < row.length ? row[statusIdx].trim() : 'In stock';
    const qtyStr = qtyIdx >= 0 && qtyIdx < row.length ? row[qtyIdx].trim() : '';
    const threshStr = threshIdx >= 0 && threshIdx < row.length ? row[threshIdx].trim() : '';

    if (!name || !category) return;

    let quantity = null;
    let threshold = null;
    if (qtyStr !== '') {
      const q = parseInt(qtyStr, 10);
      if (!isNaN(q) && q >= 0) quantity = q;
    }
    if (threshStr !== '') {
      const t = parseInt(threshStr, 10);
      if (!isNaN(t) && t >= 0) threshold = t;
    }

    const item = {
      id: nextItemId++,
      name: name,
      category: category,
      owner: owner,
      status: status,
      quantity: quantity,
      threshold: threshold,
      updated: new Date().toISOString().slice(0, 10),
    };
    newItems.push(item);
  });

  if (newItems.length === 0) return;

  newItems.forEach((item) => allItems.push(item));
  const ids = newItems.map((i) => i.id);
  pushUndo('import', { ids: ids, items: newItems });
  logActivity('import', 'Imported ' + newItems.length + ' item(s) from CSV.');
  setItemsStatus('Imported ' + newItems.length + ' item(s).');
  closeImportModal();
  renderItems();
  updateCounts();
  updateFilterOptions();
  updateCategorySuggestions();
  renderReports();
  updateLowStockBanner();
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

// csvEscape
// Wraps a single CSV field in double quotes and escapes embedded quotes, so
// commas and quotes in names or categories do not break the column layout.
function csvEscape(value) {
  const s = String(value == null ? '' : value);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// buildCsv
// Builds a CSV string from the loaded items with a header row. The column
// order matches the ledger table.
function buildCsv() {
  const header = ['Item', 'Category', 'Owner', 'Status', 'Quantity', 'Threshold', 'Updated'];
  const lines = [header.map(csvEscape).join(',')];
  for (const item of allItems) {
    lines.push(
      [
        csvEscape(item.name),
        csvEscape(item.category),
        csvEscape(item.owner),
        csvEscape(item.status),
        csvEscape(item.quantity != null ? item.quantity : ''),
        csvEscape(item.threshold != null ? item.threshold : ''),
        csvEscape(item.updated),
      ].join(',')
    );
  }
  return lines.join('\n');
}

// exportCsv
// Builds the CSV from the loaded rows and triggers a client-side download via
// a Blob object. No server write occurs.
function exportCsv() {
  if (allItems.length === 0) return;
  const csv = buildCsv();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'victor-hello-items.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  setItemsStatus('CSV export started.');
  logActivity('export', 'Exported CSV with ' + allItems.length + ' item(s).');
}

// ---------------------------------------------------------------------------
// Print
// ---------------------------------------------------------------------------

// printSummary
// Triggers the browser's print dialog. The @media print CSS hides navigation
// and other chrome, showing only the ledger and reports.
function printSummary() {
  window.print();
  logActivity('print', 'Printed summary.');
}

// ---------------------------------------------------------------------------
// Toast notifications
// ---------------------------------------------------------------------------

// showToast
// Displays a brief toast message in the toast region. The toast auto-dismisses
// after 3 seconds.
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  els.toastRegion.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 3000);
}

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------

// handleKeyDown
// Handles global keyboard shortcuts. Must be attached to the document.
function handleKeyDown(e) {
  // Ctrl+Z: Undo
  if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
    e.preventDefault();
    undo();
    return;
  }
  // Ctrl+Shift+Z or Ctrl+Y: Redo
  if ((e.ctrlKey && e.shiftKey && e.key === 'z') || (e.ctrlKey && e.key === 'y')) {
    e.preventDefault();
    redo();
    return;
  }
  // Ctrl+N: New item
  if (e.ctrlKey && e.key === 'n') {
    e.preventDefault();
    openNewItemModal();
    return;
  }
  // Ctrl+E: Export CSV
  if (e.ctrlKey && e.key === 'e') {
    e.preventDefault();
    exportCsv();
    return;
  }
  // Ctrl+I: Import CSV
  if (e.ctrlKey && e.key === 'i') {
    e.preventDefault();
    openImportModal();
    return;
  }
  // Ctrl+P: Print
  if (e.ctrlKey && e.key === 'p') {
    e.preventDefault();
    printSummary();
    return;
  }
  // Escape: Close any open modal
  if (e.key === 'Escape') {
    if (!els.itemModal.hidden) {
      closeItemModal();
      return;
    }
    if (!els.importModal.hidden) {
      closeImportModal();
      return;
    }
    return;
  }
  // Slash: Focus search input (only when not typing in an input/textarea)
  if (e.key === '/' && !isTypingInField(e.target)) {
    e.preventDefault();
    els.searchInput.focus();
    return;
  }
}

// isTypingInField
// Returns true if the given element is an input, textarea, or select, or if
// it is contenteditable.
function isTypingInField(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

// init
// Sets up the theme, event listeners, and kicks off the initial data load.
function init() {
  initTheme();
  els.themeToggle.addEventListener('click', toggleTheme);
  els.exportBtn.addEventListener('click', exportCsv);

  // New item button.
  els.newItemBtn.addEventListener('click', openNewItemModal);

  // Import button.
  els.importBtn.addEventListener('click', openImportModal);

  // Print button.
  els.printBtn.addEventListener('click', printSummary);

  // Undo/Redo buttons.
  els.undoBtn.addEventListener('click', undo);
  els.redoBtn.addEventListener('click', redo);

  // Low-stock banner dismiss.
  els.lowStockDismiss.addEventListener('click', dismissLowStockBanner);

  // Search input.
  els.searchInput.addEventListener('input', () => {
    searchQuery = els.searchInput.value.trim();
    visibleCount = Math.min(PAGE_SIZE, getFilteredItems().length);
    renderItems();
  });

  // Category filter.
  els.categoryFilter.addEventListener('change', () => {
    categoryFilter = els.categoryFilter.value;
    visibleCount = Math.min(PAGE_SIZE, getFilteredItems().length);
    renderItems();
  });

  // Status filter.
  els.statusFilter.addEventListener('change', () => {
    statusFilter = els.statusFilter.value;
    visibleCount = Math.min(PAGE_SIZE, getFilteredItems().length);
    renderItems();
  });

  // Item form.
  els.itemForm.addEventListener('submit', handleItemFormSubmit);
  els.itemModalClose.addEventListener('click', closeItemModal);
  els.itemFormCancel.addEventListener('click', closeItemModal);

  // Import modal.
  els.importModalClose.addEventListener('click', closeImportModal);
  els.importCancel.addEventListener('click', closeImportModal);
  els.importTextarea.addEventListener('input', previewImport);
  els.importRun.addEventListener('click', runImport);

  // Clear history.
  els.clearHistoryBtn.addEventListener('click', clearHistory);

  // Keyboard shortcuts.
  document.addEventListener('keydown', handleKeyDown);

  // Close modals when clicking the backdrop.
  els.itemModal.addEventListener('click', (e) => {
    if (e.target === els.itemModal) {
      closeItemModal();
    }
  });
  els.importModal.addEventListener('click', (e) => {
    if (e.target === els.importModal) {
      closeImportModal();
    }
  });

  loadItems();
}

// Start the app once the DOM is ready.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}