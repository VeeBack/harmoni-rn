// Parts of the day, as the web app's day-part.ts: the Daily Spice changes
// with them, and the library shows which part it's in. Pure, for bun test.

export interface Part {
  key: string;
  label: string;
  start: number; // local hour it begins
  end: number; // local hour it ends; past 24 for late night
}

export const PARTS: Part[] = [
  { key: "early-morning", label: "Early Morning", start: 4, end: 8 },
  { key: "morning", label: "Morning", start: 8, end: 12 },
  { key: "afternoon", label: "Afternoon", start: 12, end: 17 },
  { key: "evening", label: "Evening", start: 17, end: 22 },
  { key: "late-night", label: "Late Night", start: 22, end: 28 },
];

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The part of the day at `at` on this phone's clock: "Morning", or "Friday Night" at the weekend. */
export function dayPart(at: Date): { key: string; label: string; endsAt: Date } {
  const hour = at.getHours() + at.getMinutes() / 60;
  const h = hour < 4 ? hour + 24 : hour;
  const part = PARTS.find((p) => h >= p.start && h < p.end) ?? PARTS[0];
  // Late night belongs to the evening before it: 1am Saturday is still Friday night.
  const before = hour < 4 ? new Date(at.getTime() - 24 * 3600_000) : at;
  const weekday = DAYS[before.getDay()];
  const weekend = (weekday === "Friday" || weekday === "Saturday") && (part.key === "evening" || part.key === "late-night");
  return {
    key: part.key,
    label: weekend ? `${weekday} ${part.key === "evening" ? "Evening" : "Night"}` : part.label,
    endsAt: new Date(Math.round((at.getTime() + (part.end - h) * 3600_000) / 60_000) * 60_000),
  };
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** What the library calls someone's Daily Spice; the page has the full name. */
export const dailySpiceLabel = (name: string) => `${firstName(name)}'s Spice`;

/** "Morning" → "in the mornings", "Friday Night" → "on Friday nights". */
export function whenPhrase(part: string): string {
  const weekday = part.match(/^(\w+day) (\w+)$/);
  if (weekday) return `on ${weekday[1]} ${weekday[2].toLowerCase()}s`;
  if (part === "Late Night") return "late at night";
  return `in the ${part.toLowerCase()}s`;
}

/** "New Spice in 3h 12m". */
export function countdown(ms: number): string {
  if (ms <= 0) return "New Spice on the way";
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `New Spice in ${h}h ${m}m`;
  if (m) return `New Spice in ${m}m ${s % 60}s`;
  return `New Spice in ${s}s`;
}

/** This phone's time zone, for the server. */
export function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}
