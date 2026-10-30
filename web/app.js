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

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

// The full item list returned by the server. Populated by loadItems().
let allItems = [];

// How many rows are currently rendered in the table body.
let visibleCount = 0;

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
    visibleCount = Math.min(PAGE_SIZE, allItems.length);
    renderItems();
    updateCounts();
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

// renderItems
// Rebuilds the table body with the currently visible slice of items, toggles
// the empty state, and shows or hides the "Show more" control based on whether
// more rows remain.
function renderItems() {
  const slice = allItems.slice(0, visibleCount);

  // Build the row markup for the visible slice.
  const rows = slice
    .map((item) => {
      const cls = statusClass(item.status);
      return (
        '<tr>' +
        '<td class="col-name">' + escapeHtml(item.name) + '</td>' +
        '<td class="col-cat">' + escapeHtml(item.category) + '</td>' +
        '<td class="col-owner">' + escapeHtml(item.owner) + '</td>' +
        '<td class="col-status"><span class="pill ' + cls + '">' +
        escapeHtml(item.status) + '</span></td>' +
        '<td class="col-updated">' + escapeHtml(formatDate(item.updated)) + '</td>' +
        '</tr>'
      );
    })
    .join('');

  els.itemsBody.innerHTML = rows;

  // Empty state: show only when there are no items at all.
  const isEmpty = allItems.length === 0;
  els.emptyState.hidden = !isEmpty;
  els.itemsTable.style.display = isEmpty ? 'none' : '';

  // Show more control: append a row spanning all columns when more remain.
  const hasMore = visibleCount < allItems.length;
  let moreRow = els.itemsBody.querySelector('tr.more-row');
  if (hasMore) {
    if (!moreRow) {
      moreRow = document.createElement('tr');
      moreRow.className = 'more-row';
      els.itemsBody.appendChild(moreRow);
    }
    moreRow.innerHTML =
      '<td colspan="5"><button type="button" class="btn btn-ghost show-more">Show more</button></td>';
    moreRow.querySelector('button').addEventListener('click', showMore);
  } else if (moreRow) {
    moreRow.remove();
  }
}

// showMore
// Reveals the next page of rows and re-renders.
function showMore() {
  visibleCount = Math.min(visibleCount + PAGE_SIZE, allItems.length);
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
  const header = ['Item', 'Category', 'Owner', 'Status', 'Updated'];
  const lines = [header.map(csvEscape).join(',')];
  for (const item of allItems) {
    lines.push(
      [
        csvEscape(item.name),
        csvEscape(item.category),
        csvEscape(item.owner),
        csvEscape(item.status),
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
  loadItems();
}

// Start the app once the DOM is ready.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}