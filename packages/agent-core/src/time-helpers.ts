/**
 * Non-tool time helpers reused by ActiveContextProvider so the
 * agent runtime can format current time + decide working-hours
 * without going through the `muse.time.now` tool. Mirrors the
 * Intl.DateTimeFormat-based approach used by the time tool in
 * `@muse/tools`.
 */

export interface FormattedTime {
  readonly iso: string;
  readonly timezone: string;
  readonly weekday: string;
  readonly localHour: number;
  /**
   * The LOCAL wall-clock time pre-computed in `timezone`, e.g.
   * "2026-07-12 15:54". `iso` is UTC (`…Z`), so handing the model only
   * `iso` + a timezone LABEL forces it to do the UTC→local conversion — a
   * 12B does that unreliably (measured: "지금 몇 시야?" returned 07:52 once,
   * 15:54 another time for the same instant). Per the repo's own rule
   * (do TZ math in code, never in the model), the renderer surfaces THIS
   * pre-converted local string so the model just reads it off.
   */
  readonly localDisplay: string;
}

const FALLBACK_TIMEZONE = "UTC";

export function resolveTimezone(preferred?: string): string {
  if (preferred && isValidTimezone(preferred)) {
    return preferred;
  }
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return resolved && isValidTimezone(resolved) ? resolved : FALLBACK_TIMEZONE;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}

export function formatCurrentTime(now: Date, timezone?: string): FormattedTime {
  const tz = resolveTimezone(timezone);
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    // h23, not hour12:false — the latter maps to the h24 cycle and
    // renders midnight as "24", so localHour would be 24 not 0 and
    // isWorkingHours would misjudge an hour-0 range at midnight.
    hourCycle: "h23",
    timeZone: tz,
    weekday: "long"
  });
  const parts = formatter.formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Unknown";
  const hourPart = parts.find((part) => part.type === "hour")?.value ?? "0";
  const localHour = Number.parseInt(hourPart, 10);
  return {
    iso: now.toISOString(),
    localDisplay: formatLocalDisplay(now, tz),
    localHour: Number.isFinite(localHour) ? localHour : 0,
    timezone: tz,
    weekday
  };
}

// "2026-07-12 15:54" in `tz` — the model reads the local wall-clock time
// directly instead of converting the UTC `iso`. h23 keeps midnight as 00, not
// 24. Sortable YYYY-MM-DD HH:mm is unambiguous across locales.
function formatLocalDisplay(now: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: tz,
    year: "numeric"
  }).formatToParts(now);
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export function isWorkingHours(
  now: Date,
  range: { readonly start: number; readonly end: number },
  timezone?: string
): boolean {
  const { localHour } = formatCurrentTime(now, timezone);
  const start = clampHour(range.start);
  const end = clampHour(range.end);
  if (start === end) {
    return false;
  }
  if (start < end) {
    return localHour >= start && localHour < end;
  }
  return localHour >= start || localHour < end;
}

export function parseWorkingHoursString(value: string | undefined): { start: number; end: number } | undefined {
  if (!value) {
    return undefined;
  }
  const match = /^\s*(\d{1,2})\s*[-–~:to]+\s*(\d{1,2})\s*$/iu.exec(value);
  if (!match) {
    return undefined;
  }
  const start = clampHour(Number.parseInt(match[1] ?? "", 10));
  const end = clampHour(Number.parseInt(match[2] ?? "", 10));
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return undefined;
  }
  return { end, start };
}

function clampHour(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) return 0;
  if (value > 24) return 24;
  return Math.trunc(value);
}

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Render the offset from `now` to `target` as a short, human-readable
 * phrase ("in 30 min", "2h ago", "now", "in 3 days"). Lets the agent
 * read a calendar event line and answer "when's the next meeting?"
 * without doing date arithmetic in its head.
 *
 * Returns undefined when either input cannot be parsed so the caller
 * can fall back to the raw ISO.
 */
export function humanizeRelativeFromIso(nowIso: string, targetIso: string): string | undefined {
  const now = Date.parse(nowIso);
  const target = Date.parse(targetIso);
  if (!Number.isFinite(now) || !Number.isFinite(target)) {
    return undefined;
  }
  return humanizeRelativeMs(target - now);
}

export function humanizeRelativeMs(deltaMs: number): string {
  if (!Number.isFinite(deltaMs)) {
    return "unknown";
  }
  const abs = Math.abs(deltaMs);
  // Within ±60 seconds → call it "now" so a meeting that started a few
  // seconds ago still reads as "now" rather than "1 min ago".
  if (abs < 60_000) {
    return "now";
  }
  const isPast = deltaMs < 0;
  const minutes = Math.round(abs / 60_000);
  if (minutes < 60) {
    return isPast ? `${minutes.toString()} min ago` : `in ${minutes.toString()} min`;
  }
  const hours = Math.round(abs / 3_600_000);
  if (hours < 24) {
    return isPast ? `${hours.toString()}h ago` : `in ${hours.toString()}h`;
  }
  const days = Math.round(abs / 86_400_000);
  const dayUnit = days === 1 ? "day" : "days";
  return isPast ? `${days.toString()} ${dayUnit} ago` : `in ${days.toString()} ${dayUnit}`;
}
