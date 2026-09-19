import { toMinutes, formatMinutes, daysBetween } from "./time.js";

const SOON_THRESHOLD_MINUTES = 15;

function arrivalTarget(stop) {
  return toMinutes(stop.arriveBy ?? stop.start);
}

// When we must leave `stop` to reach `nextStop` on time, in minutes since midnight.
export function leaveByMinutes(stop, nextStop) {
  if (stop.leaveBy) return toMinutes(stop.leaveBy);
  if (!nextStop) return null;
  const travel = stop.leg ? stop.leg.minutes : 0;
  return arrivalTarget(nextStop) - travel;
}

function severityFor(minutesUntil) {
  if (minutesUntil < 0) return "late";
  return minutesUntil <= SOON_THRESHOLD_MINUTES ? "soon" : "ok";
}

function findDeadline(stops, currentIndex, nowMinutes) {
  for (let index = currentIndex + 1; index < stops.length; index += 1) {
    const stop = stops[index];
    if (!stop.booked) continue;
    const leaveAt = index === 0 ? arrivalTarget(stop) : leaveByMinutes(stops[index - 1], stop);
    const minutesUntil = leaveAt - nowMinutes;
    return { stop, leaveBy: formatMinutes(leaveAt), minutesUntil, severity: severityFor(minutesUntil) };
  }
  return null;
}

const EMPTY = { daysToGo: null, current: null, next: null, nextIsTomorrow: false, leaveBy: null, minutesToLeave: null, deadline: null };

export function computeState(itinerary, now) {
  const { days } = itinerary;
  const firstDate = days[0].date;
  const lastDate = days[days.length - 1].date;

  if (now.date < firstDate) {
    return { ...EMPTY, phase: "before", dayIndex: 0, daysToGo: daysBetween(now.date, firstDate), next: days[0].stops[0], status: "day-not-started" };
  }
  if (now.date > lastDate) {
    return { ...EMPTY, phase: "after", dayIndex: days.length - 1, status: "day-done" };
  }

  const dayIndex = days.findIndex((day) => day.date === now.date);
  if (dayIndex === -1) throw new Error(`No itinerary day for ${now.date}`);

  const { stops } = days[dayIndex];
  let currentIndex = -1;
  stops.forEach((stop, index) => {
    if (toMinutes(stop.start) <= now.minutes) currentIndex = index;
  });

  const current = currentIndex >= 0 ? stops[currentIndex] : null;
  const nextToday = stops[currentIndex + 1] ?? null;
  const tomorrowFirst = days[dayIndex + 1]?.stops[0] ?? null;
  const base = {
    ...EMPTY,
    phase: "during",
    dayIndex,
    current,
    next: nextToday ?? tomorrowFirst,
    nextIsTomorrow: nextToday === null && tomorrowFirst !== null,
    deadline: findDeadline(stops, currentIndex, now.minutes),
  };

  if (!current) return { ...base, status: "day-not-started" };
  if (!nextToday) return { ...base, status: "day-done" };

  const leaveAt = leaveByMinutes(current, nextToday);
  return {
    ...base,
    leaveBy: formatMinutes(leaveAt),
    minutesToLeave: leaveAt - now.minutes,
    status: now.minutes >= leaveAt ? "should-leave" : "at-stop",
  };
}
