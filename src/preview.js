import { formatMinutes, toMinutes } from "./time.js";

export function previewBounds(day) {
  if (!day?.stops?.length) return null;
  return { min: toMinutes(day.stops[0].start), max: toMinutes(day.stops.at(-1).start) };
}

export function previewOnDay(itinerary, dayIndex, minutes) {
  const day = itinerary?.days?.[dayIndex];
  const bounds = previewBounds(day);
  if (!bounds || !Number.isFinite(minutes)) return null;
  return { date: day.date, minutes: Math.max(bounds.min, Math.min(bounds.max, Math.round(minutes))) };
}

// Rehearsal starts at the first stop before the trip, the last stop after it, or today's clock.
// A day selected in the running order takes precedence when opening the controls.
export function initialPreview(itinerary, now, selectedDay = null) {
  const days = itinerary?.days;
  if (!days?.length) return null;
  if (selectedDay !== null) return previewOnDay(itinerary, selectedDay, now.minutes);
  if (now.date < days[0].date) return previewOnDay(itinerary, 0, 0);
  if (now.date > days.at(-1).date) return previewOnDay(itinerary, days.length - 1, 1439);
  return previewOnDay(itinerary, days.findIndex((day) => day.date === now.date), now.minutes);
}

export function previewPosition(itinerary, now) {
  const dayIndex = itinerary?.days?.findIndex((day) => day.date === now.date) ?? -1;
  const day = itinerary?.days?.[dayIndex];
  const bounds = previewBounds(day);
  if (!bounds) return { dayIndex: -1, day: null, bounds: null, index: -1, outside: true };
  const index = day.stops.reduce((found, stop, i) => toMinutes(stop.start) <= now.minutes ? i : found, -1);
  return { dayIndex, day, bounds, index, outside: now.minutes < bounds.min || now.minutes > bounds.max };
}

export function stepPreview(itinerary, now, direction) {
  const { day, index } = previewPosition(itinerary, now);
  if (!day || ![-1, 1].includes(direction)) return null;
  const target = Math.max(0, Math.min(day.stops.length - 1, index + direction));
  return { date: day.date, minutes: toMinutes(day.stops[target].start) };
}

// Only change the preview parameter: local ?sw testing and any fragment must survive.
export function previewUrl(href, now) {
  const url = new URL(href);
  if (now) url.searchParams.set("at", `${now.date}T${formatMinutes(now.minutes)}`);
  else url.searchParams.delete("at");
  return url;
}
