# 041 — Extract buildCalendarRegistry into registry-builders/calendar.ts

## Why

Continuing goal 007's partial work. messaging was extracted; calendar
is next-most-cohesive (~87 LOC + tryBuildCalendarProvider helper).

## Scope

- Mirror 007's pattern: new file under registry-builders/.
- Re-export from personal-providers.ts.
- Drop the now-unused imports from personal-providers.ts.

## Verify

- All gates green. personal-providers.ts < 530 LOC.

## Status

done — `buildCalendarRegistry` + `tryBuildCalendarProvider` moved
to `registry-builders/calendar.ts` mirroring goal 007's messaging
extraction. `personal-providers.ts` shrank from 609 → 543 LOC (and
drops the calendar SDK imports entirely). The function is
re-exported so `index.ts` callers don't change. All gates green.
