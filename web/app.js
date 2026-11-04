window.knowiReportReady = false;

(function () {
  "use strict";

  var FIELDS = [
    "payment_at", "amount_paid", "payment_successful", "refund", "supporter_id",
    "recurring_donor", "supporter_name", "email", "receipt_number", "financial_year",
    "payment_method", "anonymous_donation", "project", "fee_amount", "mobile_phone",
    "supporter_type", "acquisition_date", "recurring_donor_status", "membership_status"
  ];

  var state = {
    columns: [],
    idx: {},
    rows: [],
    viewer: null,
    loadError: null,
    sessionExpired: false,
    filters: { search: "", fy: "", method: "", successfulOnly: true },
    sortField: "payment_at",
    sortDir: "desc",
    page: 1,
    pageSize: 25,
    panelSupporterId: null
  };

  var root = document.getElementById("app");

  function isTrue(v) {
    return v === true || v === "true" || v === 1 || v === "1";
  }

  function val(row, col) {
    var i = state.idx[col];
    return i === undefined ? undefined : row[i];
  }

  function parseDate(s) {
    if (!s) return null;
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function fmtDMY(d) {
    if (!d) return "—";
    var dd = String(d.getDate()).padStart(2, "0");
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var yyyy = d.getFullYear();
    return dd + "/" + mm + "/" + yyyy;
  }

  function fmtMoney(n) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    return Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtInt(n) {
    return Number(n).toLocaleString("en-US");
  }

  function escapeHtml(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isSuccessfulCreditedRow(row) {
    return isTrue(val(row, "payment_successful")) && !isTrue(val(row, "refund"));
  }

  function leadingYear(s) {
    var m = String(s).match(/\d{4}/);
    return m ? Number(m[0]) : -Infinity;
  }

  function distinctSorted(col, desc) {
    var set = {};
    state.rows.forEach(function (r) {
      var v = val(r, col);
      if (v !== undefined && v !== null && v !== "") set[v] = true;
    });
    var arr = Object.keys(set);
    arr.sort(function (a, b) {
      if (desc) {
        var ya = leadingYear(a), yb = leadingYear(b);
        if (ya !== yb) return yb - ya;
        return b.localeCompare(a);
      }
      return a.localeCompare(b);
    });
    return arr;
  }

  function computeKpis() {
    var totalRaised = 0;
    var successfulCount = 0;
    var supporterSet = {};
    var recurringSet = {};
    state.rows.forEach(function (r) {
      var sid = val(r, "supporter_id");
      if (sid !== undefined && sid !== null && sid !== "") supporterSet[sid] = true;
      if (isSuccessfulCreditedRow(r)) {
        totalRaised += Number(val(r, "amount_paid")) || 0;
        successfulCount++;
      }
      if (isTrue(val(r, "recurring_donor")) && sid !== undefined && sid !== null && sid !== "") {
        recurringSet[sid] = true;
      }
    });
    var supportersCount = Object.keys(supporterSet).length;
    var recurringCount = Object.keys(recurringSet).length;
    var avgGift = successfulCount > 0 ? totalRaised / successfulCount : 0;
    return {
      totalRaised: totalRaised,
      supportersCount: supportersCount,
      recurringCount: recurringCount,
      avgGift: avgGift
    };
  }

  function dateRangeText() {
    var min = null, max = null;
    state.rows.forEach(function (r) {
      var d = parseDate(val(r, "payment_at"));
      if (!d) return;
      if (!min || d < min) min = d;
      if (!max || d > max) max = d;
    });
    if (!min || !max) return "No payment data yet";
    return "Payments from " + fmtDMY(min) + " to " + fmtDMY(max);
  }

  function matchesFilters(row) {
    var f = state.filters;
    if (f.successfulOnly && !isTrue(val(row, "payment_successful"))) return false;
    if (f.fy && String(val(row, "financial_year")) !== f.fy) return false;
    if (f.method && String(val(row, "payment_method")) !== f.method) return false;
    if (f.search) {
      var s = f.search.toLowerCase();
      var hay = [val(row, "supporter_name"), val(row, "email"), val(row, "receipt_number")]
        .map(function (v) { return v === undefined || v === null ? "" : String(v).toLowerCase(); })
        .join(" ");
      if (hay.indexOf(s) === -1) return false;
    }
    return true;
  }

  function sortRows(rows) {
    var field = state.sortField;
    var dir = state.sortDir === "asc" ? 1 : -1;
    var copy = rows.slice();
    copy.sort(function (a, b) {
      var va, vb;
      if (field === "payment_at") {
        va = parseDate(val(a, "payment_at"));
        vb = parseDate(val(b, "payment_at"));
        va = va ? va.getTime() : -Infinity;
        vb = vb ? vb.getTime() : -Infinity;
      } else if (field === "amount_paid" || field === "fee_amount") {
        va = Number(val(a, field)) || 0;
        vb = Number(val(b, field)) || 0;
      } else {
        va = String(val(a, field) === undefined ? "" : val(a, field)).toLowerCase();
        vb = String(val(b, field) === undefined ? "" : val(b, field)).toLowerCase();
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return copy;
  }

  function getFilteredSorted() {
    var filtered = state.rows.filter(matchesFilters);
    return sortRows(filtered);
  }

  function statusInfo(row) {
    if (isTrue(val(row, "refund"))) return { label: "Refunded", cls: "pill-refunded" };
    if (isTrue(val(row, "payment_successful"))) return { label: "Paid", cls: "pill-paid" };
    return { label: "Failed", cls: "pill-failed" };
  }

  function supporterDisplayName(row) {
    if (isTrue(val(row, "anonymous_donation"))) return "Anonymous";
    var n = val(row, "supporter_name");
    return n ? n : "Anonymous";
  }

  // ---- rendering ----

  function render() {
    if (state.sessionExpired) {
      renderSessionExpired();
      window.knowiReportReady = true;
      return;
    }
    root.innerHTML = buildShell();
    attachStaticHandlers();
    if (state.loadError) {
      renderError();
    } else if (state.rows.length === 0 && !state.loading) {
      renderHeader();
      renderKpis();
      renderFiltersDisabled();
      renderTableEmpty();
    } else {
      renderHeader();
      renderKpis();
      renderFilters();
      renderTable();
    }
    window.knowiReportReady = true;
  }

  function renderSessionExpired() {
    root.innerHTML =
      '<div class="app-shell"><main class="main"><div class="main-inner">' +
      '<div class="state-box">' +
      '<h3>Your session has expired</h3>' +
      '<p>Sign in again to keep working in Supporter Hub.</p>' +
      '<a class="btn btn-primary" href="login">Sign in again</a>' +
      '</div></div></main></div>';
  }

  function navIconSvg() {
    return '<svg class="icon" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">' +
      '<rect x="2" y="4" width="14" height="10" rx="2" stroke="#4E6E78" fill="none" stroke-width="1.5"/>' +
      '<line x1="2" y1="7.5" x2="16" y2="7.5" stroke="#4E6E78" stroke-width="1.5"/>' +
      '<circle cx="9" cy="11" r="1.4" fill="#4E6E78"/>' +
      '</svg>';
  }

  function brandIconSvg() {
    return '<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">' +
      '<circle cx="11" cy="11" r="9" stroke="#375357" fill="none" stroke-width="1.6"/>' +
      '<path d="M7 11.5c0 2 1.8 3.5 4 3.5s4-1.5 4-3.5-1.8-2.5-4-3-4-1-4-3 1.8-3.5 4-3.5 4 1.5 4 3.5" ' +
      'stroke="#375357" fill="none" stroke-width="1.3" stroke-linecap="round"/>' +
      '</svg>';
  }

  function buildShell() {
    var totalCount = state.rows.length;
    var viewerName = state.viewer && state.viewer.name ? state.viewer.name : "Signed in via Knowi";
    var viewerEmail = state.viewer && state.viewer.email ? state.viewer.email : "";
    return (
      '<div class="app-shell">' +
      '<aside class="sidebar">' +
      '<div class="brand">' + brandIconSvg() + '<span>Supporter Hub</span></div>' +
      '<ul class="nav-list">' +
      '<li><a class="nav-link is-active" href="#" aria-current="page">' + navIconSvg() +
      '<span>Payments</span><span class="nav-count">' + fmtInt(totalCount) + '</span></a></li>' +
      '</ul>' +
      '<div class="sidebar-footer">' +
      '<div class="viewer-name">' + escapeHtml(viewerName) + '</div>' +
      (viewerEmail ? '<div class="viewer-email">' + escapeHtml(viewerEmail) + '</div>' : '') +
      '</div>' +
      '</aside>' +
      '<main class="main"><div class="main-inner" id="main-inner"></div></main>' +
      '</div>'
    );
  }

  function mainInner() { return document.getElementById("main-inner"); }

  function appendHtml(html) {
    var div = document.createElement("div");
    div.innerHTML = html;
    while (div.firstChild) mainInner().appendChild(div.firstChild);
  }

  function renderHeader() {
    var showPreviewPill = state.rows.length === 0;
    appendHtml(
      '<div class="page-header">' +
      '<div class="page-header-text">' +
      '<h1>Supporter Hub</h1>' +
      '<div class="page-subtitle">' + escapeHtml(dateRangeText()) + '</div>' +
      '</div>' +
      (showPreviewPill ? '<span class="pill pill-preview">Synthetic preview</span>' : '') +
      '</div>'
    );
  }

  function renderKpis() {
    var k = computeKpis();
    appendHtml(
      '<section class="kpi-grid" aria-label="Key metrics">' +
      kpiCard("Total raised", fmtMoney(k.totalRaised)) +
      kpiCard("Supporters", fmtInt(k.supportersCount)) +
      kpiCard("Recurring donors", fmtInt(k.recurringCount)) +
      kpiCard("Average gift", fmtMoney(k.avgGift)) +
      '</section>'
    );
  }

  function kpiCard(label, value) {
    return '<div class="kpi-card"><div class="kpi-label">' + escapeHtml(label) +
      '</div><div class="kpi-value">' + value + '</div></div>';
  }

  function renderFiltersDisabled() {
    appendHtml('<div class="panel-section"><p style="color:var(--muted); margin:0;">No payments yet to filter.</p></div>');
  }

  function renderFilters() {
    var fyOptions = distinctSorted("financial_year", true);
    var methodOptions = distinctSorted("payment_method", false);
    var f = state.filters;

    var fyHtml = '<option value="">All years</option>' + fyOptions.map(function (v) {
      return '<option value="' + escapeHtml(v) + '"' + (f.fy === v ? " selected" : "") + '>' + escapeHtml(v) + '</option>';
    }).join("");

    var methodHtml = '<option value="">All methods</option>' + methodOptions.map(function (v) {
      return '<option value="' + escapeHtml(v) + '"' + (f.method === v ? " selected" : "") + '>' + escapeHtml(v) + '</option>';
    }).join("");

    appendHtml(
      '<div class="filters-row" role="search">' +
      '<div class="field field-search">' +
      '<label for="flt-search">Search</label>' +
      '<input type="text" id="flt-search" placeholder="Name, email or receipt number" value="' + escapeHtml(f.search) + '">' +
      '</div>' +
      '<div class="field">' +
      '<label for="flt-fy">Financial year</label>' +
      '<select id="flt-fy">' + fyHtml + '</select>' +
      '</div>' +
      '<div class="field">' +
      '<label for="flt-method">Payment method</label>' +
      '<select id="flt-method">' + methodHtml + '</select>' +
      '</div>' +
      '<div class="field field-checkbox">' +
      '<input type="checkbox" id="flt-successful"' + (f.successfulOnly ? " checked" : "") + '>' +
      '<label for="flt-successful">Successful only</label>' +
      '</div>' +
      '</div>'
    );

    document.getElementById("flt-search").addEventListener("input", debounce(function (e) {
      state.filters.search = e.target.value;
      state.page = 1;
      refreshTableOnly();
    }, 250));
    document.getElementById("flt-fy").addEventListener("change", function (e) {
      state.filters.fy = e.target.value;
      state.page = 1;
      refreshTableOnly();
    });
    document.getElementById("flt-method").addEventListener("change", function (e) {
      state.filters.method = e.target.value;
      state.page = 1;
      refreshTableOnly();
    });
    document.getElementById("flt-successful").addEventListener("change", function (e) {
      state.filters.successfulOnly = e.target.checked;
      state.page = 1;
      refreshTableOnly();
    });
  }

  var tableHolderId = "table-holder";

  function renderTableEmpty() {
    appendHtml(
      '<div id="' + tableHolderId + '">' +
      '<div class="state-box"><h3>No payments recorded</h3>' +
      '<p>When payments are recorded against this dataset, they will appear here.</p></div>' +
      '</div>'
    );
  }

  function renderTable() {
    appendHtml('<div id="' + tableHolderId + '"></div>');
    paintTable();
  }

  function refreshTableOnly() {
    paintTable();
  }

  var columnsDef = [
    { key: "payment_at", label: "Date", cls: "col-date" },
    { key: "supporter_name", label: "Supporter", cls: "col-supporter" },
    { key: "project", label: "Project", cls: "col-project" },
    { key: "payment_method", label: "Method", cls: "col-method" },
    { key: "amount_paid", label: "Amount", cls: "col-amount" },
    { key: "fee_amount", label: "Fee", cls: "col-fee" },
    { key: "status", label: "Status", cls: "col-status" }
  ];

  function paintTable() {
    var holder = document.getElementById(tableHolderId);
    if (!holder) return;

    var filteredSorted = getFilteredSorted();
    var total = filteredSorted.length;

    if (total === 0) {
      holder.innerHTML = '<div class="state-box"><h3>No matching payments</h3>' +
        '<p>Try adjusting your search or filters.</p></div>';
      return;
    }

    var totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    var startIdx = (state.page - 1) * state.pageSize;
    var pageRows = filteredSorted.slice(startIdx, startIdx + state.pageSize);

    var theadHtml = "<tr>" + columnsDef.map(function (c) {
      var sortable = c.key !== "status";
      var active = state.sortField === c.key;
      var arrow = active ? (state.sortDir === "asc" ? "▲" : "▼") : "";
      var ariaSort = active ? (state.sortDir === "asc" ? "ascending" : "descending") : "none";
      if (!sortable) {
        return '<th class="' + c.cls + '">' +
          '<span class="sort-btn" style="cursor:default;">' + escapeHtml(c.label) + '</span></th>';
      }
      return '<th class="' + c.cls + '" aria-sort="' + ariaSort + '">' +
        '<button type="button" class="sort-btn" data-sort="' + c.key + '">' +
        escapeHtml(c.label) + (arrow ? ' <span class="arrow">' + arrow + '</span>' : '') +
        '</button></th>';
    }).join("") + "</tr>";

    var tbodyHtml = pageRows.map(function (row) {
      var sid = val(row, "supporter_id");
      var d = parseDate(val(row, "payment_at"));
      var st = statusInfo(row);
      return '<tr tabindex="0" role="button" data-supporter-id="' + escapeHtml(sid) + '" aria-label="View supporter ' + escapeHtml(supporterDisplayName(row)) + '">' +
        '<td class="col-date" data-label="Date">' + fmtDMY(d) + '</td>' +
        '<td class="col-supporter" data-label="Supporter">' + escapeHtml(supporterDisplayName(row)) + '</td>' +
        '<td class="col-project" data-label="Project">' + escapeHtml(val(row, "project") || "—") + '</td>' +
        '<td class="col-method" data-label="Method">' + escapeHtml(val(row, "payment_method") || "—") + '</td>' +
        '<td class="col-amount" data-label="Amount">' + fmtMoney(val(row, "amount_paid")) + '</td>' +
        '<td class="col-fee" data-label="Fee">' + fmtMoney(val(row, "fee_amount")) + '</td>' +
        '<td class="col-status" data-label="Status"><span class="pill ' + st.cls + '">' + st.label + '</span></td>' +
        '</tr>';
    }).join("");

    var showingFrom = startIdx + 1;
    var showingTo = Math.min(startIdx + state.pageSize, total);

    holder.innerHTML =
      '<div class="table-wrap"><table><thead>' + theadHtml + '</thead><tbody>' + tbodyHtml + '</tbody></table></div>' +
      '<div class="pager">' +
      '<div class="pager-info">Showing ' + fmtInt(showingFrom) + '–' + fmtInt(showingTo) + ' of ' + fmtInt(total) + '</div>' +
      '<div class="pager-btns">' +
      '<button type="button" class="btn" id="pager-prev"' + (state.page <= 1 ? " disabled" : "") + '>Previous</button>' +
      '<button type="button" class="btn" id="pager-next"' + (state.page >= totalPages ? " disabled" : "") + '>Next</button>' +
      '</div></div>';

    holder.querySelectorAll("[data-sort]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.getAttribute("data-sort");
        if (state.sortField === key) {
          state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        } else {
          state.sortField = key;
          state.sortDir = key === "payment_at" ? "desc" : "asc";
        }
        paintTable();
      });
    });

    holder.querySelectorAll("tbody tr").forEach(function (tr) {
      var open = function () { openPanel(tr.getAttribute("data-supporter-id")); };
      tr.addEventListener("click", open);
      tr.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
      });
    });

    var prevBtn = document.getElementById("pager-prev");
    var nextBtn = document.getElementById("pager-next");
    if (prevBtn) prevBtn.addEventListener("click", function () { state.page--; paintTable(); });
    if (nextBtn) nextBtn.addEventListener("click", function () { state.page++; paintTable(); });
  }

  function renderError() {
    appendHtml(
      '<div class="page-header"><div class="page-header-text"><h1>Supporter Hub</h1></div></div>' +
      '<div class="state-box"><h3>Something went wrong loading payments</h3>' +
      '<p>' + escapeHtml(state.loadError) + '</p>' +
      '<button type="button" class="btn btn-primary" id="retry-load">Try again</button>' +
      '</div>'
    );
    document.getElementById("retry-load").addEventListener("click", loadData);
  }

  // ---- side panel ----

  function openPanel(supporterId) {
    state.panelSupporterId = supporterId;
    paintPanel();
  }

  function closePanel() {
    state.panelSupporterId = null;
    var overlay = document.getElementById("panel-overlay");
    if (overlay) overlay.remove();
    document.removeEventListener("keydown", onPanelKeydown);
  }

  function onPanelKeydown(e) {
    if (e.key === "Escape") closePanel();
  }

  function paintPanel() {
    var existing = document.getElementById("panel-overlay");
    if (existing) existing.remove();

    var sid = state.panelSupporterId;
    var supporterRows = state.rows.filter(function (r) { return String(val(r, "supporter_id")) === String(sid); });

    var overlay = document.createElement("div");
    overlay.className = "panel-overlay";
    overlay.id = "panel-overlay";

    if (supporterRows.length === 0) {
      overlay.innerHTML =
        '<aside class="panel" role="dialog" aria-modal="true" aria-labelledby="panel-title">' +
        '<div class="panel-header"><h2 id="panel-title" class="serif">Supporter</h2>' +
        '<button type="button" class="panel-close" aria-label="Close">✕</button></div>' +
        '<div class="state-box"><h3>Supporter not found</h3><p>This supporter could not be loaded.</p></div>' +
        '</aside>';
    } else {
      var first = supporterRows[0];
      var lifetime = supporterRows.reduce(function (sum, r) {
        return sum + (isSuccessfulCreditedRow(r) ? (Number(val(r, "amount_paid")) || 0) : 0);
      }, 0);

      var paymentsHtml = supporterRows
        .slice()
        .sort(function (a, b) {
          var da = parseDate(val(a, "payment_at"));
          var db = parseDate(val(b, "payment_at"));
          return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
        })
        .map(function (r) {
          var d = parseDate(val(r, "payment_at"));
          return '<div class="payment-row">' +
            '<span>' + fmtDMY(d) + '</span>' +
            '<span class="proj">' + escapeHtml(val(r, "project") || "—") + '</span>' +
            '<span>' + fmtMoney(val(r, "amount_paid")) + '</span>' +
            '</div>';
        }).join("");

      overlay.innerHTML =
        '<aside class="panel" role="dialog" aria-modal="true" aria-labelledby="panel-title">' +
        '<div class="panel-header">' +
        '<h2 id="panel-title" class="serif">' + escapeHtml(supporterDisplayName(first)) + '</h2>' +
        '<button type="button" class="panel-close" aria-label="Close panel">✕</button>' +
        '</div>' +
        '<div class="panel-lifetime"><div class="kpi-label">Lifetime total</div>' +
        '<div class="kpi-value">' + fmtMoney(lifetime) + '</div></div>' +
        '<dl class="detail-list">' +
        '<dt>Email</dt><dd>' + escapeHtml(val(first, "email") || "—") + '</dd>' +
        '<dt>Mobile</dt><dd>' + escapeHtml(val(first, "mobile_phone") || "—") + '</dd>' +
        '<dt>Supporter type</dt><dd>' + escapeHtml(val(first, "supporter_type") || "—") + '</dd>' +
        '<dt>Acquired</dt><dd>' + fmtDMY(parseDate(val(first, "acquisition_date"))) + '</dd>' +
        '<dt>Recurring status</dt><dd>' + escapeHtml(val(first, "recurring_donor_status") || "—") + '</dd>' +
        '<dt>Membership</dt><dd>' + escapeHtml(val(first, "membership_status") || "—") + '</dd>' +
        '</dl>' +
        '<div class="panel-payments"><h3 class="serif">Payments (' + fmtInt(supporterRows.length) + ')</h3>' +
        paymentsHtml +
        '</div>' +
        '</aside>';
    }

    document.body.appendChild(overlay);
    overlay.querySelector(".panel-close").addEventListener("click", closePanel);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closePanel();
    });
    document.addEventListener("keydown", onPanelKeydown);
    overlay.querySelector(".panel-close").focus();
  }

  function attachStaticHandlers() {}

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(null, args); }, ms);
    };
  }

  function renderLoading() {
    root.innerHTML = buildShellLoading();
  }

  function buildShellLoading() {
    var rows = "";
    for (var i = 0; i < 6; i++) {
      rows += '<tr class="skeleton-row"><td colspan="7"><div class="skeleton-bar"></div></td></tr>';
    }
    return (
      '<div class="app-shell">' +
      '<aside class="sidebar">' +
      '<div class="brand">' + brandIconSvg() + '<span>Supporter Hub</span></div>' +
      '</aside>' +
      '<main class="main"><div class="main-inner">' +
      '<div class="page-header"><div class="page-header-text"><h1>Supporter Hub</h1>' +
      '<div class="page-subtitle">Loading payments…</div></div></div>' +
      '<section class="kpi-grid">' +
      [1, 2, 3, 4].map(function () {
        return '<div class="kpi-card"><div class="skeleton-bar" style="width:60%; margin-bottom:12px;"></div><div class="skeleton-bar" style="width:40%; height:22px;"></div></div>';
      }).join("") +
      '</section>' +
      '<div class="table-wrap"><table><tbody>' + rows + '</tbody></table></div>' +
      '</div></main></div>'
    );
  }

  // ---- data loading ----

  function loadData() {
    state.loadError = null;
    state.sessionExpired = false;
    state.loading = true;
    renderLoading();

    fetch("api/supporters", { headers: { Accept: "application/json" } })
      .then(function (res) {
        if (res.status === 401) {
          state.sessionExpired = true;
          throw new Error("session-expired");
        }
        if (!res.ok) {
          throw new Error("Request failed with status " + res.status);
        }
        return res.json();
      })
      .then(function (data) {
        state.loading = false;
        state.columns = data.columns || FIELDS;
        state.idx = {};
        state.columns.forEach(function (c, i) { state.idx[c] = i; });
        state.rows = data.rows || [];
        state.viewer = data.viewer || null;
        render();
      })
      .catch(function (err) {
        state.loading = false;
        if (err.message !== "session-expired") {
          state.loadError = "We couldn't load payment data. Check your connection and try again.";
        }
        render();
      });
  }

  loadData();
})();
