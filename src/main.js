import { toNewYork, parseAt } from "./time.js";
import { computeState } from "./schedule.js";
import { renderPreviewBanner, renderCall, renderStrip, renderCards, renderPull, renderTabs, renderTimeline, renderError } from "./render.js";

const DATA_URL = "data/itinerary.json";
const NOTION_URL = "https://app.notion.com/p/3dabc029903e81b485cfee217af07c64";
const TICK_MS = 30_000;

// The call condenses once the reader scrolls into the day, and opens out again near the top.
// Two thresholds, so the height change it causes cannot flip it straight back.
const COMPACT_AFTER_PX = 180;
const EXPAND_BEFORE_PX = 40;

// The browser chrome floods with the call band. Keep in step with the custom properties in styles.css.
const BAND_COLORS = { warning: "#ffd400", alert: "#c81e1e" };
const GROUND = { light: "#ffffff", dark: "#0d0d0d" };

const els = {
  banner: document.getElementById("preview-banner"),
  call: document.getElementById("call"),
  strip: document.getElementById("strip"),
  cards: document.getElementById("cards"),
  pull: document.getElementById("pull"),
  order: document.getElementById("order"),
  tabs: document.getElementById("tabs"),
  timeline: document.getElementById("timeline"),
  previewToggle: document.getElementById("preview-toggle"),
  previewInput: document.getElementById("preview-input"),
  themeColor: document.querySelector('meta[name="theme-color"]'),
};

// Must match the wide-screen media query in styles.css, in rem so both follow the reader's font size.
const wideLayout = matchMedia("(min-width: 60rem)");
const darkScheme = matchMedia("(prefers-color-scheme: dark)");

let itinerary = null;
let standIns = new Set();
let selectedDay = null; // null follows today
let orderOpen = false;
let timelineKey = null;

function readClock() {
  const preview = parseAt(location.search);
  return { now: preview ?? toNewYork(new Date()), isPreview: preview !== null };
}

function dayPositionOf(state, dayIndex) {
  if (state.phase === "before") return "future";
  if (state.phase === "after") return "past";
  if (dayIndex < state.dayIndex) return "past";
  return dayIndex === state.dayIndex ? "today" : "future";
}

function applyCall({ cue, hard }) {
  document.body.dataset.cue = cue;
  document.body.dataset.hard = String(hard);
  els.themeColor.content = (hard && BAND_COLORS[cue]) || (darkScheme.matches ? GROUND.dark : GROUND.light);
}

// On a wide screen the order sits beside the call and is always deployed; on a phone it folds away.
function applyOrderState(day) {
  const isOpen = orderOpen || wideLayout.matches;
  els.order.classList.toggle("is-open", isOpen);
  els.order.inert = !isOpen;
  renderPull(els.pull, day, orderOpen);
}

function render() {
  const { now, isPreview } = readClock();
  const state = computeState(itinerary, now);
  const shownDay = selectedDay ?? state.dayIndex;
  const day = itinerary.days[shownDay];

  renderPreviewBanner(els.banner, now, isPreview);
  applyCall(renderCall(els.call, state));
  renderStrip(els.strip, state);
  renderCards(els.cards, state, standIns);
  applyOrderState(day);

  // Rebuild the order only when it would look different, so open cues stay open between ticks.
  const key = [shownDay, state.phase, state.dayIndex, state.current?.id ?? ""].join("|");
  if (key === timelineKey) return;
  timelineKey = key;
  renderTabs(els.tabs, itinerary.days, shownDay, state.phase === "during" ? state.dayIndex : null);
  renderTimeline(els.timeline, day, { dayPosition: dayPositionOf(state, shownDay), currentId: state.current?.id ?? null, standIns });
}

function updateCompact() {
  const isCompact = document.body.classList.contains("is-compact");
  if (!isCompact && scrollY > COMPACT_AFTER_PX) document.body.classList.add("is-compact");
  else if (isCompact && scrollY < EXPAND_BEFORE_PX) document.body.classList.remove("is-compact");
}

function setPreview(value) {
  const url = new URL(location.href);
  if (value) url.searchParams.set("at", value);
  else url.searchParams.delete("at");
  history.replaceState(null, "", url);
  selectedDay = null;
  render();
}

els.pull.addEventListener("click", () => {
  orderOpen = !orderOpen;
  render();
  if (orderOpen) els.order.querySelector(".cue.is-current")?.scrollIntoView({ block: "center", behavior: "smooth" });
});

els.tabs.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-day]");
  if (!button) return;
  selectedDay = Number(button.dataset.day);
  render();
});

els.previewToggle.addEventListener("click", () => {
  els.previewInput.hidden = !els.previewInput.hidden;
  if (!els.previewInput.hidden) els.previewInput.focus();
});

els.previewInput.addEventListener("change", () => setPreview(els.previewInput.value));

els.banner.addEventListener("click", (event) => {
  if (event.target.id !== "preview-exit") return;
  els.previewInput.value = "";
  els.previewInput.hidden = true;
  setPreview(null);
});

async function start() {
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status} loading ${DATA_URL}`);
    itinerary = await response.json();
    standIns = new Set(itinerary.trip.standInPhotos ?? []);
  } catch (error) {
    console.error("Failed to load itinerary", error);
    document.body.dataset.cue = "error";
    renderError(els.cards, NOTION_URL);
    return;
  }
  render();
  setInterval(render, TICK_MS);
  addEventListener("scroll", updateCompact, { passive: true });
  wideLayout.addEventListener("change", render);
  darkScheme.addEventListener("change", render);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) render();
  });
}

start();

// The worker serves code cache-first, which is right on a phone and wrong while developing: on localhost
// it would keep showing stale files. It stays off there unless the URL asks for it with ?sw, to test offline.
const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
const wantsWorker = !isLocal || new URLSearchParams(location.search).has("sw");

if ("serviceWorker" in navigator && wantsWorker) {
  navigator.serviceWorker.register("sw.js").catch((error) => console.error("Service worker registration failed", error));
}
