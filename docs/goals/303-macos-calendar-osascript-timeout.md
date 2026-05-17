# 303 — macOS Calendar provider spawned osascript with no timeout (295/296/297 sibling)

## Why

`MacOsCalendarProvider` (`@muse/calendar`) is the local Calendar.app
adapter — every `listEvents` / `createEvent` / `updateEvent` /
`deleteEvent` runs an AppleScript through a spawned `osascript`.
`runScript` had **no timeout**: `child.on("error", reject)` +
`child.on("close", …)` only. On macOS `osascript`/EventKit can
genuinely wedge — an unanswered Calendar **TCC permission
prompt** blocks the process, a deadlocked EventKit query, a hung
AppleScript — and then `close` never fires, the Promise never
settles, and **every calendar operation hangs forever** with no
recovery. This is the same no-spawn-timeout class closed for STT
(295), TTS (296), and the Rust runner (297); the calendar
provider's `osascript` spawn was the untreated sibling, and the
whole `MacOsCalendarProvider` had **zero test coverage**.

## Scope

`packages/calendar/src/macos-provider.ts` — same pattern as
295/296/297:

- New `timeoutMs` option (positive-finite-guarded), default
  **30 s** — generous for Calendar.app/EventKit, but a
  never-answered TCC prompt no longer blocks the agent
  indefinitely.
- `runScript` arms a `setTimeout` that `SIGKILL`s the child and
  rejects `CalendarProviderError("OSASCRIPT_TIMEOUT", …)`. A
  single `finish()` settle-guard wraps every resolve/reject so
  the timer is always cleared and `error`/`close`/timeout can't
  double-settle. One short WHY comment records the
  wedged-AppleScript / unanswered-permission-prompt rationale.

Behaviour-preserving: a normally-exiting `osascript` resolves /
rejects exactly as before (timer cleared on `close`, same
permission / not-found / exit-code branches); only a process that
outlives `timeoutMs` is now killed instead of hanging.

## Verify

- `pnpm --filter @muse/calendar test` — 19 pass (was 17; +2,
  the first coverage for this provider). New tests use a **real**
  child: a never-exiting `setInterval` shebang as `osascriptPath`
  with `timeoutMs:150` → `listEvents` rejects
  `{ code: "OSASCRIPT_TIMEOUT" }` in < 5 s (proves the process is
  actually killed); a fast `process.exit(0)` osascript →
  `listEvents` resolves `[]` (normal path unregressed). The
  existing Local / CalDAV / registry / credential tests stay
  green.
- `pnpm check` — every workspace green (calendar 19, apps/cli
  563, apps/api 161, all packages). `pnpm lint` — exit 0.
- No real-LLM request/response path touched (calendar
  process-spawn lifecycle). A live Qwen run cannot reproduce a
  wedged osascript / blocked TCC prompt on demand, so the
  deterministic real-hung-child test is the rigorous
  verification — same stance as the timeout/limit goals
  295 / 296 / 297 / 263 / 284.

## Status

done — the macOS Calendar adapter now SIGKILLs a wedged
`osascript` and fails fast with a clear `OSASCRIPT_TIMEOUT`
instead of hanging the calendar feature (and the agent) forever
on an unanswered permission prompt or a deadlocked AppleScript.
Normal calendar operations are unchanged, and the provider now
has spawn-path test coverage. Every spawn path in the codebase
(STT 295, TTS 296, runner 297, macOS calendar 303) is
timeout-bounded.
