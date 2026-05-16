# 282 — CalDAV event times ignored TZID and were parsed as server-local

## Why

"What's on my calendar today / when is my next meeting" is a
flagship JARVIS-style ambient capability, and `CalDAVCalendarProvider`
(iCloud / Fastmail / Proton / generic) is the non-local backend.
`parseVEvent` extracted the property `params` and used them only
for `VALUE=DATE` (all-day) detection — it **ignored `TZID`
entirely**. `parseIcsTime` then parsed a DATE-TIME with no `Z`
suffix as:

```ts
const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}`;   // no zone
new Date(iso);                                    // → MACHINE-LOCAL time
```

A CalDAV event `DTSTART;TZID=America/New_York:20260517T100000`
was therefore interpreted in the **server's** timezone, not New
York. For the project's primary user (Asia/Seoul, UTC+9) a 10:00
New York meeting surfaced as 10:00 Seoul — wrong by ~13–14
hours, silently, on a user-facing answer. The whole CalDAV ICS
parse path also had **zero test coverage**.

## Scope

`packages/calendar/src/caldav-provider.ts`:

- `parseIcsTime(value, allDay, timeZone?)`: when the value has no
  `Z` and a `timeZone` is supplied, resolve the wall-clock time
  *in that zone* to a UTC instant; on an unknown/invalid TZID
  fall through to the existing floating (local) parse rather than
  dropping the whole event.
- `zoneOffsetMsAt` + `zonedWallTimeToUtcMs`: dependency-free,
  DST-correct conversion using built-in `Intl.DateTimeFormat`
  `formatToParts` (zero cost, no tz-database dep). Two passes so a
  DST offset change between the naive guess and the true instant
  is corrected — the standard Intl technique; one pass is wrong
  by an hour around transitions (one short WHY comment records
  this).
- `icsTzid(params)` extracts `;TZID=<zone>`; `parseVEvent` passes
  it for both `DTSTART` and `DTEND`.

Behaviour preserved: explicit-`Z` UTC times, all-day
`VALUE=DATE`, and floating (no `Z`, no TZID) datetimes parse
exactly as before. Only TZID-qualified datetimes change — from
silently-wrong-by-the-server-offset to correct.

## Verify

- `pnpm --filter @muse/calendar test` — 17 pass (was 14; +3).
  New CalDAV tests drive the real `listEvents` → multistatus XML
  → `parseVEvent` path: `DTSTART;TZID=America/New_York:20260517T100000`
  resolves to `2026-05-17T14:00:00.000Z` (EDT = UTC-4) and its
  `DTEND` to `15:00:00Z`; an explicit `…Z` DTSTART stays
  `10:00:00Z` and an all-day `VALUE=DATE` stays
  `2026-05-17T00:00:00Z` with `allDay:true`; an unknown
  `TZID=Not/AZone` still returns the event (floating fallback,
  not dropped). The existing LocalCalendarProvider /
  registry / credential-store tests stay green.
- `pnpm check` — every workspace green (calendar 17,
  apps/cli 561, apps/api 160, all packages). `pnpm lint` —
  exit 0.
- No real-LLM request/response path touched (pure deterministic
  ICS time parsing). A live Qwen run cannot reproduce a
  TZID-qualified ICS datetime on demand, so the deterministic
  regression tests are the rigorous verification — same stance as
  goals 261 / 274–281.

## Status

done — CalDAV events now honour their `TZID`, so a meeting in a
remote timezone surfaces at the correct instant instead of being
silently offset by the server's timezone. Z / all-day / floating
parsing is unchanged, and the previously-untested CalDAV ICS path
now has direct coverage.
