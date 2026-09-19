const DEADLINE_VISIBLE_MINUTES = 120;
const WARNING_MINUTES = 15;
const PRESSING_MINUTES = 60;
const MODE_LABELS = { walk: "走路", transit: "大眾運輸", drive: "叫車" };

export function formatDuration(minutes) {
  const total = Math.abs(minutes);
  if (total < 60) return `${total} 分`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours} 小時` : `${hours} 小時 ${rest} 分`;
}

export function legLine(leg) {
  const line = `${MODE_LABELS[leg.mode]} 約 ${formatDuration(leg.minutes)}`;
  return leg.untested ? `${line}（未實測）` : line;
}

// A booked stop is a different kind of thing from a suggestion. A call is hard when missing it
// costs a booking: the next stop is booked, or a booking's departure is within the hour.
function isHard(state) {
  if (state.next?.booked && !state.nextIsTomorrow) return true;
  return Boolean(state.deadline) && state.deadline.minutesUntil <= PRESSING_MINUTES;
}

// What the call at the top of the sheet says. It is a warning system, not a stop/go sign:
// `cue` is idle (nothing to call), hold (time to spare), warning (leave within fifteen minutes),
// alert (leave now) or done. There are no signage words; the flood is the signal. `hard` says
// whether the band floods at all: only when missing the call would cost a booking.
export function callSheet(state) {
  const sheet = callFor(state);
  const hard = (sheet.cue === "warning" || sheet.cue === "alert") && isHard(state);
  return { cue: sheet.cue, hard, big: sheet.big, tail: sheet.tail, detail: sheet.detail };
}

function callFor(state) {
  switch (state.status) {
    case "day-not-started":
      if (state.phase === "before") {
        return { cue: "idle", big: String(state.daysToGo), tail: "天後出發", detail: `第一站 ${state.next.start} ${state.next.title}` };
      }
      return { cue: "idle", big: state.next.start, tail: "出發", detail: "今天還沒開始" };
    case "at-stop": {
      const inFlight = state.current.kind === "flight";
      const isWarning = !inFlight && state.minutesToLeave <= WARNING_MINUTES;
      return {
        cue: isWarning ? "warning" : "hold",
        big: state.leaveBy,
        tail: inFlight ? "落地" : "前離開",
        detail: `還有 ${formatDuration(state.minutesToLeave)}`,
      };
    }
    case "should-leave":
      return {
        cue: "alert",
        big: state.leaveBy,
        tail: "該出發了",
        detail: state.minutesToLeave === 0 ? "現在出發" : `已超過 ${formatDuration(state.minutesToLeave)}`,
      };
    case "day-done":
      if (state.nextIsTomorrow) {
        return { cue: "done", big: state.next.start, tail: "明天出發", detail: "今天行程結束" };
      }
      return { cue: "done", big: "散場", tail: "", detail: "旅程結束" };
    default:
      throw new Error(`Unknown status: ${state.status}`);
  }
}

// A booked stop many hours away is noise; the strip appears once it is actionable.
export function isDeadlineVisible(deadline) {
  return deadline !== null && deadline.minutesUntil <= DEADLINE_VISIBLE_MINUTES;
}

export function deadlineLine(deadline) {
  const { stop, leaveBy, minutesUntil, severity } = deadline;
  if (severity === "late") return `${stop.title}：已超過出發時間 ${formatDuration(minutesUntil)}（原訂 ${leaveBy}）`;
  return `${stop.title}：${leaveBy} 前出發，還有 ${formatDuration(minutesUntil)}`;
}

// Notion titles carry emoji; the sheet is set in one ink, so they are dropped for display only.
export function plainText(text) {
  return text.replace(/\p{Extended_Pictographic}\uFE0F?/gu, "").replace(/\s{2,}/g, " ").trim();
}
