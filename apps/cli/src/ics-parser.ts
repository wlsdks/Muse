/**
 * Minimal iCalendar (.ics) parser scoped to what
 * `muse calendar import <file.ics>` actually consumes. Reads the
 * VEVENT blocks, pulls UID / SUMMARY / DTSTART / DTEND / LOCATION
 * / DESCRIPTION, and ignores everything else (recurrence rules,
 * timezones, attendees, alarms) — those need stateful expansion
 * the local-file calendar provider doesn't model anyway.
 *
 * Why hand-rolled instead of pulling in `node-ical`: we only
 * support a one-shot manual import, the input format we touch is
 * limited, and adding a transitive dep for ~50 lines of parsing
 * is poor scope discipline. If a future goal needs RRULE / VTIMEZONE
 * expansion, swap to `node-ical` then; the export surface
 * (`parseIcsEvents`) stays.
 */

export interface ParsedIcsEvent {
  readonly uid?: string;
  readonly title: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly allDay: boolean;
  readonly location?: string;
  readonly notes?: string;
}

/**
 * Parse a .ics document body into the subset of fields the CLI
 * importer creates events for. Returns the events newest-first
 * (sorted by `startsAt`). Skips malformed entries silently — a
 * one-bad-block file should still surface the rest.
 *
 * Caller-supplied `now` lets tests pin "today" without depending
 * on the real clock. Default is `new Date()`.
 */
export function parseIcsEvents(body: string): readonly ParsedIcsEvent[] {
  const unfolded = unfoldLines(body);
  const events: ParsedIcsEvent[] = [];
  let inEvent = false;
  let buffer: Record<string, { value: string; isDate: boolean; tzid?: string }> = {};

  for (const line of unfolded) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      buffer = {};
      continue;
    }
    if (line === "END:VEVENT") {
      const parsed = finalizeEvent(buffer);
      if (parsed) events.push(parsed);
      inEvent = false;
      buffer = {};
      continue;
    }
    if (!inEvent) continue;
    const split = splitContentLine(line);
    if (!split) continue;
    buffer[split.key] = { value: split.value, isDate: split.isDate, ...(split.tzid ? { tzid: split.tzid } : {}) };
  }

  return events.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/**
 * iCalendar wraps long lines with a leading whitespace
 * continuation. Re-join those before the splitter sees them.
 */
function unfoldLines(body: string): readonly string[] {
  const raw = body.split(/\r?\n/u);
  const unfolded: string[] = [];
  for (const line of raw) {
    if (line.length === 0) continue;
    if ((line.startsWith(" ") || line.startsWith("\t")) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }
  return unfolded;
}

/**
 * Parse one iCal content line into a normalised
 * `{ key, value, isDate }` triple. `isDate` is true when the
 * line carries `VALUE=DATE` — those are all-day events.
 *
 * Returns `undefined` when the line isn't a key-value pair so
 * the caller can skip unrecognised lines.
 */
function splitContentLine(line: string): { key: string; value: string; isDate: boolean; tzid?: string } | undefined {
  const colon = line.indexOf(":");
  if (colon < 0) return undefined;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const semi = head.indexOf(";");
  const key = (semi < 0 ? head : head.slice(0, semi)).toUpperCase();
  // Params are matched case-insensitively, but the TZID *value* keeps its
  // original case — IANA zone ids ("America/New_York") are case-sensitive
  // for Intl. RFC 5545 allows the value to be quoted; strip the quotes.
  const params = semi < 0 ? "" : head.slice(semi + 1);
  const isDate = /(?:^|;)VALUE=DATE(?:;|$)/iu.test(params);
  const tzMatch = /(?:^|;)TZID=("?)([^;]*)\1/iu.exec(params);
  const tzid = tzMatch?.[2] ? tzMatch[2] : undefined;
  return { isDate, key, value, ...(tzid ? { tzid } : {}) };
}

function finalizeEvent(buffer: Record<string, { value: string; isDate: boolean; tzid?: string }>): ParsedIcsEvent | undefined {
  const summary = buffer["SUMMARY"]?.value?.trim();
  const dtstart = buffer["DTSTART"];
  const dtend = buffer["DTEND"];
  if (!summary || !dtstart) return undefined;
  const startsAt = parseIcsDateValue(dtstart.value, dtstart.isDate, dtstart.tzid);
  if (!startsAt) return undefined;
  const allDay = dtstart.isDate;
  // End is optional in iCal (default = startsAt + 0). Make it
  // startsAt + 30 min for timed events, +1 day for all-day, so
  // the local provider's listEvents range filter still finds them.
  let endsAt: Date | undefined;
  if (dtend) {
    endsAt = parseIcsDateValue(dtend.value, dtend.isDate, dtend.tzid);
  }
  if (!endsAt) {
    endsAt = allDay
      ? new Date(startsAt.getTime() + 24 * 60 * 60 * 1000)
      : new Date(startsAt.getTime() + 30 * 60 * 1000);
  }
  const event: ParsedIcsEvent = {
    title: unescapeIcsText(summary),
    startsAt,
    endsAt,
    allDay,
    ...(buffer["UID"]?.value ? { uid: buffer["UID"].value } : {}),
    ...(buffer["LOCATION"]?.value ? { location: unescapeIcsText(buffer["LOCATION"].value) } : {}),
    ...(buffer["DESCRIPTION"]?.value ? { notes: unescapeIcsText(buffer["DESCRIPTION"].value) } : {})
  };
  return event;
}

/**
 * iCal dates come in two shapes:
 *   - `YYYYMMDD` (VALUE=DATE) — all-day, interpret as UTC midnight.
 *   - `YYYYMMDDTHHMMSS[Z]` — timed. Trailing `Z` = UTC. A `TZID`
 *     param naming an IANA zone (`America/New_York`) is converted to
 *     the correct UTC instant via the built-in `Intl` (no tz library);
 *     an unsuffixed value with no/unknown `TZID` falls back to UTC.
 */
function parseIcsDateValue(raw: string, isDate: boolean, tzid?: string): Date | undefined {
  const value = raw.trim();
  if (isDate || /^\d{8}$/u.test(value)) {
    if (!/^\d{8}$/u.test(value)) return undefined;
    const year = Number.parseInt(value.slice(0, 4), 10);
    const month = Number.parseInt(value.slice(4, 6), 10);
    const day = Number.parseInt(value.slice(6, 8), 10);
    const date = new Date(Date.UTC(year, month - 1, day));
    // Reject an impossible calendar date instead of letting Date.UTC
    // silently roll it over (20260230 → Mar 2) — a malformed .ics
    // must not import an event on the wrong day.
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      return undefined;
    }
    return date;
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/u.exec(value);
  if (!m) return undefined;
  const [, y, mo, d, hh, mm, ss] = m;
  const year = Number.parseInt(y!, 10);
  const month = Number.parseInt(mo!, 10);
  const day = Number.parseInt(d!, 10);
  const hour = Number.parseInt(hh!, 10);
  const minute = Number.parseInt(mm!, 10);
  const second = Number.parseInt(ss!, 10);
  const dt = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day
    || dt.getUTCHours() !== hour || dt.getUTCMinutes() !== minute || dt.getUTCSeconds() !== second
  ) {
    return undefined;
  }
  // `Z` means UTC and wins over any TZID. An unsuffixed value with a
  // known IANA TZID is the wall-clock time in that zone — convert it to
  // the real UTC instant; an unknown zone falls back to the UTC reading.
  if (m[7] !== "Z" && tzid) {
    const zoned = zonedWallClockToUtc(year, month, day, hour, minute, second, tzid);
    if (zoned) return zoned;
  }
  return dt;
}

/**
 * Convert a wall-clock time in an IANA zone to the UTC instant, using
 * only the built-in `Intl` (no tz dependency). Two refinement passes so
 * a time near a DST transition resolves to the correct side. Returns
 * `undefined` for an unknown zone so the caller can fall back to UTC.
 */
function zonedWallClockToUtc(
  year: number, month: number, day: number, hour: number, minute: number, second: number, timeZone: string
): Date | undefined {
  const base = Date.UTC(year, month - 1, day, hour, minute, second);
  let utc = base;
  for (let i = 0; i < 2; i += 1) {
    const offset = tzOffsetMs(new Date(utc), timeZone);
    if (offset === undefined) return undefined;
    utc = base - offset;
  }
  return new Date(utc);
}

/**
 * Offset (ms) of `timeZone` at `instant`: how far the zone's wall clock
 * leads UTC. `undefined` when the zone id is not a valid IANA name.
 */
function tzOffsetMs(instant: Date, timeZone: string): number | undefined {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      day: "2-digit", hour: "2-digit", hourCycle: "h23", minute: "2-digit",
      month: "2-digit", second: "2-digit", timeZone, year: "numeric"
    }).formatToParts(instant);
  } catch {
    return undefined;
  }
  const get = (type: string): number => Number.parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - instant.getTime();
}

// Single left-to-right pass: an escaped backslash must be consumed
// as one unit so `\\n` is `\` + literal `n`, not a newline (RFC 5545
// §3.3.11). A sequential `\n`→newline-then-`\\`→`\` mangles it.
function unescapeIcsText(value: string): string {
  return value.replace(/\\([\\;,nN])/gu, (_match, ch: string) =>
    ch === "n" || ch === "N" ? "\n" : ch
  );
}
