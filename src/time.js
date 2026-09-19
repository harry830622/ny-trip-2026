const NEW_YORK = "America/New_York";

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: NEW_YORK,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// A wall clock is { date: "YYYY-MM-DD", minutes: minutes since midnight }.
export function toNewYork(instant) {
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export function parseAt(search) {
  const value = new URLSearchParams(search).get("at");
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 23 || minutes > 59) return null;
  return { date: match[1], minutes: hours * 60 + minutes };
}

export function toMinutes(hhmm) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

export function formatMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function daysBetween(fromDate, toDate) {
  const toUtc = (date) => {
    const [year, month, day] = date.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(toDate) - toUtc(fromDate)) / 86_400_000);
}
