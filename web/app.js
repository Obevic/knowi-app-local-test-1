(function () {
  "use strict";

  var svg = document.querySelector(".dial");
  var ticksGroup = document.getElementById("ticks");
  var hourHand = document.getElementById("hourHand");
  var minuteHand = document.getElementById("minuteHand");
  var secondHand = document.getElementById("secondHand");
  var digitalTime = document.getElementById("digitalTime");
  var meridiemEl = document.getElementById("meridiem");
  var dateLine = document.getElementById("dateLine");
  var tzNameEl = document.getElementById("tzName");
  var utcOffsetEl = document.getElementById("utcOffset");
  var toggle = document.getElementById("formatToggle");

  var use24Hour = false;

  function buildTicks() {
    var cx = 150, cy = 150, outer = 132, minorInner = 122, majorInner = 110;
    var ns = "http://www.w3.org/2000/svg";
    for (var i = 0; i < 60; i++) {
      var angle = (i * 6) * (Math.PI / 180);
      var isMajor = i % 5 === 0;
      var inner = isMajor ? majorInner : minorInner;
      var x1 = cx + outer * Math.sin(angle);
      var y1 = cy - outer * Math.cos(angle);
      var x2 = cx + inner * Math.sin(angle);
      var y2 = cy - inner * Math.cos(angle);
      var line = document.createElementNS(ns, "line");
      line.setAttribute("x1", x1.toFixed(2));
      line.setAttribute("y1", y1.toFixed(2));
      line.setAttribute("x2", x2.toFixed(2));
      line.setAttribute("y2", y2.toFixed(2));
      line.setAttribute("class", isMajor ? "dial__tick dial__tick--major" : "dial__tick");
      ticksGroup.appendChild(line);
    }
  }

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function formatOffset(minutesOffset) {
    var sign = minutesOffset > 0 ? "-" : "+";
    var abs = Math.abs(minutesOffset);
    var hh = pad(Math.floor(abs / 60));
    var mm = pad(abs % 60);
    return "UTC" + sign + hh + ":" + mm;
  }

  function render() {
    var now = new Date();
    var hours = now.getHours();
    var minutes = now.getMinutes();
    var seconds = now.getSeconds();

    var hourDeg = ((hours % 12) + minutes / 60) * 30;
    var minuteDeg = (minutes + seconds / 60) * 6;
    var secondDeg = seconds * 6;

    hourHand.style.transform = "rotate(" + hourDeg + "deg)";
    minuteHand.style.transform = "rotate(" + minuteDeg + "deg)";
    secondHand.style.transform = "rotate(" + secondDeg + "deg)";

    if (use24Hour) {
      digitalTime.textContent = pad(hours) + ":" + pad(minutes) + ":" + pad(seconds);
      meridiemEl.textContent = "";
    } else {
      var h12 = hours % 12;
      if (h12 === 0) h12 = 12;
      digitalTime.textContent = pad(h12) + ":" + pad(minutes) + ":" + pad(seconds);
      meridiemEl.textContent = hours >= 12 ? "PM" : "AM";
    }

    dateLine.textContent = new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric"
    }).format(now);

    tzNameEl.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time";
    utcOffsetEl.textContent = formatOffset(now.getTimezoneOffset());
  }

  function toggleFormat() {
    use24Hour = !use24Hour;
    toggle.setAttribute("aria-checked", use24Hour ? "true" : "false");
    render();
  }

  toggle.addEventListener("click", toggleFormat);
  toggle.addEventListener("keydown", function (event) {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      toggleFormat();
    }
  });

  buildTicks();
  render();
  setInterval(render, 1000);
})();
