window.knowiReportReady = false;

(function () {
  "use strict";

  var FIELD_ORDER = ["Opportunity_ID", "Company", "Stage", "Region", "Product", "AE_Name", "SDR_Name", "Amount", "Probability", "Created_Date"];
  var FILTER_FIELDS = [
    { key: "Stage", label: "Stage" },
    { key: "Region", label: "Region" },
    { key: "Product", label: "Product" },
    { key: "AE_Name", label: "Account exec" },
    { key: "SDR_Name", label: "SDR" }
  ];
  var PAGE_SIZE = 50;
  var STAGE_COLORS = ["#375357", "#4E6E78", "#6C8A93", "#8AA6AE", "#A8C2C9", "#5A7A82"];

  var state = {
    columns: [],
    idx: {},
    rows: [],
    user: null,
    filters: {},
    search: "",
    visibleCount: PAGE_SIZE,
    status: "loading"
  };

  var root = document.getElementById("app");

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") node.className = attrs[k];
        else if (k === "html") node.innerHTML = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function fmtMoney(n) {
    if (!isFinite(n)) return "—";
    return "$" + Math.round(n).toLocaleString("en-US");
  }

  function fmtPct(n) {
    if (!isFinite(n)) return "—";
    return Math.round(n) + "%";
  }

  function normProb(v) {
    var n = Number(v);
    if (!isFinite(n)) return null;
    return n <= 1 ? n * 100 : n;
  }

  function fmtDate(v) {
    if (!v) return "—";
    var d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  function stagePillClass(stage) {
    var s = String(stage || "").toLowerCase();
    if (s.indexOf("won") !== -1) return "pill-done";
    if (s.indexOf("lost") !== -1) return "pill-risk";
    return "pill-neutral";
  }

  async function fetchJson(path, opts) {
    var res = await fetch(path, opts);
    var body = null;
    try { body = await res.json(); } catch (e) {}
    return { ok: res.ok, status: res.status, body: body };
  }

  async function loadUser() {
    try {
      var r = await fetchJson("api/me");
      if (r.ok && r.body) state.user = r.body.user || null;
    } catch (e) {}
  }

  async function loadData() {
    state.status = "loading";
    render();
    try {
      var r = await fetchJson("api/opportunities");
      if (r.status === 401) {
        state.status = "session-expired";
        render();
        return;
      }
      if (!r.ok || !r.body || !r.body.columns) {
        state.status = "error";
        render();
        return;
      }
      state.columns = r.body.columns;
      state.idx = {};
      state.columns.forEach(function (c, i) { state.idx[c] = i; });
      state.rows = r.body.rows || [];
      state.status = "ready";
      render();
    } catch (e) {
      state.status = "error";
      render();
    }
  }

  function val(row, field) {
    var i = state.idx[field];
    return i === undefined ? undefined : row[i];
  }

  function distinctValues(field) {
    var seen = {};
    var out = [];
    state.rows.forEach(function (row) {
      var v = val(row, field);
      if (v === null || v === undefined || v === "") return;
      var key = String(v);
      if (!seen[key]) { seen[key] = true; out.push(key); }
    });
    out.sort(function (a, b) { return a.localeCompare(b); });
    return out;
  }

  function matchesFilters(row) {
    for (var i = 0; i < FILTER_FIELDS.length; i++) {
      var f = FILTER_FIELDS[i].key;
      var sel = state.filters[f];
      if (sel && String(val(row, f)) !== sel) return false;
    }
    if (state.search) {
      var q = state.search.toLowerCase();
      var company = String(val(row, "Company") || "").toLowerCase();
      var oppId = String(val(row, "Opportunity_ID") || "").toLowerCase();
      if (company.indexOf(q) === -1 && oppId.indexOf(q) === -1) return false;
    }
    return true;
  }

  function getFilteredRows() {
    return state.rows.filter(matchesFilters);
  }

  function computeSummary(rows) {
    var count = rows.length;
    var totalAmount = 0, amountCount = 0;
    var totalProb = 0, probCount = 0;
    rows.forEach(function (row) {
      var a = Number(val(row, "Amount"));
      if (isFinite(a)) { totalAmount += a; amountCount++; }
      var p = normProb(val(row, "Probability"));
      if (p !== null) { totalProb += p; probCount++; }
    });
    return {
      count: count,
      totalAmount: totalAmount,
      avgAmount: amountCount ? totalAmount / amountCount : NaN,
      avgProb: probCount ? totalProb / probCount : NaN
    };
  }

  function computeStageMix(rows) {
    var counts = {};
    var order = [];
    rows.forEach(function (row) {
      var s = String(val(row, "Stage") || "Unspecified");
      if (!counts[s]) { counts[s] = 0; order.push(s); }
      counts[s]++;
    });
    order.sort(function (a, b) { return counts[b] - counts[a]; });
    return order.map(function (s) { return { stage: s, count: counts[s] }; });
  }

  function iconList() {
    return el("svg", { width: "16", height: "16", viewBox: "0 0 16 16", "aria-hidden": "true" }, [
      el("rect", { x: "2", y: "3", width: "12", height: "2", rx: "1", fill: "#4E6E78" }),
      el("rect", { x: "2", y: "7", width: "12", height: "2", rx: "1", fill: "#4E6E78" }),
      el("rect", { x: "2", y: "11", width: "8", height: "2", rx: "1", fill: "#4E6E78" })
    ]);
  }

  function renderSidebar() {
    var totalCount = state.rows.length;
    var user = state.user;
    var initials = user && user.name ? user.name.trim().charAt(0).toUpperCase() : "K";

    var viewerInfo = user
      ? el("div", { class: "viewer-info" }, [
          el("div", { class: "viewer-name", text: user.name || user.email || "Signed in" }),
          user.email ? el("div", { class: "viewer-email", text: user.email }) : null
        ])
      : el("div", { class: "viewer-info" }, [
          el("div", { class: "viewer-name", text: "Signed in" }),
          el("div", { class: "viewer-email", text: "via Knowi" })
        ]);

    return el("aside", { class: "sidebar" }, [
      el("div", { class: "brand", text: "Opportunity Ledger" }),
      el("nav", { class: "nav", "aria-label": "Primary" }, [
        el("div", { class: "nav-link" }, [
          iconList(),
          el("span", { class: "label", text: "Opportunities" }),
          el("span", { class: "count-pill", text: totalCount ? String(totalCount) : "—" })
        ])
      ]),
      el("div", { class: "sidebar-spacer" }),
      el("div", { class: "viewer" }, [
        el("div", { class: "viewer-avatar", text: initials }),
        viewerInfo
      ])
    ]);
  }

  function renderSummary(summary) {
    return el("section", { class: "card summary-card", "aria-label": "Summary statistics" }, [
      el("div", { class: "stat" }, [
        el("div", { class: "stat-label", text: "Opportunities" }),
        el("div", { class: "stat-value", text: summary.count.toLocaleString("en-US") })
      ]),
      el("div", { class: "stat" }, [
        el("div", { class: "stat-label", text: "Total pipeline value" }),
        el("div", { class: "stat-value", text: fmtMoney(summary.totalAmount) })
      ]),
      el("div", { class: "stat" }, [
        el("div", { class: "stat-label", text: "Average deal size" }),
        el("div", { class: "stat-value", text: fmtMoney(summary.avgAmount) })
      ]),
      el("div", { class: "stat" }, [
        el("div", { class: "stat-label", text: "Average win probability" }),
        el("div", { class: "stat-value", text: fmtPct(summary.avgProb) })
      ])
    ]);
  }

  function renderStageMix(mix) {
    var total = mix.reduce(function (sum, m) { return sum + m.count; }, 0);

    if (total === 0) {
      return el("section", { class: "card stagemix-card" }, [
        el("h2", { class: "card-title", text: "Stage mix" }),
        el("p", { style: "color: var(--muted); margin: 0;", text: "No opportunities to show for the current filters." })
      ]);
    }

    var bar = el("div", { class: "stagemix-bar", role: "img", "aria-label": "Share of opportunities by stage" });
    var legend = el("div", { class: "stagemix-legend" });

    mix.forEach(function (m, i) {
      var color = STAGE_COLORS[i % STAGE_COLORS.length];
      var pct = (m.count / total) * 100;
      bar.appendChild(el("div", { class: "stagemix-seg", style: "width:" + pct + "%;background:" + color }));
      legend.appendChild(el("div", { class: "stagemix-item" }, [
        el("span", { class: "stagemix-swatch", style: "background:" + color }),
        el("span", { class: "stagemix-name", text: m.stage }),
        el("span", { class: "stagemix-count", text: m.count.toLocaleString("en-US") + " (" + Math.round(pct) + "%)" })
      ]));
    });

    return el("section", { class: "card stagemix-card" }, [
      el("h2", { class: "card-title", text: "Stage mix" }),
      bar,
      legend
    ]);
  }

  function renderFilters() {
    var fields = FILTER_FIELDS.map(function (f) {
      var options = distinctValues(f.key);
      var selectId = "filter-" + f.key;
      var select = el("select", { id: selectId }, [
        el("option", { value: "", text: "All " + f.label.toLowerCase() + "s" })
      ].concat(options.map(function (v) {
        var opt = el("option", { value: v, text: v });
        if (state.filters[f.key] === v) opt.setAttribute("selected", "selected");
        return opt;
      })));
      select.addEventListener("change", function () {
        state.filters[f.key] = select.value;
        state.visibleCount = PAGE_SIZE;
        render();
      });
      return el("div", { class: "filter-field" }, [
        el("label", { for: selectId, text: f.label }),
        select
      ]);
    });

    var searchInput = el("input", { type: "text", id: "filter-search", placeholder: "Search company or opportunity ID", value: state.search });
    searchInput.addEventListener("input", function () {
      state.search = searchInput.value;
      state.visibleCount = PAGE_SIZE;
      renderList();
    });

    var hasActive = state.search || FILTER_FIELDS.some(function (f) { return state.filters[f.key]; });

    var clearBtn = el("button", { class: "btn btn-secondary", type: "button", text: "Clear filters" });
    clearBtn.disabled = !hasActive;
    clearBtn.addEventListener("click", function () {
      state.filters = {};
      state.search = "";
      state.visibleCount = PAGE_SIZE;
      render();
    });

    return el("section", { class: "card filters-bar", "aria-label": "Filters" },
      fields.concat([
        el("div", { class: "filter-field search-field" }, [
          el("label", { for: "filter-search", text: "Search" }),
          searchInput
        ]),
        el("div", { class: "filter-field" }, [
          el("label", { text: " " }),
          clearBtn
        ])
      ])
    );
  }

  function renderTable(filteredRows) {
    var visibleRows = filteredRows.slice(0, state.visibleCount);

    if (filteredRows.length === 0) {
      return el("section", { class: "card table-card" }, [
        el("div", { class: "state-card" }, [
          el("h2", { text: "No opportunities match these filters" }),
          el("p", { text: "Try clearing a filter or adjusting your search." })
        ])
      ]);
    }

    var thead = el("thead", {}, [
      el("tr", {}, [
        el("th", { text: "Opportunity" }),
        el("th", { text: "Stage" }),
        el("th", { text: "Region" }),
        el("th", { text: "Product" }),
        el("th", { text: "Account exec" }),
        el("th", { text: "SDR" }),
        el("th", { class: "num", text: "Amount" }),
        el("th", { class: "num", text: "Probability" }),
        el("th", { text: "Created" })
      ])
    ]);

    var tbody = el("tbody");
    visibleRows.forEach(function (row) {
      var stage = val(row, "Stage");
      var amount = Number(val(row, "Amount"));
      var prob = normProb(val(row, "Probability"));
      var probClamped = prob === null ? 0 : Math.max(0, Math.min(100, prob));

      tbody.appendChild(el("tr", {}, [
        el("td", {}, [
          el("div", { class: "company-cell", text: String(val(row, "Company") || "—") }),
          el("div", { class: "sub-cell", text: String(val(row, "Opportunity_ID") || "") })
        ]),
        el("td", {}, [
          el("span", { class: "pill " + stagePillClass(stage), text: stage == null || stage === "" ? "—" : String(stage) })
        ]),
        el("td", { text: val(row, "Region") || "—" }),
        el("td", { text: val(row, "Product") || "—" }),
        el("td", { text: val(row, "AE_Name") || "—" }),
        el("td", { text: val(row, "SDR_Name") || "—" }),
        el("td", { class: "num", text: isFinite(amount) ? fmtMoney(amount) : "—" }),
        el("td", { class: "num" }, [
          el("div", { class: "prob-wrap" }, [
            el("div", { class: "prob-track" }, [
              el("div", { class: "prob-fill", style: "width:" + probClamped + "%" })
            ]),
            el("span", { text: prob === null ? "—" : fmtPct(prob) })
          ])
        ]),
        el("td", { text: fmtDate(val(row, "Created_Date")) })
      ]));
    });

    var table = el("table", { role: "table" }, [thead, tbody]);
    var scroll = el("div", { class: "table-scroll" }, [table]);

    var pager = el("div", { class: "pager" }, [
      el("span", { class: "pager-count", text: "Showing " + visibleRows.length.toLocaleString("en-US") + " of " + filteredRows.length.toLocaleString("en-US") })
    ]);

    if (visibleRows.length < filteredRows.length) {
      var moreBtn = el("button", { class: "btn btn-secondary", type: "button", text: "Show more" });
      moreBtn.addEventListener("click", function () {
        state.visibleCount += PAGE_SIZE;
        renderList();
      });
      pager.appendChild(moreBtn);
    }

    return el("section", { class: "card table-card" }, [scroll, pager]);
  }

  var listContainer = null;

  function renderList() {
    if (!listContainer) return;
    listContainer.innerHTML = "";
    var filtered = getFilteredRows();
    listContainer.appendChild(renderSummary(computeSummary(filtered)));
    listContainer.appendChild(renderStageMix(computeStageMix(filtered)));
    listContainer.appendChild(renderFilters());
    listContainer.appendChild(renderTable(filtered));
  }

  function renderSkeleton() {
    var card = el("section", { class: "card table-card" });
    for (var i = 0; i < 6; i++) {
      var row = el("div", { class: "skeleton-row" });
      for (var j = 0; j < 5; j++) row.appendChild(el("div", { class: "skel-block" }));
      card.appendChild(row);
    }
    return card;
  }

  function render() {
    root.innerHTML = "";

    var canvasInner = el("div", { class: "canvas-inner" }, [
      el("header", { class: "page-header" }, [
        el("h1", { text: "Opportunities" }),
        el("p", { text: "A ledger of sales opportunities with live totals and filters." })
      ])
    ]);

    if (state.status === "loading") {
      canvasInner.appendChild(renderSkeleton());
    } else if (state.status === "session-expired") {
      canvasInner.appendChild(el("section", { class: "card" }, [
        el("div", { class: "state-card" }, [
          el("h2", { text: "Your session has expired" }),
          el("p", { text: "Sign in again to keep viewing this dashboard." }),
          el("a", { class: "btn btn-primary", href: "login", style: "text-decoration:none; display:inline-flex; align-items:center;", text: "Go to sign in" })
        ])
      ]));
    } else if (state.status === "error") {
      var retryBtn = el("button", { class: "btn btn-primary", type: "button", text: "Try again" });
      retryBtn.addEventListener("click", loadData);
      canvasInner.appendChild(el("section", { class: "card" }, [
        el("div", { class: "state-card" }, [
          el("h2", { text: "Couldn't load opportunities" }),
          el("p", { text: "Something went wrong while fetching the data." }),
          retryBtn
        ])
      ]));
    } else if (state.status === "ready" && state.rows.length === 0) {
      canvasInner.appendChild(el("section", { class: "card" }, [
        el("div", { class: "state-card" }, [
          el("h2", { text: "No opportunities yet" }),
          el("p", { text: "When sales opportunities are added to the dataset, they'll show up here." })
        ])
      ]));
    } else if (state.status === "ready") {
      listContainer = el("div", { style: "display:flex; flex-direction:column; gap:22px;" });
      canvasInner.appendChild(listContainer);
      renderList();
    }

    var main = el("main", { class: "canvas" }, [canvasInner]);
    root.appendChild(renderSidebar());
    root.appendChild(main);

    window.knowiReportReady = true;
  }

  async function init() {
    await loadUser();
    await loadData();
  }

  init();
})();
