# 061 — muse today colorize output (tty-aware)

## Why

Add ANSI colors for the day-of-week header + overdue markers when
stdout is a TTY. NO_COLOR env var respected.

## Scope

- chalk or a tiny helper.
- TTY detection.
- Snapshot test with TTY off.

## Verify

- cli +1 test.

## Status

done — new `apps/cli/src/tty-color.ts` exports `colorize` +
`colorAllowed` helpers. NO_COLOR env wins unconditionally
(https://no-color.org/); `force` honoured only when NO_COLOR is
unset (for tests); otherwise `process.stdout.isTTY` decides.
No chalk / picocolors dep.

Applied in `commands-today.ts`: the Reminders / Followups
section headers render as ANSI bold and "(overdue)" markers as
red when a TTY is attached. Piped output is unchanged so jq /
grep pipelines stay byte-identical to before.

cli +1 test on the helpers covers NO_COLOR wins, force, no-TTY
default, and unknown-color-name pass-through.
