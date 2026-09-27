import { formatMinutes, toMinutes } from "./time.js";
import { plainText } from "./labels.js";
import { initialPreview, previewOnDay, previewPosition, stepPreview } from "./preview.js";

function dateLabel(date) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = ["日", "一", "二", "三", "四", "五", "六"][new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}（${weekday}）`;
}

// Mounted only after the itinerary loads. Before that, the compact entry stays disabled.
export function setupPreview({ itinerary, readClock, selectedDay, change }) {
  if (!itinerary?.days?.length) return null;
  const ids = ["preview-banner", "preview-date", "preview-time", "preview-exit", "preview-dock", "preview-launcher", "preview-toggle", "preview-controls", "preview-days", "preview-slider", "preview-markers", "preview-fill", "preview-start", "preview-end", "preview-position", "preview-outside", "preview-previous", "preview-next", "preview-exact", "preview-form", "preview-input", "preview-input-label", "preview-input-hint", "preview-input-error", "preview-status"];
  const elements = Object.fromEntries(ids.map((id) => [id.replace("preview-", ""), document.getElementById(id)]));
  const e = elements;
  let markerDay = -1;
  let shownClock = null;

  function measure() {
    document.documentElement.style.setProperty("--preview-header-height", `${e.banner.hidden ? 0 : e.banner.offsetHeight}px`);
    document.documentElement.style.setProperty("--preview-dock-height", `${e.dock.offsetHeight}px`);
  }

  function speak() {
    const { now } = readClock();
    const { day, index } = previewPosition(itinerary, now);
    e.status.textContent = `預覽 ${dateLabel(now.date)} ${formatMinutes(now.minutes)}${day && index >= 0 ? `，${plainText(day.stops[index].title)}` : ""}`;
  }

  function choose(now, { announce = true } = {}) {
    if (!now) return;
    change(now);
    window.scrollTo({ top: 0, behavior: "instant" });
    if (announce) speak();
  }

  function exit() {
    e.exact.open = false;
    e.status.textContent = "已回到現在，依紐約時間顯示行程";
    change(null);
    document.getElementById("cards").focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  // Create native buttons once; patch selection instead of replacing the focused button.
  e.days.innerHTML = itinerary.days.map((day, index) => `<button type="button" data-day="${index}" aria-pressed="false"><span class="tab-act">DAY ${index + 1}</span><span class="tab-date">${dateLabel(day.date)}</span></button>`).join("");
  e.toggle.disabled = false;
  e.toggle.removeAttribute("title");
  e.toggle.addEventListener("click", () => {
    choose(initialPreview(itinerary, readClock().now, selectedDay()));
    e.slider.focus({ preventScroll: true });
  });
  e.exit.addEventListener("click", exit);
  e.days.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-day]");
    if (button) choose(previewOnDay(itinerary, Number(button.dataset.day), readClock().now.minutes));
  });
  e.slider.addEventListener("input", () => {
    const { dayIndex } = previewPosition(itinerary, readClock().now);
    choose(previewOnDay(itinerary, dayIndex, Number(e.slider.value)), { announce: false });
  });
  e.slider.addEventListener("change", speak);
  for (const [button, direction] of [[e.previous, -1], [e.next, 1]]) button.addEventListener("click", () => {
    choose(stepPreview(itinerary, readClock().now, direction));
    // Reaching an endpoint disables this button; leave keyboard focus on a usable control.
    if (button.disabled) e.slider.focus({ preventScroll: true });
  });
  e.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const { dayIndex, bounds } = previewPosition(itinerary, readClock().now);
    const minutes = /^([01]\d|2[0-3]):[0-5]\d$/.test(e.input.value) ? toMinutes(e.input.value) : NaN;
    if (!bounds || !Number.isFinite(minutes) || minutes < bounds.min || minutes > bounds.max) {
      e["input-error"].hidden = false;
      e["input-error"].textContent = bounds ? `請輸入 ${formatMinutes(bounds.min)} 到 ${formatMinutes(bounds.max)} 之間的時間。` : "請先選擇行程日期。";
      return;
    }
    e.exact.open = false;
    choose(previewOnDay(itinerary, dayIndex, minutes));
    e.slider.focus({ preventScroll: true });
  });
  for (const region of [e.banner, e.controls]) region.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); exit(); }
  });
  const observer = new ResizeObserver(measure);
  observer.observe(e.banner);
  observer.observe(e.dock);

  return {
    render(now, isPreview) {
      document.body.dataset.preview = String(isPreview);
      e.banner.hidden = !isPreview;
      e.controls.hidden = !isPreview;
      e.launcher.hidden = isPreview;
      e.toggle.setAttribute("aria-expanded", String(isPreview));
      if (!isPreview) { shownClock = null; measure(); return; }
      const { day, dayIndex, index, bounds, outside } = previewPosition(itinerary, now);
      e.date.textContent = dateLabel(now.date);
      e.time.textContent = formatMinutes(now.minutes);
      e.time.dateTime = `${now.date}T${formatMinutes(now.minutes)}`;
      for (const button of e.days.querySelectorAll("button")) {
        const selected = Number(button.dataset.day) === dayIndex;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", String(selected));
      }
      e.outside.hidden = !outside;
      e.outside.textContent = day ? "目前在行程時段外；拖動時間可回到當天行程。" : "目前不在行程日期內；選一天繼續預覽。";
      e.slider.disabled = !day;
      e.input.disabled = !day;
      e.form.querySelector("button").disabled = !day;
      e.previous.disabled = !day || index <= 0;
      e.next.disabled = !day || index >= day.stops.length - 1;
      if (markerDay !== dayIndex) {
        markerDay = dayIndex;
        e.markers.innerHTML = day ? day.stops.map((stop) => `<span class="preview-marker${stop.booked ? " is-booked" : ""}" style="left:${(toMinutes(stop.start) - bounds.min) / (bounds.max - bounds.min || 1) * 100}%"></span>`).join("") : "";
      }
      e.position.textContent = day ? (index >= 0 ? `第 ${index + 1} / ${day.stops.length} 站` : "第一站尚未開始") : "選擇日期";
      const value = day ? previewOnDay(itinerary, dayIndex, now.minutes).minutes : 0;
      e.slider.min = bounds?.min ?? 0;
      e.slider.max = bounds?.max ?? 1439;
      e.slider.value = value;
      e.slider.setAttribute("aria-valuetext", day ? `${formatMinutes(value)}${outside ? "，拖動以回到當天行程時段" : `，${plainText(day.stops[index].title)}`}` : "請先選擇日期");
      e.fill.style.width = bounds ? `${(value - bounds.min) / (bounds.max - bounds.min || 1) * 100}%` : "0%";
      e.start.textContent = bounds ? formatMinutes(bounds.min) : "—";
      e.end.textContent = bounds ? formatMinutes(bounds.max) : "—";
      const clockKey = `${now.date}|${now.minutes}`;
      // A clock tick must not overwrite an exact time the reader is still typing.
      if (shownClock !== clockKey) {
        shownClock = clockKey;
        e.input.value = formatMinutes(value);
        e["input-error"].hidden = true;
      }
      e.input.min = bounds ? formatMinutes(bounds.min) : "00:00";
      e.input.max = bounds ? formatMinutes(bounds.max) : "23:59";
      e["input-label"].textContent = day ? `${dateLabel(day.date)} 的時間（紐約）` : "確切時間（紐約）";
      e["input-hint"].textContent = bounds ? `可選 ${formatMinutes(bounds.min)}–${formatMinutes(bounds.max)}；換日期請用上方 DAY 按鈕。` : "請先選擇行程日期。";
      measure();
    },
  };
}
