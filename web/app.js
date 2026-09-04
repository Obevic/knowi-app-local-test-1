function pad(value) {
  return String(value).padStart(2, "0");
}

const hoursEl = document.getElementById("hours");
const minutesEl = document.getElementById("minutes");
const secondsEl = document.getElementById("seconds");
const dateLineEl = document.getElementById("dateLine");
const percentValueEl = document.getElementById("percentValue");
const progressFillEl = document.getElementById("progressFill");
const progressMarkerEl = document.getElementById("progressMarker");
const liveRegionEl = document.getElementById("liveRegion");

let lastAnnouncedMinute = null;

function tick() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();

  hoursEl.textContent = pad(hours);
  minutesEl.textContent = pad(minutes);
  secondsEl.textContent = pad(seconds);

  const weekday = now.toLocaleDateString(undefined, { weekday: "long" });
  const monthDay = now.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
  dateLineEl.textContent = `${weekday}, ${monthDay}`;

  const secondsIntoDay = hours * 3600 + minutes * 60 + seconds;
  const percent = (secondsIntoDay / 86400) * 100;
  const percentText = percent.toFixed(1);

  percentValueEl.textContent = percentText;
  progressFillEl.style.width = `${percent}%`;
  progressMarkerEl.style.left = `${percent}%`;

  if (minutes !== lastAnnouncedMinute) {
    lastAnnouncedMinute = minutes;
    const spoken = now.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit"
    });
    liveRegionEl.textContent = `It's ${spoken}. ${percentText} percent of today has passed.`;
  }
}

tick();
setInterval(tick, 1000);
