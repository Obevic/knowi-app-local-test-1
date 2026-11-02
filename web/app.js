window.knowiReportReady = false;

(function () {
  "use strict";

  var FIELDS = ["AE_Name", "Amount", "Company", "Created_Date", "Opportunity_ID", "Probability", "Product", "Region", "SDR_Name", "Stage"];
  var PAGE_SIZE = 50;

  var state = {
    columns: [],
    rows: [],
    truncated: false,
    filtered: [],
    visibleCount: PAGE_SIZE,
    sort: { field: "Created_Date", dir: "desc" },
    filters: { Region: "", Stage: "", Product: "", AE_Name: "", SDR_Name: "" },
    search: ""
  };

  var els = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    els.skeleton = document.getElementById("skeleton");
    els.errorState = document.getElementById("error-state");
    els.sessionExpired = document.getElementById("session-expired");
    els.emptyState = document.getElementById("empty-state");
    els.content = document.getElementById("content");
    els.summaryStats = document.getElementById("summary-stats");
    els.truncationNote = document.getElementById("truncation-note");
    els.tbody = document.getElementById("ledger-body");
    els.listStatus = document.getElementById("list-status");
    els.showMoreBtn = document.getElementById("show-more");
    els.clearBtn = document.getElementById("clear-filters");
    els.searchInput = document.getElementById("search-input");
    els.navCount = document.getElementById("nav-count");
    els.viewerName = document.getElementById("viewer-name");
    els.viewerSub = document.getElementById("viewer-sub");
    els.viewerAvatar = document.getElementById("viewer-avatar");
    els.errorRetry = document.getElementById("error-retry");

    var filterSelects = ["Region", "Stage", "Product", "AE_Name", "SDR_Name"];
    filterSelects.forEach(function (f) {
      var sel = document.getElementById("filter-" + f);
      if (sel) {
        sel.addEventListener("change", function () {
          state.filters[f] = sel.value;
          state.visibleCount = PAGE_SIZE;
          applyFilters();
        });
      }
    });

    els.searchInput.addEventListener("input", debounce(function () {
      state.search = els.searchInput.value.trim().toLowerCase();
      state.visibleCount = PAGE_SIZE;
      applyFilters();
    }, 200));

    els.clearBtn.addEventListener("click", function () {
      filterSelects.forEach(function (f) {
        state.filters[f] = "";
        var sel = document.getElementById("filter-" + f);
        if (sel) sel.value = "";
      });
      state.search = "";
      els.searchInput.value = "";
      state.visibleCount = PAGE_SIZE;
      applyFilters();
    });

    els.showMoreBtn.addEventListener("click", function () {
      state.visibleCount += PAGE_SIZE;
      renderTable();
    });

    document.querySelectorAll("th[data-sort-field] button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var field = btn.closest("th").getAttribute("data-sort-field");
        if (state.sort.field === field) {
          state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
        } else {
          state.sort.field = field;
          state.sort.dir = field === "Company" ? "asc" : "desc";
        }
        updateSortIndicators();
        applyFilters();
      });
    });

    var retry = document.getElementById("error-retry");
    if (retry) retry.addEventListener("click", loadData);

    loadSession();
    loadData();
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      var args = arguments;
      t = setTimeout(function () { fn.apply(null, args); }, ms);
    };
  }

  function loadSession() {
    fetch("api/session").then(function (r) {
      if (!r.ok) return null;
      return r.json();
    }).then(function (data) {
      if (data && data.name) {
        els.viewerName.textContent = data.name;
        els.viewerSub.textContent = data.email || "Signed in";
        els.viewerAvatar.textContent = data.name.charAt(0).toUpperCase();
      } else {
        els.viewerName.textContent = "Previewing";
        els.viewerSub.textContent = "Guest viewer";
        els.viewerAvatar.textContent = "P";
      }
    }).catch(function () {
      els.viewerName.textContent = "Previewing";
      els.viewerSub.textContent = "Guest viewer";
      els.viewerAvatar.textContent = "P";
    });
  }

  function loadData() {
    showOnly("skeleton");
    fetch("api/sales").then(function (r) {
      if (r.status === 401) {
        showOnly("sessionExpired");
        markReady();
        throw new Error("session-expired");
      }
      if (!r.ok) {
        throw new Error("load-failed");
      }
      return r.json();
    }).then(function (data) {
      state.columns = data.columns || [];
      state.rows = normalizeRows(data.columns, data.rows || []);
      state.truncated = !!data.truncated;

      if (state.rows.length === 0) {
        showOnly("emptyState");
        markReady();
        return;
      }

      buildFilterOptions();
      showOnly("content");
      if (state.truncated) {
        els.truncationNote.hidden = false;
        els.truncationNote.textContent = "Showing the first " + state.rows.length.toLocaleString() + " opportunities loaded from the dataset.";
      } else {
        els.truncationNote.hidden = true;
      }
      updateSortIndicators();
      applyFilters();
      markReady();
    }).catch(function (err) {
      if (err.message === "session-expired") return;
      showOnly("errorState");
      markReady();
    });
  }

  function markReady() {
    window.knowiReportReady = true;
  }

  function showOnly(key) {
    var keys = ["skeleton", "errorState", "sessionExpired", "emptyState", "content"];
    keys.forEach(function (k) {
      if (els[k]) els[k].hidden = k !== key;
    });
  }

  function normalizeRows(columns, rows) {
    var iProb = columns.indexOf("Probability");

    var maxProb = 0;
    rows.forEach(function (r) {
      var v = Number(r[iProb]);
      if (!isNaN(v) && v > maxProb) maxProb = v;
    });
    var probScale = maxProb <= 1.5 ? 100 : 1;

    return rows.map(function (r) {
      var out = {};
      columns.forEach(function (c, i) {
        out[c] = r[i];
      });
      out._amount = Number(out.Amount) || 0;
      var p = Number(out.Probability);
      out._probability = isNaN(p) ? null : p * probScale;
      var d = out.Created_Date ? new Date(out.Created_Date) : null;
      out._date = d && !isNaN(d.getTime()) ? d : null;
      return out;
    });
  }

  function uniqueSorted(field) {
    var set = {};
    state.rows.forEach(function (r) {
      var v = r[field];
      if (v !== null && v !== undefined && v !== "") set[v] = true;
    });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b); });
  }

  function buildFilterOptions() {
    ["Region", "Stage", "Product", "AE_Name", "SDR_Name"].forEach(function (f) {
      var sel = document.getElementById("filter-" + f);
      if (!sel) return;
      var values = uniqueSorted(f);
      sel.innerHTML = "";
      var allOpt = document.createElement("option");
      allOpt.value = "";
      allOpt.textContent = "All " + sel.getAttribute("data-label");
      sel.appendChild(allOpt);
      values.forEach(function (v) {
        var opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        sel.appendChild(opt);
      });
    });
  }

  function applyFilters() {
    var f = state.filters;
    var search = state.search;

    var result = state.rows.filter(function (r) {
      if (f.Region && r.Region !== f.Region) return false;
      if (f.Stage && r.Stage !== f.Stage) return false;
      if (f.Product && r.Product !== f.Product) return false;
      if (f.AE_Name && r.AE_Name !== f.AE_Name) return false;
      if (f.SDR_Name && r.SDR_Name !== f.SDR_Name) return false;
      if (search) {
        var company = (r.Company || "").toString().toLowerCase();
        var oppId = (r.Opportunity_ID || "").toString().toLowerCase();
        if (company.indexOf(search) === -1 && oppId.indexOf(search) === -1) return false;
      }
      return true;
    });

    var field = state.sort.field;
    var dir = state.sort.dir === "asc" ? 1 : -1;
    result.sort(function (a, b) {
      var av, bv;
      if (field === "Amount") { av = a._amount; bv = b._amount; }
      else if (field === "Probability") { av = a._probability || 0; bv = b._probability || 0; }
      else if (field === "Created_Date") { av = a._date ? a._date.getTime() : 0; bv = b._date ? b._date.getTime() : 0; }
      else { av = (a[field] || "").toString().toLowerCase(); bv = (b[field] || "").toString().toLowerCase(); }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });

    state.filtered = result;
    renderSummary();
    renderTable();
  }

  function renderSummary() {
    var rows = state.filtered;
    var count = rows.length;
    var totalAmount = 0;
    var probSum = 0;
    var probCount = 0;

    rows.forEach(function (r) {
      totalAmount += r._amount;
      if (r._probability !== null) {
        probSum += r._probability;
        probCount++;
      }
    });

    var avgAmount = count ? totalAmount / count : 0;
    var avgProb = probCount ? probSum / probCount : 0;

    els.summaryStats.innerHTML = "";
    addStat("Opportunities", count.toLocaleString());
    addStat("Total amount", formatCurrency(totalAmount));
    addStat("Average amount", formatCurrency(avgAmount));
    addStat("Average probability", probCount ? Math.round(avgProb) + "%" : "—");

    if (els.navCount) els.navCount.textContent = state.rows.length.toLocaleString();
  }

  function addStat(label, value) {
    var wrap = document.createElement("div");
    wrap.className = "stat";
    var l = document.createElement("p");
    l.className = "stat-label";
    l.textContent = label;
    var v = document.createElement("p");
    v.className = "stat-value";
    v.textContent = value;
    wrap.appendChild(l);
    wrap.appendChild(v);
    els.summaryStats.appendChild(wrap);
  }

  function formatCurrency(n) {
    if (!isFinite(n)) n = 0;
    return "$" + Math.round(n).toLocaleString();
  }

  function formatDate(d) {
    if (!d) return "—";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function classifyStage(stage) {
    var s = (stage || "").toString().toLowerCase();
    if (s.indexOf("won") !== -1) return "pill-done";
    if (s.indexOf("lost") !== -1) return "pill-risk";
    if (s.indexOf("negotia") !== -1 || s.indexOf("proposal") !== -1 || s.indexOf("pending") !== -1 || s.indexOf("review") !== -1) return "pill-wait";
    return "pill-neutral";
  }

  function renderTable() {
    var rows = state.filtered;
    var visible = rows.slice(0, state.visibleCount);
    els.tbody.innerHTML = "";

    visible.forEach(function (r) {
      var tr = document.createElement("tr");

      tr.appendChild(td(makeCompanyCell(r)));
      tr.appendChild(td(textNode(r.AE_Name)));
      tr.appendChild(td(textNode(r.SDR_Name)));
      tr.appendChild(td(textNode(r.Region)));
      tr.appendChild(td(textNode(r.Product)));
      tr.appendChild(td(makeStagePill(r.Stage)));
      tr.appendChild(td(makeProbCell(r._probability)));
      var amountTd = td(textNode(formatCurrency(r._amount)));
      amountTd.classList.add("amount-cell");
      tr.appendChild(amountTd);
      tr.appendChild(td(textNode(formatDate(r._date))));

      els.tbody.appendChild(tr);
    });

    els.listStatus.textContent = rows.length
      ? "Showing " + Math.min(state.visibleCount, rows.length).toLocaleString() + " of " + rows.length.toLocaleString() + " opportunities"
      : "No opportunities match these filters";

    els.showMoreBtn.hidden = state.visibleCount >= rows.length;
  }

  function td(node) {
    var cell = document.createElement("td");
    cell.appendChild(node);
    return cell;
  }

  function textNode(text) {
    var span = document.createElement("span");
    span.textContent = text || "—";
    return span;
  }

  function makeCompanyCell(r) {
    var wrap = document.createElement("span");
    var name = document.createElement("span");
    name.className = "cell-company";
    name.textContent = r.Company || "Unnamed company";
    var id = document.createElement("span");
    id.className = "cell-id";
    id.textContent = r.Opportunity_ID || "";
    wrap.appendChild(name);
    wrap.appendChild(id);
    return wrap;
  }

  function makeStagePill(stage) {
    var span = document.createElement("span");
    span.className = "pill " + classifyStage(stage);
    span.textContent = stage || "—";
    return span;
  }

  function makeProbCell(prob) {
    var wrap = document.createElement("span");
    wrap.className = "prob-wrap";
    if (prob === null || prob === undefined || isNaN(prob)) {
      wrap.appendChild(textNode(null));
      return wrap;
    }
    var pct = Math.max(0, Math.min(100, prob));
    var track = document.createElement("span");
    track.className = "prob-track";
    var fill = document.createElement("span");
    fill.className = "prob-fill";
    fill.style.width = pct + "%";
    track.appendChild(fill);
    var text = document.createElement("span");
    text.className = "prob-text";
    text.textContent = Math.round(pct) + "%";
    wrap.appendChild(track);
    wrap.appendChild(text);
    return wrap;
  }

  function updateSortIndicators() {
    document.querySelectorAll("th[data-sort-field]").forEach(function (th) {
      var field = th.getAttribute("data-sort-field");
      var arrow = th.querySelector(".sort-arrow");
      if (field === state.sort.field) {
        arrow.textContent = state.sort.dir === "asc" ? "▲" : "▼";
        th.setAttribute("aria-sort", state.sort.dir === "asc" ? "ascending" : "descending");
      } else {
        arrow.textContent = "";
        th.removeAttribute("aria-sort");
      }
    });
  }
})();
