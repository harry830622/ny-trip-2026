import { formatMinutes } from "./time.js";
import { leaveByMinutes } from "./schedule.js";
import { legLine, callSheet, deadlineLine, isDeadlineVisible, plainText } from "./labels.js";

// One-character department codes, the way a running order marks who a cue belongs to.
const KIND_CODES = { home: "家", flight: "飛", transit: "車", hotel: "宿", food: "食", sight: "景", shop: "買", free: "閒" };
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

// One stroke weight, one cap, one 24-unit grid for every icon on the sheet.
const ICON_PATHS = {
  walk: '<circle cx="13" cy="4.5" r="1.75"/><path d="M9 21l3-7-2.5-2.5L11 8l3 2.5 3 1M12 14l3 2 1 5M11 8l-3.5 2-1 3.5"/>',
  transit: '<rect x="5" y="3" width="14" height="14" rx="2.5"/><path d="M5 11h14M8.5 21l1.5-4M15.5 21L14 17M9 14h.01M15 14h.01"/>',
  drive: '<path d="M4 16v-3.5l2-5.5h12l2 5.5V16M4 16h16M4 16v2.5M20 16v2.5M6.5 12.5h11M8 16h.01M16 16h.01"/>',
  pin: '<path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 10-13 0c0 5.4 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.25"/>',
  arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
};

// Writing identical markup would collapse anything the reader has unfolded, so unchanged blocks are left alone.
const lastHtml = new WeakMap();

function setHtml(el, html) {
  if (lastHtml.get(el) === html) return;
  lastHtml.set(el, html);
  el.innerHTML = html;
}

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (character) => ESCAPES[character]);
}

function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICON_PATHS[name]}</svg>`;
}

function link(url, html, className = "") {
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="${className}">${html}</a>`;
}

// A stand-in is never passed off as the venue: it carries a 示意 mark wherever it appears.
// The wrapper keeps its size and ground when the image is missing, so the sheet never reflows.
function plate(stop, className, standIns) {
  const mark = standIns.has(stop.photo) ? '<span class="stand-in">示意</span>' : "";
  return `<div class="plate ${className}"><img src="${escapeHtml(stop.photo)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">${mark}</div>`;
}

function title(stop) {
  return escapeHtml(plainText(stop.title));
}

function bookedTag(stop) {
  return stop.booked ? '<span class="tape">已訂</span>' : "";
}

// The weekday sits in brackets because a bare 一 (Monday) reads as a dash.
function dateLabel(date) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}（${weekday}）`;
}

export function renderPreviewBanner(el, now, isPreview) {
  el.hidden = !isPreview;
  setHtml(el, isPreview
    ? `<p><strong>排練</strong>${dateLabel(now.date)} ${formatMinutes(now.minutes)}</p><button type="button" id="preview-exit">回到現在</button>`
    : "");
}

// Returns the call so the caller can flood the band and the browser chrome to match.
export function renderCall(el, state) {
  const sheet = callSheet(state);
  const isNumeral = /^[\d:]+$/.test(sheet.big);
  setHtml(el, `
    <p class="call-big ${isNumeral ? "is-numeral" : "is-word"}">${escapeHtml(sheet.big)}</p>
    <div class="call-line">
      <span class="call-tail">${escapeHtml(sheet.tail)}</span>
      <span class="call-detail">${escapeHtml(plainText(sheet.detail))}</span>
    </div>`);
  return sheet;
}

function tapeStrip(state) {
  const { deadline, next, nextIsTomorrow } = state;
  if (!isDeadlineVisible(deadline)) return "";
  // Before the day's first departure the call itself carries this deadline; the strip would only repeat it.
  if (state.status === "day-not-started" && state.minutesToNext === deadline.minutesUntil) return "";
  // When the booked stop is simply what comes next, the call and the next cue already say it.
  if (!nextIsTomorrow && next && next.id === deadline.stop.id) return "";
  return `<p class="tape-strip ${deadline.severity === "late" ? "is-late" : ""}"><span class="tape-strip-label">已訂</span>${escapeHtml(plainText(deadlineLine(deadline)))}</p>`;
}

export function renderStrip(el, state) {
  setHtml(el, tapeStrip(state));
}

// How long comes first because that is what gets read; the route is the supporting line.
function legInner(leg) {
  return `${icon(leg.mode)}<span><strong>${escapeHtml(legLine(leg))}</strong>${leg.label ? `<span class="leg-route">${escapeHtml(leg.label)}</span>` : ""}</span>`;
}

// A list on the page folds to one line; on a shopping street it can run to fourteen items.
function pageLists(stop) {
  return (stop.lists ?? [])
    .map((list) => {
      const items = list.items
        .map((item) => {
          const name = item.mapUrl ? link(item.mapUrl, escapeHtml(item.title), "text-link") : escapeHtml(item.title);
          return `<li><strong>${name}</strong>${item.note ? `<span>${escapeHtml(item.note)}</span>` : ""}</li>`;
        })
        .join("");
      return `<details class="page-list"><summary><span>${escapeHtml(plainText(list.label))}</span><span class="pull-count">${list.items.length}</span>${icon("chevron")}</summary><ul class="backups-items">${items}</ul></details>`;
    })
    .join("");
}

// The page is the current stop: what it is and what to do there. It carries no times; the call does.
function nowBlock(state, standIns) {
  const { current } = state;
  if (!current) return "";
  return `
    <section class="now" aria-labelledby="now-title">
      ${plate(current, "plate-now", standIns)}
      <div class="page-body">
        <h2 id="now-title">${title(current)}${bookedTag(current)}</h2>
        ${current.notes ? `<p class="notes">${escapeHtml(current.notes)}</p>` : ""}
        ${current.mapUrl ? link(current.mapUrl, `${icon("pin")}地圖`, "text-link") : ""}
      </div>
      ${pageLists(current)}
    </section>`;
}

function nextBlock(state, standIns) {
  const { next, current } = state;
  if (!next) return "";
  const leg = state.nextIsTomorrow ? null : current?.leg ?? null;
  const navUrl = leg?.navUrl ?? next.mapUrl;
  const navLabel = leg?.navUrl ? "導航過去" : "看地圖";
  return `
    <section class="next" aria-labelledby="next-title">
      <div class="next-row">
        <div class="next-body">
          <h2 id="next-title"><span class="next-label">${state.nextIsTomorrow ? "明天" : "下一站"}</span>${title(next)}${bookedTag(next)}</h2>
          ${leg ? `<p class="leg">${legInner(leg)}</p>` : ""}
        </div>
        ${plate(next, "plate-thumb", standIns)}
      </div>
      ${navUrl ? link(navUrl, `<span>${navLabel}</span>${icon("arrow")}`, "slab") : ""}
    </section>`;
}

export function renderCards(el, state, standIns) {
  setHtml(el, nowBlock(state, standIns) + nextBlock(state, standIns));
}

export function renderPull(el, day, isOpen) {
  el.setAttribute("aria-expanded", String(isOpen));
  setHtml(el, `<span>${isOpen ? "收起流程" : "整天流程"}</span><span class="pull-count">${day.stops.length} 站</span>${icon("chevron")}`);
}

export function renderTabs(el, days, shownDay, todayIndex) {
  el.innerHTML = days
    .map((day, index) => {
      const isToday = index === todayIndex;
      const classes = [index === shownDay ? "is-selected" : "", isToday ? "is-today" : ""].join(" ").trim();
      return `<button type="button" data-day="${index}" class="${classes}" aria-pressed="${index === shownDay}"${isToday ? ' aria-current="date"' : ""}><span class="tab-act">Day ${index + 1}</span><span class="tab-date">${isToday ? "今天" : dateLabel(day.date)}</span></button>`;
    })
    .join("");
}

// A stop can carry several lists: backups for a long queue, shops along the way, Jellycat stockists.
function listsBlock(stop) {
  return (stop.lists ?? [])
    .map((list) => {
      const items = list.items
        .map((item) => {
          const name = item.mapUrl ? link(item.mapUrl, escapeHtml(item.title), "text-link") : escapeHtml(item.title);
          return `<li><strong>${name}</strong>${item.note ? `<span>${escapeHtml(item.note)}</span>` : ""}</li>`;
        })
        .join("");
      return `<div class="backups"><h3>${escapeHtml(plainText(list.label))}</h3><ul>${items}</ul></div>`;
    })
    .join("");
}

function legBlock(leg) {
  if (!leg) return "";
  return leg.navUrl ? link(leg.navUrl, legInner(leg), "leg leg-link") : `<p class="leg">${legInner(leg)}</p>`;
}

// The out time: when this cue is left, read down the time column without unfolding anything.
function outTime(stop, nextStop) {
  const minutes = leaveByMinutes(stop, nextStop);
  if (minutes === null) return "";
  return `<span class="out">${stop.kind === "flight" ? "抵" : "離"} ${formatMinutes(minutes)}</span>`;
}

export function renderTimeline(el, day, { dayPosition, currentId, standIns }) {
  const currentIndex = day.stops.findIndex((stop) => stop.id === currentId);
  el.innerHTML = day.stops
    .map((stop, index) => {
      const isCurrent = dayPosition === "today" && index === currentIndex;
      const isPlayed = dayPosition === "past" || (dayPosition === "today" && index < currentIndex);
      const classes = ["cue", isCurrent ? "is-current" : "", isPlayed ? "is-played" : ""].join(" ").trim();
      return `
        <li class="${classes}">
          <details ${isCurrent ? "open" : ""}>
            <summary>
              <span class="cue-time"><span class="time">${stop.start}</span>${isPlayed || !stop.arriveBy ? "" : `<span class="out">到 ${stop.arriveBy}</span>`}${isPlayed ? "" : outTime(stop, day.stops[index + 1] ?? null)}</span>
              <span class="code" aria-hidden="true">${KIND_CODES[stop.kind]}</span>
              <span class="cue-title">${title(stop)}${bookedTag(stop)}</span>
              ${plate(stop, "plate-thumb", standIns)}
            </summary>
            <div class="cue-body">
              ${stop.notes ? `<p class="notes">${escapeHtml(stop.notes)}</p>` : ""}
              ${stop.leaveBy ? `<p class="leave-by">${icon("clock")}<span>${stop.leaveBy} 前離開</span></p>` : ""}
              ${stop.mapUrl ? link(stop.mapUrl, `${icon("pin")}地圖`, "text-link") : ""}
              ${legBlock(stop.leg)}
              ${listsBlock(stop)}
            </div>
          </details>
        </li>`;
    })
    .join("");
}

export function renderError(el, notionUrl) {
  el.innerHTML = `<section class="now"><div class="lead-row"><div class="lead-body"><h2>行程載入失敗</h2><p class="notes">請確認網路後重新整理，或直接看 ${link(notionUrl, "Notion 原稿", "text-link")}。</p></div></div></section>`;
}
