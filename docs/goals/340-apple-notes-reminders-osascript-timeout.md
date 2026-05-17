# 340 — Apple Notes & Reminders osascript spawns had no timeout watchdog

## Why

Continuing the child-process-watchdog sweep (295 whisper-cpp,
296 piper, 297 Rust runner, 303 macOS *calendar* osascript, 339
`muse glance` osascript). A repo-wide `spawn(` audit found the
**last two unguarded osascript spawns**:
`packages/mcp/src/notes-providers-apple.ts` and
`tasks-providers-apple.ts`. Both `runScript` methods spawned
`osascript` against Notes.app / Reminders.app with `child.on(
"error"|"close")` only — **no timer, no SIGKILL**.

These drive AppleScript automation of Notes / Reminders, which
require a TCC *Automation* permission prompt on first use (and
can wedge on an unresponsive app). An unanswered prompt leaves
osascript blocked, so **every Apple-Notes / Apple-Reminders
read or write hangs forever** — the personal-data path the
agent and CLI await — exactly the failure mode goals 303/339
closed for calendar and glance, still open for the two highest-
traffic personal stores.

## Scope

`packages/mcp/src/notes-providers-apple.ts` &
`tasks-providers-apple.ts` — each `runScript`:

- Apply the established goal-303 single-settle + SIGKILL
  watchdog: a `settled` flag, a `finish(action)` helper
  (`clearTimeout` + run-once), a `setTimeout` that
  `child.kill("SIGKILL")`s and rejects a typed
  `OSASCRIPT_TIMEOUT` provider error with an
  unanswered-Automation-prompt hint, and `error`/`close` routed
  through `finish` (a post-kill late `close` can't
  double-settle).
- Mirror calendar's **configurable + non-finite-guarded**
  `timeoutMs` option (`AppleNotesProviderOptions` /
  `AppleRemindersProviderOptions` gain `readonly timeoutMs?:
  number`; constructor: `typeof === "number" &&
  Number.isFinite && > 0 ? … : 30_000`). 30_000 ms default
  matches `DEFAULT_MACOS_TIMEOUT_MS` for cross-surface
  consistency; the guarded option also makes the watchdog
  unit-testable with a short timeout (and incidentally closes
  the same non-finite-option class as goals 336-338).

Both fixed together — identical bug, sibling files, identical
fix shape (sibling bundling as in goals 319/321/338).
Behaviour-preserving for the normal path (clean exit resolves
stdout; permission / not-found / non-zero-exit branches
unchanged).

## Verify

- `pnpm --filter @muse/mcp test` — 358 pass (was 355; +3). New
  `describe`: a real never-exiting `fake-osascript` (node
  `setInterval`) + `timeoutMs: 150` → `AppleNotesProvider.list()`
  and `AppleRemindersProvider.list()` reject
  `{ code: "OSASCRIPT_TIMEOUT" }` in `< 5_000ms` (proves the
  watchdog kills it, not the test merely waiting); a
  fast-exiting (`process.exit(0)`) script still resolves to
  `[]` (watchdog cleared, no double-settle). The existing
  apple-notes/reminders validation / exit-code / permission
  tests stay green.
- `pnpm check` — every workspace green (mcp 358, apps/cli 581,
  apps/api 161, all packages). `pnpm lint` — exit 0. The
  goal-227 enforcement test (328) stays green.
- No real-LLM request/response path touched (deterministic
  child-process control flow). The deterministic suite —
  including the genuine hung-script SIGKILL tests — is the
  rigorous verification.

## Status

done — the Apple Notes and Reminders osascript spawns now
SIGKILL and reject `OSASCRIPT_TIMEOUT` after 30 s (configurable,
non-finite-guarded) instead of hanging indefinitely on an
unanswered Automation prompt, with single-settle guards. The
osascript-hang-watchdog class is now closed across **every**
osascript spawn in the codebase — calendar (303), `muse glance`
(339), Apple Notes & Reminders (340).
