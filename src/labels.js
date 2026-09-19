const DEADLINE_VISIBLE_MINUTES = 120;
const WARNING_MINUTES = 15;
// How long the call insists "leave now" before it stops guessing and calls the arrival instead.
const ALERT_GRACE_MINUTES = 5;
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

// A booked stop is a different kind of thing from a suggestion. A call is hard, and floods the band,
// only when missing it costs a booking: the very next stop is booked. A booking further down the day
// is the tape strip's job, so the call never contradicts it.
function isHard(state) {
  return Boolean(state.next?.booked) && !state.nextIsTomorrow;
}

// What the call at the top of the sheet says. It is a warning system, not a stop/go sign, and it only has
// a clock: it never knows where we are. So it claims "leave now" for a few minutes at leave-by and then
// stops guessing: it calls the time we must ARRIVE, which is true whether or not we have left.
// `cue` is idle, hold, warning, alert, transit or done. There are no signage words. `hard` says whether
// the band floods; the arrival call never does, because in transit the clock cannot tell late from on time.
export function callSheet(state) {
  const sheet = callFor(state);
  const floods = sheet.cue === "warning" || sheet.cue === "alert";
  const hard = floods && (sheet.certain || isHard(state));
  return { cue: sheet.cue, hard, big: sheet.big, tail: sheet.tail, detail: sheet.detail };
}

function callFor(state) {
  switch (state.status) {
    case "day-not-started": {
      if (state.phase === "before") {
        return { cue: "idle", big: String(state.daysToGo), tail: "天後出發", detail: `第一站 ${state.next.start} ${state.next.title}` };
      }
      // The first stop of a day is the departure itself. Warn only when a booking depends on leaving on time.
      const bookingDepends = Boolean(state.deadline) && state.deadline.minutesUntil <= WARNING_MINUTES;
      if (bookingDepends && state.minutesToNext <= WARNING_MINUTES) {
        return { cue: "warning", certain: true, big: state.next.start, tail: "準備出發", detail: `還有 ${formatDuration(state.minutesToNext)}` };
      }
      return { cue: "idle", big: state.next.start, tail: "出發", detail: "今天還沒開始" };
    }
    case "at-stop": {
      const inFlight = state.current.kind === "flight";
      const nextIsFlight = state.next?.kind === "flight";
      // Boarding is the airline's call, not this sheet's: waiting for a flight never warns.
      const isWarning = !inFlight && !nextIsFlight && state.minutesToLeave <= WARNING_MINUTES;
      const calmTail = inFlight ? "落地" : nextIsFlight ? "起飛" : "前離開";
      return {
        cue: isWarning ? "warning" : "hold",
        big: state.leaveBy,
        tail: isWarning ? "準備離開" : calmTail,
        detail: `還有 ${formatDuration(state.minutesToLeave)}`,
      };
    }
    case "should-leave": {
      // Past the arrive-by time we may already be seated; the clock cannot tell. State the fact, do not flood.
      if (state.minutesToArrive < 0) {
        return { cue: "transit", big: state.arriveBy, tail: "該到了", detail: `已超過 ${formatDuration(state.minutesToArrive)}` };
      }
      if (-state.minutesToLeave < ALERT_GRACE_MINUTES) {
        return {
          cue: "alert",
          big: state.leaveBy,
          tail: "該出發了",
          detail: state.minutesToLeave === 0 ? "現在出發" : `已超過 ${formatDuration(state.minutesToLeave)}`,
        };
      }
      return { cue: "transit", big: state.arriveBy, tail: "前到下一站", detail: `還有 ${formatDuration(state.minutesToArrive)}` };
    }
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
