/*
 * app.js — Inventory Tracker (client-side, localStorage-backed)
 * ---------------------------------------------------------------------------
 * Purpose:
 *   A self-contained single-page inventory tracker. All state lives in the
 *   browser's localStorage under the key 'victor-inventory-items'. The module
 *   seeds a small demo dataset on first run, then renders a filterable,
 *   paged ledger of items plus a stock summary panel. Items can be added,
 *   edited (via a modal) and deleted (via confirm()).
 *
 * Data model (each item):
 *   { id: string, name: string, category: string, quantity: number,
 *     unitPrice: number }
 *
 * Status is derived, never stored:
 *   - 'Out of stock'  when quantity === 0
 *   - 'Low stock'     when 0 < quantity <= LOW_STOCK_THRESHOLD
 *   - 'In stock'      when quantity > LOW_STOCK_THRESHOLD
 *
 * Conventions:
 *   - No external libraries, CDNs or network calls.
 *   - window.knowiReportReady is set false first, then true once the page has
 *     rendered, so the PDF renderer can wait for a stable DOM.
 *   - Every function carries a detailed comment block (purpose, inputs,
 *     outputs) as required.
 * ---------------------------------------------------------------------------
 */

// First statement of the file: signal that the report is not yet ready.
window.knowiReportReady = false;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// localStorage key that owns all inventory records for this app.
const STORAGE_KEY = 'victor-inventory-items';

// Quantity at or below which an item is flagged as low stock.
const LOW_STOCK_THRESHOLD = 10;

// Number of ledger rows shown per page before "Show more" is offered.
const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

// The full, unfiltered list of item objects.
let items = [];

// The currently visible (filtered) list of item objects.
let filteredItems = [];

// How many rows of the filtered list are currently rendered.
let visibleCount = PAGE_SIZE;

// The id of the item being edited, or null when the modal is in "add" mode.
let editingId = null;

// ---------------------------------------------------------------------------
// DOM references (resolved once after the document is ready)
// ---------------------------------------------------------------------------

let el = {};

/**
 * cacheDom
 * Purpose:
 *   Resolve and cache every element the module needs by id, so the rest of the
 *   code can reference them without repeated querySelector calls.
 * Inputs:
 *   None (reads the live document).
 * Outputs:
 *   Populates the module-level `el` object with named element references.
 */
function cacheDom() {
  el = {
    addBtn: document.getElementById('add-item-btn'),
    categoryFilter: document.getElementById('category-filter'),
    searchInput: document.getElementById('search-input'),
    statTotalItems: document.getElementById('stat-total-items'),
    statTotalUnits: document.getElementById('stat-total-units'),
    statLowStock: document.getElementById('stat-low-stock'),
    summaryCategories: document.getElementById('summary-categories'),
    itemsBody: document.getElementById('items-body'),
    emptyState: document.getElementById('empty-state'),
    showMoreBtn: document.getElementById('show-more-btn'),
    modal: document.getElementById('item-modal'),
    modalTitle: document.getElementById('modal-title'),
    modalClose: document.getElementById('modal-close'),
    modalCancel: document.getElementById('modal-cancel'),
    modalSave: document.getElementById('modal-save'),
    form: document.getElementById('item-form'),
    itemName: document.getElementById('item-name'),
    itemCategory: document.getElementById('item-category'),
    itemQty: document.getElementById('item-qty'),
    itemPrice: document.getElementById('item-price'),
    categorySuggestions: document.getElementById('category-suggestions'),
    navCountInventory: document.getElementById('nav-count-inventory'),
    navCountSummary: document.getElementById('nav-count-summary'),
    toast: document.getElementById('toast'),
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * loadItems
 * Purpose:
 *   Read the persisted inventory from localStorage and parse it into an array
 *   of item objects. If nothing is stored yet, seed a small demo dataset so
 *   the app is never empty on first run.
 * Inputs:
 *   None (reads localStorage under STORAGE_KEY).
 * Outputs:
 *   Returns an array of item objects (also assigned to the module `items`).
 */
function loadItems() {
  let parsed = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) parsed = JSON.parse(raw);
  } catch (err) {
    // Corrupt or non-JSON storage: fall through to seeding.
    parsed = null;
  }

  if (Array.isArray(parsed) && parsed.length > 0) {
    items = parsed;
    return items;
  }

  // First run (or empty/corrupt store): seed demo data and persist it.
  items = seedItems();
  saveItems();
  return items;
}

/**
 * saveItems
 * Purpose:
 *   Persist the current in-memory `items` array to localStorage as JSON.
 * Inputs:
 *   None (writes the module-level `items` array).
 * Outputs:
 *   None (side effect: localStorage updated).
 */
function saveItems() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    // Storage may be full or blocked; the in-memory state remains usable.
  }
}

/**
 * seedItems
 * Purpose:
 *   Build a small, varied demo inventory used only on first run. Categories
 *   and quantities are chosen to exercise every status (in stock, low stock,
 *   out of stock) and to give the summary panel meaningful per-category data.
 * Inputs:
 *   None.
 * Outputs:
 *   Returns a fresh array of item objects.
 */
function seedItems() {
  const seed = [
    { name: 'Wireless Mouse', category: 'Electronics', quantity: 42, unitPrice: 24.99 },
    { name: 'Mechanical Keyboard', category: 'Electronics', quantity: 8, unitPrice: 89.0 },
    { name: 'USB-C Cable 1m', category: 'Electronics', quantity: 0, unitPrice: 9.5 },
    { name: 'Notebook A5', category: 'Stationery', quantity: 120, unitPrice: 3.25 },
    { name: 'Gel Pen (Black)', category: 'Stationery', quantity: 6, unitPrice: 1.1 },
    { name: 'Stapler', category: 'Stationery', quantity: 15, unitPrice: 7.4 },
    { name: 'Espresso Beans 1kg', category: 'Beverages', quantity: 30, unitPrice: 18.75 },
    { name: 'Cold Brew Concentrate', category: 'Beverages', quantity: 4, unitPrice: 12.0 },
    { name: 'Ceramic Mug', category: 'Kitchen', quantity: 55, unitPrice: 11.2 },
    { name: 'Chef Knife 8"', category: 'Kitchen', quantity: 0, unitPrice: 45.0 },
    { name: 'Cotton T-Shirt (M)', category: 'Apparel', quantity: 9, unitPrice: 14.5 },
    { name: 'Wool Beanie', category: 'Apparel', quantity: 27, unitPrice: 19.99 },
  ];
  return seed.map((it) => ({ id: genId(), ...it }));
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

/**
 * genId
 * Purpose:
 *   Generate a reasonably unique id for a new item. Uses a timestamp plus a
 *   random base36 suffix; collisions are effectively impossible for local use.
 * Inputs:
 *   None.
 * Outputs:
 *   Returns a string id.
 */
function genId() {
  return 'it-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

/**
 * escapeHtml
 * Purpose:
 *   Escape a string so it can be safely interpolated into innerHTML without
 *   breaking markup or enabling injection.
 * Inputs:
 *   value — the raw string to escape.
 * Outputs:
 *   Returns the escaped string.
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * formatCurrency
 * Purpose:
 *   Format a number as a USD currency string with two decimals.
 * Inputs:
 *   amount — the numeric value to format.
 * Outputs:
 *   Returns a formatted string such as "$1,234.50".
 */
function formatCurrency(amount) {
  const n = Number(amount) || 0;
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * formatNumber
 * Purpose:
 *   Format an integer with thousands separators.
 * Inputs:
 *   value — the numeric value to format.
 * Outputs:
 *   Returns a formatted string such as "1,234".
 */
function formatNumber(value) {
  return (Number(value) || 0).toLocaleString('en-US');
}

/**
 * itemStatus
 * Purpose:
 *   Derive the stock status of an item from its quantity.
 * Inputs:
 *   item — an item object with a numeric `quantity`.
 * Outputs:
 *   Returns one of 'out', 'low', or 'in'.
 */
function itemStatus(item) {
  const q = Number(item.quantity) || 0;
  if (q === 0) return 'out';
  if (q <= LOW_STOCK_THRESHOLD) return 'low';
  return 'in';
}

/**
 * statusMeta
 * Purpose:
 *   Map a status key to its display label and CSS class for the status pill.
 * Inputs:
 *   status — one of 'out', 'low', 'in'.
 * Outputs:
 *   Returns { label, cls } where cls is the pill modifier class.
 */
function statusMeta(status) {
  if (status === 'out') return { label: 'Out of stock', cls: 'pill-out' };
  if (status === 'low') return { label: 'Low stock', cls: 'pill-low' };
  return { label: 'In stock', cls: 'pill-in' };
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

/**
 * applyFilters
 * Purpose:
 *   Compute the filtered list of items based on the current category selection
 *   and search text. Category comparison is exact (case-insensitive) against
 *   the item's category; search matches name or category (case-insensitive).
 * Inputs:
 *   None (reads the current filter control values and the module `items`).
 * Outputs:
 *   Assigns the result to the module `filteredItems` and returns it.
 */
function applyFilters() {
  const cat = el.categoryFilter.value;
  const q = el.searchInput.value.trim().toLowerCase();

  filteredItems = items.filter((it) => {
    const matchesCat = !cat || it.category === cat;
    const matchesSearch =
      !q ||
      it.name.toLowerCase().includes(q) ||
      it.category.toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });

  // Reset paging when the filter set changes.
  visibleCount = PAGE_SIZE;
  return filteredItems;
}

/**
 * buildCategoryOptions
 * Purpose:
 *   Populate the category <select> with one option per distinct category found
 *   in the loaded rows, plus the default "All categories" option. Options are
 *   built from the data (never hard-coded) and sorted alphabetically.
 * Inputs:
 *   None (reads the module `items`).
 * Outputs:
 *   None (side effect: the select's options are replaced).
 */
function buildCategoryOptions() {
  const categories = Array.from(new Set(items.map((it) => it.category).filter(Boolean))).sort();
  const prev = el.categoryFilter.value;

  el.categoryFilter.innerHTML = '<option value="">All categories</option>';
  categories.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    el.categoryFilter.appendChild(opt);
  });

  // Restore the previous selection if it still exists.
  if (categories.includes(prev)) el.categoryFilter.value = prev;
}

/**
 * buildCategorySuggestions
 * Purpose:
 *   Populate the datalist used to suggest existing categories in the modal
 *   form, so users can type a new category or pick an existing one.
 * Inputs:
 *   None (reads the module `items`).
 * Outputs:
 *   None (side effect: the datalist's options are replaced).
 */
function buildCategorySuggestions() {
  const categories = Array.from(new Set(items.map((it) => it.category).filter(Boolean))).sort();
  el.categorySuggestions.innerHTML = '';
  categories.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c;
    el.categorySuggestions.appendChild(opt);
  });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * renderSummary
 * Purpose:
 *   Render the stock summary panel: total items, total units, low-stock count,
 *   and a per-category ledger of unit totals. The summary reflects the full
 *   inventory (not the filtered view) so it is a stable overview.
 * Inputs:
 *   None (reads the module `items`).
 * Outputs:
 *   None (side effect: summary DOM is updated).
 */
function renderSummary() {
  const totalItems = items.length;
  const totalUnits = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
  const lowStock = items.filter((it) => itemStatus(it) === 'low').length;

  el.statTotalItems.textContent = formatNumber(totalItems);
  el.statTotalUnits.textContent = formatNumber(totalUnits);
  el.statLowStock.textContent = formatNumber(lowStock);

  // Per-category unit totals, sorted by category name.
  const byCat = {};
  items.forEach((it) => {
    const c = it.category || 'Uncategorized';
    byCat[c] = (byCat[c] || 0) + (Number(it.quantity) || 0);
  });

  const rows = Object.keys(byCat)
    .sort()
    .map((c) => {
      const units = byCat[c];
      const low = items.filter((it) => (it.category || 'Uncategorized') === c && itemStatus(it) === 'low').length;
      const lowNote = low > 0 ? `<span class="ledger-flag">· ${low} low</span>` : '';
      return `<li class="ledger-row">
        <span class="ledger-name">${escapeHtml(c)}</span>
        <span class="ledger-units">${formatNumber(units)}${lowNote}</span>
      </li>`;
    })
    .join('');

  el.summaryCategories.innerHTML = rows || '<li class="ledger-row ledger-empty">No categories yet</li>';
}

/**
 * renderItems
 * Purpose:
 *   Render the items ledger. Only the first `visibleCount` rows of the
 *   filtered list are shown (paged at PAGE_SIZE). Each row shows the item name
 *   (display face), a category chip, quantity, unit price, computed value, a
 *   status pill, and Edit/Delete actions. Toggles the empty state and the
 *   "Show more" button as appropriate.
 * Inputs:
 *   None (reads the module `filteredItems` and `visibleCount`).
 * Outputs:
 *   None (side effect: the table body, empty state and show-more button are
 *   updated).
 */
function renderItems() {
  const total = filteredItems.length;
  const slice = filteredItems.slice(0, visibleCount);

  if (total === 0) {
    el.itemsBody.innerHTML = '';
    el.emptyState.hidden = false;
    el.showMoreBtn.hidden = true;
    return;
  }

  el.emptyState.hidden = true;

  const rows = slice
    .map((it) => {
      const status = itemStatus(it);
      const meta = statusMeta(status);
      const value = (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
      return `<tr class="item-row" data-id="${escapeHtml(it.id)}">
        <td class="cell-name">${escapeHtml(it.name)}</td>
        <td class="cell-cat"><span class="chip">${escapeHtml(it.category || 'Uncategorized')}</span></td>
        <td class="cell-num">${formatNumber(it.quantity)}</td>
        <td class="cell-num">${formatCurrency(it.unitPrice)}</td>
        <td class="cell-num">${formatCurrency(value)}</td>
        <td class="cell-status"><span class="pill ${meta.cls}">${meta.label}</span></td>
        <td class="cell-actions">
          <button class="btn btn-ghost btn-sm" type="button" data-action="edit" data-id="${escapeHtml(it.id)}">Edit</button>
          <button class="btn btn-ghost btn-sm btn-danger" type="button" data-action="delete" data-id="${escapeHtml(it.id)}">Delete</button>
        </td>
      </tr>`;
    })
    .join('');

  el.itemsBody.innerHTML = rows;

  // Show the "Show more" control only when there are more rows to reveal.
  el.showMoreBtn.hidden = visibleCount >= total;
}

/**
 * renderNavCounts
 * Purpose:
 *   Update the count pills in the sidebar: the inventory pill shows the total
 *   item count, and the summary pill shows the number of distinct categories.
 * Inputs:
 *   None (reads the module `items`).
 * Outputs:
 *   None (side effect: the two nav pill elements are updated).
 */
function renderNavCounts() {
  el.navCountInventory.textContent = formatNumber(items.length);
  const cats = new Set(items.map((it) => it.category).filter(Boolean)).size;
  el.navCountSummary.textContent = formatNumber(cats);
}

/**
 * render
 * Purpose:
 *   Rebuild the entire view from the current state: category options, summary,
 *   ledger, and nav counts. Called after any data or filter change.
 * Inputs:
 *   None.
 * Outputs:
 *   None (side effects: DOM is updated).
 */
function render() {
  buildCategoryOptions();
  buildCategorySuggestions();
  applyFilters();
  renderSummary();
  renderItems();
  renderNavCounts();
}

// ---------------------------------------------------------------------------
// Modal (add / edit)
// ---------------------------------------------------------------------------

/**
 * openModal
 * Purpose:
 *   Open the add/edit modal. When `id` is provided the form is pre-filled with
 *   that item's values and the title reflects an edit; otherwise the form is
 *   cleared for a new item. Focuses the name field and traps the dialog.
 * Inputs:
 *   id — the item id to edit, or null/undefined to add a new item.
 * Outputs:
 *   None (side effect: modal is shown and the form is populated).
 */
function openModal(id) {
  editingId = id || null;

  if (editingId) {
    const it = items.find((x) => x.id === editingId);
    if (!it) return;
    el.modalTitle.textContent = 'Edit item';
    el.itemName.value = it.name;
    el.itemCategory.value = it.category;
    el.itemQty.value = it.quantity;
    el.itemPrice.value = it.unitPrice;
  } else {
    el.modalTitle.textContent = 'Add item';
    el.form.reset();
  }

  el.modal.hidden = false;
  document.body.classList.add('modal-open');
  el.itemName.focus();
}

/**
 * closeModal
 * Purpose:
 *   Close the modal, clear the editing state, and return focus to the add
 *   button for keyboard users.
 * Inputs:
 *   None.
 * Outputs:
 *   None (side effect: modal is hidden).
 */
function closeModal() {
  el.modal.hidden = true;
  document.body.classList.remove('modal-open');
  editingId = null;
  el.addBtn.focus();
}

/**
 * handleFormSubmit
 * Purpose:
 *   Validate and persist the modal form. On a valid submit it either updates
 *   the item being edited or appends a new item, saves to localStorage, closes
 *   the modal, re-renders, and shows a confirmation toast. Invalid fields are
 *   reported via the browser's native validation.
 * Inputs:
 *   event — the form submit event (prevented from default navigation).
 * Outputs:
 *   None (side effects: data updated, DOM re-rendered, toast shown).
 */
function handleFormSubmit(event) {
  event.preventDefault();

  const name = el.itemName.value.trim();
  const category = el.itemCategory.value.trim();
  const quantity = Math.max(0, Math.floor(Number(el.itemQty.value) || 0));
  const unitPrice = Math.max(0, Number(el.itemPrice.value) || 0);

  if (!name || !category) {
    showToast('Name and category are required.');
    return;
  }

  if (editingId) {
    const it = items.find((x) => x.id === editingId);
    if (it) {
      it.name = name;
      it.category = category;
      it.quantity = quantity;
      it.unitPrice = unitPrice;
    }
    showToast('Item updated.');
  } else {
    items.push({ id: genId(), name, category, quantity, unitPrice });
    showToast('Item added.');
  }

  saveItems();
  closeModal();
  render();
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * handleDelete
 * Purpose:
 *   Prompt the user to confirm deletion of the item with the given id. On
 *   confirmation the item is removed, persisted, the view re-rendered, and a
 *   toast shown.
 * Inputs:
 *   id — the id of the item to delete.
 * Outputs:
 *   None (side effects: data updated, DOM re-rendered, toast shown).
 */
function handleDelete(id) {
  const it = items.find((x) => x.id === id);
  if (!it) return;
  const ok = window.confirm(`Delete "${it.name}"? This cannot be undone.`);
  if (!ok) return;

  items = items.filter((x) => x.id !== id);
  saveItems();
  render();
  showToast('Item deleted.');
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

let toastTimer = null;

/**
 * showToast
 * Purpose:
 *   Display a transient toast message at the bottom of the viewport and
 *   auto-dismiss it after a short delay. Repeated calls reset the timer.
 * Inputs:
 *   message — the text to display.
 * Outputs:
 *   None (side effect: the toast element is shown and scheduled to hide).
 */
function showToast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.hidden = true;
  }, 2600);
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

/**
 * wireEvents
 * Purpose:
 *   Attach all event listeners: add button, modal open/close/cancel, form
 *   submit, filter changes, the show-more control, and delegated click handling
 *   for the per-row Edit/Delete actions.
 * Inputs:
 *   None (uses the cached `el` references).
 * Outputs:
 *   None (side effect: listeners are registered).
 */
function wireEvents() {
  // Add item.
  el.addBtn.addEventListener('click', () => openModal(null));

  // Modal close controls.
  el.modalClose.addEventListener('click', closeModal);
  el.modalCancel.addEventListener('click', closeModal);
  el.form.addEventListener('submit', handleFormSubmit);

  // Close the modal when the backdrop (not the dialog) is clicked.
  el.modal.addEventListener('click', (e) => {
    if (e.target === el.modal) closeModal();
  });

  // Escape key closes the modal.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.modal.hidden) closeModal();
  });

  // Filters.
  el.categoryFilter.addEventListener('change', () => {
    visibleCount = PAGE_SIZE;
    applyFilters();
    renderItems();
  });
  el.searchInput.addEventListener('input', () => {
    visibleCount = PAGE_SIZE;
    applyFilters();
    renderItems();
  });

  // Show more.
  el.showMoreBtn.addEventListener('click', () => {
    visibleCount += PAGE_SIZE;
    renderItems();
  });

  // Delegated row actions (Edit / Delete).
  el.itemsBody.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const action = btn.getAttribute('data-action');
    if (action === 'edit') openModal(id);
    else if (action === 'delete') handleDelete(id);
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

/**
 * init
 * Purpose:
 *   Entry point. Caches the DOM, loads (or seeds) the data, wires events,
 *   performs the first render, and then marks the report as ready so the PDF
 *   renderer can proceed.
 * Inputs:
 *   None.
 * Outputs:
 *   None (side effects: app is fully initialized and rendered).
 */
function init() {
  cacheDom();
  loadItems();
  wireEvents();
  render();
  window.knowiReportReady = true;
}

// Start once the DOM is available.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}