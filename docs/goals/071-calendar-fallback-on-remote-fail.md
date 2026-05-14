# 071 — Calendar provider fallback to local when remote fails

## Why

If Google Calendar listEvents fails, fall back to LocalCalendarProvider
events instead of returning empty.

## Scope

- Read CalendarProviderRegistry.listEvents.
- Add try/catch per-provider with local fallback.
- Surface the fallback in the response metadata.

## Verify

- calendar +1 test.

## Status

done — `CalendarProviderRegistry.listEvents` already swallowed
per-provider errors (local events surface naturally when gcal /
caldav throws). The missing piece was *visibility*. Added:

  - new `listEventsWithDiagnostics(range)` returns
    `{ events, failedProviders: [{providerId, message}] }` so
    callers can render "(gcal failed — falling back to local)".
  - new constructor option `onProviderError(providerId, msg)` —
    invoked once per failed provider per fan-out — lets a
    daemon log the upstream error without changing the public
    return shape.
  - `listEvents(range)` is now a thin wrapper around the
    diagnostic path so the failure callback fires for plain
    callers too.

calendar +1 test wires a flaky stub provider + a working local
provider, asserts the local event still surfaces via
`listEvents`, that `listEventsWithDiagnostics` names the failed
provider, and that `onProviderError` fires once per call (each
fan-out hits gcal independently).
