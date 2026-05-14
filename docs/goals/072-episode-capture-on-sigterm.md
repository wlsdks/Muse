# 072 — Episode capture on SIGTERM during REPL exit

## Why

The REPL captures episodes at clean exit. SIGTERM may skip the capture
if not wired. Add a signal handler.

## Scope

- chat-repl.ts SIGTERM handler.
- Synchronous final capture.

## Verify

- cli + manual dogfood.

## Status

done — `chat-repl.ts` wires process-level SIGTERM + SIGINT to
the same graceful-exit path the readline-level Ctrl-C uses, so
`kill <pid>` / `docker stop` / systemd shutdown unblock the
question loop and the existing `finally` block runs — which
calls `captureEndOfSessionEpisode` and persists the summary
into `~/.muse/episodes.json` exactly like a clean `/exit`.

The signal routing is extracted to a new
`wireReplGracefulExit({ onSignal })` helper (returns a
teardown function the `finally` calls) so it's testable
without standing up a real readline / TTY. The previous
inline SIGINT (readline-level) handler stays in place too —
it catches the common "user hits Ctrl-C in the prompt" case.

cli +1 test asserts `wireReplGracefulExit` fires the
callback on SIGTERM and that the teardown unregisters the
listener so subsequent emits don't re-fire.
