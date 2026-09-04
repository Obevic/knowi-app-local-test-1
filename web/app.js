(function () {
  "use strict";

  var CITY_LIBRARY = [
    { tz: "America/New_York", name: "New York" },
    { tz: "America/Chicago", name: "Chicago" },
    { tz: "America/Denver", name: "Denver" },
    { tz: "America/Los_Angeles", name: "Los Angeles" },
    { tz: "America/Mexico_City", name: "Mexico City" },
    { tz: "America/Sao_Paulo", name: "São Paulo" },
    { tz: "Europe/London", name: "London" },
    { tz: "Europe/Paris", name: "Paris" },
    { tz: "Europe/Berlin", name: "Berlin" },
    { tz: "Europe/Moscow", name: "Moscow" },
    { tz: "Africa/Cairo", name: "Cairo" },
    { tz: "Africa/Johannesburg", name: "Johannesburg" },
    { tz: "Asia/Dubai", name: "Dubai" },
    { tz: "Asia/Kolkata", name: "Mumbai" },
    { tz: "Asia/Bangkok", name: "Bangkok" },
    { tz: "Asia/Singapore", name: "Singapore" },
    { tz: "Asia/Hong_Kong", name: "Hong Kong" },
    { tz: "Asia/Shanghai", name: "Shanghai" },
    { tz: "Asia/Tokyo", name: "Tokyo" },
    { tz: "Asia/Seoul", name: "Seoul" },
    { tz: "Australia/Sydney", name: "Sydney" },
    { tz: "Pacific/Auckland", name: "Auckland" },
    { tz: "Pacific/Honolulu", name: "Honolulu" }
  ];

  var DEFAULT_TZS = ["America/New_York", "Europe/London", "Asia/Tokyo", "Australia/Sydney"];
  var LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  var cities = DEFAULT_TZS.map(function (tz) {
    var entry = CITY_LIBRARY.filter(function (c) { return c.tz === tz; })[0];
    return { tz: tz, name: entry ? entry.name : tzShortName(tz), refs: null };
  });

  var citySelect = document.getElementById("city-select");
  var addForm = document.getElementById("add-city-form");
  var clockGrid = document.getElementById("clock-grid");
  var clocksEmpty = document.getElementById("clocks-empty");
  var timelineRows = document.getElementById("timeline-rows");
  var timelineEmpty = document.getElementById("timeline-empty");
  var heroTimeEl = document.getElementById("hero-time");
  var heroDateEl = document.getElementById("hero-date");
  var heroZoneEl = document.getElementById("hero-zone");
  var heroClockRefs = null;

  function tzShortName(tz) {
    var seg = tz.split("/").pop() || tz;
    return seg.replace(/_/g, " ");
  }

  function getZonedParts(tz, date) {
    var dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
      timeZoneName: "shortOffset"
    });
    var parts = dtf.formatToParts(date);
    var map = {};
    for (var i = 0; i < parts.length; i++) {
      map[parts[i].type] = parts[i].value;
    }
    return map;
  }

  function buildClockFace(svgClass) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("class", "clock-face " + svgClass);
    svg.setAttribute("aria-hidden", "true");

    for (var i = 0; i < 12; i++) {
      var deg = i * 30;
      var major = i % 3 === 0;
      var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", "50");
      line.setAttribute("y1", major ? "6" : "8");
      line.setAttribute("x2", "50");
      line.setAttribute("y2", "14");
      line.setAttribute("class", major ? "clock-tick clock-tick--major" : "clock-tick");
      line.setAttribute("transform", "rotate(" + deg + " 50 50)");
      svg.appendChild(line);
    }

    var hour = document.createElementNS("http://www.w3.org/2000/svg", "line");
    hour.setAttribute("x1", "50");
    hour.setAttribute("y1", "50");
    hour.setAttribute("x2", "50");
    hour.setAttribute("y2", "28");
    hour.setAttribute("class", "hand hand--hour");

    var minute = document.createElementNS("http://www.w3.org/2000/svg", "line");
    minute.setAttribute("x1", "50");
    minute.setAttribute("y1", "50");
    minute.setAttribute("x2", "50");
    minute.setAttribute("y2", "18");
    minute.setAttribute("class", "hand hand--minute");

    var second = document.createElementNS("http://www.w3.org/2000/svg", "line");
    second.setAttribute("x1", "50");
    second.setAttribute("y1", "58");
    second.setAttribute("x2", "50");
    second.setAttribute("y2", "15");
    second.setAttribute("class", "hand hand--second");

    var hub = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    hub.setAttribute("cx", "50");
    hub.setAttribute("cy", "50");
    hub.setAttribute("r", "2.6");
    hub.setAttribute("class", "clock-hub");

    svg.appendChild(hour);
    svg.appendChild(minute);
    svg.appendChild(second);
    svg.appendChild(hub);

    return { svg: svg, hour: hour, minute: minute, second: second };
  }

  function createClockCard(city) {
    var li = document.createElement("li");
    li.className = "clock-card";
    li.dataset.tz = city.tz;

    var head = document.createElement("div");
    head.className = "clock-card__head";

    var heading = document.createElement("h3");
    heading.className = "clock-card__city";
    heading.textContent = city.name;

    var removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "icon-btn";
    removeBtn.dataset.remove = city.tz;
    removeBtn.setAttribute("aria-label", "Remove " + city.name);
    removeBtn.textContent = "✕";

    head.appendChild(heading);
    head.appendChild(removeBtn);

    var face = buildClockFace("clock-face--card");

    var digital = document.createElement("p");
    digital.className = "clock-card__digital";

    var meta = document.createElement("p");
    meta.className = "clock-card__meta";

    var offset = document.createElement("span");
    offset.className = "offset";

    var badge = document.createElement("span");
    badge.className = "day-badge";
    badge.hidden = true;

    meta.appendChild(offset);
    meta.appendChild(badge);

    li.appendChild(head);
    li.appendChild(face.svg);
    li.appendChild(digital);
    li.appendChild(meta);

    city.refs = {
      hour: face.hour,
      minute: face.minute,
      second: face.second,
      digital: digital,
      offset: offset,
      badge: badge
    };

    return li;
  }

  function createTimelineRow(city) {
    var li = document.createElement("li");
    li.className = "timeline-row";
    li.dataset.tz = city.tz;

    var label = document.createElement("div");
    label.className = "timeline-row__label";

    var name = document.createElement("span");
    name.className = "timeline-row__city";
    name.textContent = city.name;

    var hourLabel = document.createElement("span");
    hourLabel.className = "timeline-row__hour";

    label.appendChild(name);
    label.appendChild(hourLabel);

    var track = document.createElement("div");
    track.className = "timeline-row__track";

    var band = document.createElement("div");
    band.className = "timeline-row__band";

    var nowLine = document.createElement("div");
    nowLine.className = "timeline-row__now";

    track.appendChild(band);
    track.appendChild(nowLine);

    li.appendChild(label);
    li.appendChild(track);

    city.timelineRefs = { hourLabel: hourLabel, nowLine: nowLine };

    return li;
  }

  function rebuildBoard() {
    clockGrid.innerHTML = "";
    timelineRows.innerHTML = "";

    cities.forEach(function (city) {
      clockGrid.appendChild(createClockCard(city));
      timelineRows.appendChild(createTimelineRow(city));
    });

    var hasCities = cities.length > 0;
    clocksEmpty.hidden = hasCities;
    timelineRows.hidden = !hasCities;
    timelineEmpty.hidden = hasCities;

    rebuildSelect();
    tick();
  }

  function rebuildSelect() {
    var usedTz = cities.map(function (c) { return c.tz; });
    citySelect.innerHTML = "";

    var available = CITY_LIBRARY.filter(function (c) { return usedTz.indexOf(c.tz) === -1; });

    if (available.length === 0) {
      var opt = document.createElement("option");
      opt.textContent = "All cities added";
      citySelect.appendChild(opt);
      citySelect.disabled = true;
      addForm.querySelector(".btn").disabled = true;
      return;
    }

    citySelect.disabled = false;
    addForm.querySelector(".btn").disabled = false;

    available.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c.tz;
      opt.textContent = c.name;
      citySelect.appendChild(opt);
    });
  }

  function dayDiffLabel(cityParts, localParts) {
    var cityNum = Number(cityParts.year) * 10000 + Number(cityParts.month) * 100 + Number(cityParts.day);
    var localNum = Number(localParts.year) * 10000 + Number(localParts.month) * 100 + Number(localParts.day);
    if (cityNum > localNum) return "Tomorrow";
    if (cityNum < localNum) return "Yesterday";
    return null;
  }

  function formatTime(parts) {
    var h = Number(parts.hour) % 24;
    var suffix = h >= 12 ? "PM" : "AM";
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return h12 + ":" + parts.minute + ":" + parts.second + " " + suffix;
  }

  function applyHands(refs, parts) {
    var hour24 = Number(parts.hour) % 24;
    var minute = Number(parts.minute);
    var second = Number(parts.second);
    var hour12 = hour24 % 12;

    var hourDeg = (hour12 + minute / 60) * 30;
    var minDeg = (minute + second / 60) * 6;
    var secDeg = second * 6;

    refs.hour.setAttribute("transform", "rotate(" + hourDeg + " 50 50)");
    refs.minute.setAttribute("transform", "rotate(" + minDeg + " 50 50)");
    refs.second.setAttribute("transform", "rotate(" + secDeg + " 50 50)");
  }

  function tick() {
    var now = new Date();
    var localParts = getZonedParts(LOCAL_TZ, now);

    heroTimeEl.textContent = formatTime(localParts);
    heroDateEl.textContent = localParts.weekday + ", " + localParts.month + "/" + localParts.day + "/" + localParts.year;
    heroZoneEl.textContent = tzShortName(LOCAL_TZ) + " · " + (localParts.timeZoneName || "");

    if (!heroClockRefs) {
      var heroFace = document.querySelector(".hero__clock");
      if (heroFace && heroFace.children.length === 0) {
        var built = buildClockFace("clock-face--hero");
        heroClockRefs = built;
        heroFace.appendChild(built.svg);
      }
    }
    if (heroClockRefs) {
      applyHands(heroClockRefs, localParts);
    }

    cities.forEach(function (city) {
      var parts = getZonedParts(city.tz, now);

      if (city.refs) {
        applyHands(city.refs, parts);
        city.refs.digital.textContent = formatTime(parts);
        city.refs.offset.textContent = parts.timeZoneName || "";
        var label = dayDiffLabel(parts, localParts);
        if (label) {
          city.refs.badge.hidden = false;
          city.refs.badge.textContent = label;
        } else {
          city.refs.badge.hidden = true;
        }
      }

      if (city.timelineRefs) {
        var h = Number(parts.hour) % 24;
        var m = Number(parts.minute);
        var s = Number(parts.second);
        var dayFraction = (h * 3600 + m * 60 + s) / 86400;
        city.timelineRefs.nowLine.style.left = (dayFraction * 100) + "%";

        var displayHour12 = h % 12;
        if (displayHour12 === 0) displayHour12 = 12;
        var suffix = h >= 12 ? "PM" : "AM";
        var minuteStr = m < 10 ? "0" + m : String(m);
        city.timelineRefs.hourLabel.textContent = displayHour12 + ":" + minuteStr + " " + suffix;
      }
    });
  }

  addForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var tz = citySelect.value;
    if (!tz) return;
    var entry = CITY_LIBRARY.filter(function (c) { return c.tz === tz; })[0];
    if (!entry) return;
    cities.push({ tz: entry.tz, name: entry.name, refs: null, timelineRefs: null });
    rebuildBoard();
  });

  clockGrid.addEventListener("click", function (e) {
    var target = e.target.closest("[data-remove]");
    if (!target) return;
    var tz = target.dataset.remove;
    cities = cities.filter(function (c) { return c.tz !== tz; });
    rebuildBoard();
  });

  rebuildBoard();
  setInterval(tick, 1000);
})();
