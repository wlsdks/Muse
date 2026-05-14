# 069 — Reminder firing idempotency on restart

## Why

If the reminder-firing daemon crashes between marking a reminder as
fired and writing notification log, restart could re-fire. Audit +
add a per-reminder fired_at marker check before re-firing.

## Scope

- Read reminder-firing-loop.ts.
- Add idempotency check.

## Verify

- mcp +2 tests (kill-mid-fire + restart).

## Status

done — `runDueReminders` now persists the `pending → fired`
status flip after EACH successful delivery (via
`writeReminders`), not just at the end of the tick. The
previous batched-write pattern lost every in-tick delivery if
the daemon died after `send` returned but before the final
flush — restart would re-deliver every just-delivered
reminder.

Net effect: if delivery #1 succeeds and delivery #2 throws (or
the process is `kill -9`'d between them), rem_first is already
`fired` on disk and restart only re-fires rem_second.
Idempotency is enforced by `filterReminders`'s
`status === "pending"` gate, which now sees the up-to-date
on-disk state.

mcp +1 test exercises a flaky registry where send #2 throws,
then a clean restart, and asserts each reminder fires exactly
once across the two ticks. The trailing batched
`writeReminders` is removed (per-delivery write covers every
mutation).
