# 341 — notification provider spawns had no timeout watchdog (could freeze the firing pipeline)

## Why

Closes the child-process-watchdog sweep. After 295/296/297
(whisper-cpp/piper/runner), 303 (calendar osascript), 339
(`muse glance`), 340 (Apple Notes/Reminders), the **last two
unguarded spawns** were the desktop-notification providers:

- `macos-notification-provider.ts` `defaultRunner` —
  `spawn("osascript", ["-e", script])`
- `linux-libnotify-provider.ts` `defaultRunner` —
  `spawn("notify-send", args)`

Both had `child.on("error"|"close")` only — **no timer, no
SIGKILL**. These are not fire-and-forget: `provider.send()`
**awaits** the runner, and `send()` is itself awaited by
`sendWithRetry` inside the reminder / followup / proactive
firing loops. So a wedged Notification Center, or — very common
on headless / SSH Linux — `notify-send` blocking because there
is **no D-Bus session / no notification daemon to reply**,
makes the spawn never close, `send()` never resolve, and the
**entire ambient-notification firing tick hang forever**
(silently freezing reminders + proactive notices). Higher
impact than it looks: a best-effort notice channel can stall
the whole daemon.

## Scope

`packages/messaging/src/macos-notification-provider.ts` &
`linux-libnotify-provider.ts` — each `defaultRunner`:

- Apply the established goal-303 single-settle + SIGKILL
  watchdog (`settled` flag, `finish()` clearTimeout+once,
  `setTimeout` → `kill("SIGKILL")` + reject, `error`/`close`
  routed through `finish` so a post-kill late `close` can't
  double-settle). 30_000 ms, consistent with every other
  spawn watchdog in the codebase. On timeout the runner
  rejects an `Error`, which `send()` already maps to a
  `MessagingProviderError` — so a stuck notification becomes a
  classifiable send failure instead of an infinite hang.
- `defaultRunner` is now an exported function taking an
  optional injected `spawnFn` (default real `spawn`) purely
  for testability — mirrors goal 339; the `this.runner =
  options.runner ?? defaultRunner` wiring is unchanged
  (extra optional param stays assignable to the runner type).

Both fixed together — identical bug, sibling files, identical
fix shape (bundling as in 319/321/338/340). Behaviour-preserving
for the normal path (clean close still resolves
`{ exitCode, stderr }`; spawn error still rejects); the only new
behaviour is the bounded timeout.

## Verify

- `pnpm --filter @muse/messaging test` — 135 pass (was 129;
  +6, three per provider). Each: clean close → resolves
  `{ exitCode: 0 }`; a fake never-closing spawn under fake
  timers → rejects `/timed out after 30000ms/` and the child
  is killed with `SIGKILL`; a late `close` after the timeout
  is ignored (single-settle). Existing
  validate / argv / send-mapping tests stay green (they inject
  `options.runner`, bypassing `defaultRunner`, so unaffected).
- `pnpm check` — every workspace green (messaging 135,
  apps/cli 581, apps/api 161, all packages). `pnpm lint` —
  exit 0. The goal-227 enforcement test (328) stays green.
- No real-LLM request/response path touched (deterministic
  child-process control flow). The deterministic suite —
  including the genuine fake-timer SIGKILL tests — is the
  rigorous verification.

## Status

done — the macOS and Linux desktop-notification spawns now
SIGKILL and reject after 30 s instead of hanging indefinitely
(no D-Bus session / wedged Notification Center), so a stuck
notice can no longer freeze the reminder/followup/proactive
firing loop. **Every child-process spawn in the codebase now
has a SIGKILL timeout watchdog** (295/296/297, 303, 339, 340,
341) — the class is fully closed.
