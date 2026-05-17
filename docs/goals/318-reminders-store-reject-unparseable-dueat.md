# 318 — a reminder with an unparseable dueAt sat "pending" forever and never fired

## Why

Direct sibling of goal 317 (followups), in the reminders store.
`isPersistedReminder` (the per-entry load guard in
`personal-reminders-store.ts`) only checked `typeof
candidate.dueAt !== "string"`. `filterReminders` then selects
due entries with:

```ts
reminders.filter(
  (entry) => entry.status === "pending"
    && Date.parse(entry.dueAt) <= cutoff
)
```

`Date.parse("tomorrow")` (a hand-edited / imported
`~/.muse/reminders.json`, a REST-posted bad value, a corrupted
partial write) is `NaN`. `NaN <= cutoff` is `false`, so the
reminder is **never selected as due, never fires, and sits
`status:"pending"` forever** — the user asked to be reminded and
that reminder is **silently never delivered, with no error
anywhere**. It is still *listed* (ordering already tolerated
unparseable values — `compareRemindersByDueAt`, goal 314's
parallel), so the user believes it is armed when it is actually
dead.

Same silent-vanish bug class as the local calendar (316), CalDAV
(282), and followups (317). Goal 314 hardened only
`compareRemindersByDueAt` (list ordering), explicitly noting
"hand-edited reminders.json / imports / REST need not be
canonical" — but left the *firing* path exposed.
`filterReminders` feeds both the REST list-due endpoint and the
firing loop (`runDueReminders` → `filterReminders(all, "due",
now)`), so the same bad entry is invisible to "what's due now"
and never fired.

## Scope

`packages/mcp/src/personal-reminders-store.ts` —
`isPersistedReminder`:

- `dueAt` must now actually **parse**
  (`Number.isFinite(Date.parse(candidate.dueAt))`), not merely
  be a string — exactly the predicate `filterReminders`' `Date.parse(...)
  <= now` needs to behave. An unparseable entry is dropped at
  load, the same posture `isPersistedEvent` (316) /
  `isPersistedFollowup` (317) / CalDAV's `parseVEvent` (282)
  use, and the same `Number.isFinite(Date.parse(...))` predicate
  `compareRemindersByDueAt` already uses for ordering in this
  very file. One short WHY comment records the never-fires
  rationale.

Tightest scope — only `dueAt` is hardened: `firedAt` is
optional and only set post-fire / used for display (never in a
firing decision); `createdAt` is only consumed via
`localeCompare` (string-safe). Widening the guard there would be
scope the bug doesn't require. Behaviour-preserving for every
well-formed `reminders.json` (ISO timestamps — the normal
`parseReminderDueAt`-resolved path — parse and pass exactly as
before); only a malformed entry that was previously
un-fireable-but-listed is now uniformly absent.

## Verify

- `pnpm --filter @muse/mcp test` — 351 pass (was 350; +1). New
  regression: a `reminders.json` with one valid pending entry
  and one whose `dueAt` is `"tomorrow"` → `readReminders`
  returns **only** the valid entry (`["rem_ok"]`) (pre-fix: the
  corrupt entry passed `isPersistedReminder`, was returned,
  listed as "pending", and then never fired because `Date.parse`
  → NaN). The existing fire-overdue / idempotent-zero-call /
  per-reminder-error / compare-by-instant (314) / lifecycle
  tests stay green.
- `pnpm check` — every workspace green (mcp 351, apps/cli 563,
  apps/api 161, all packages). `pnpm lint` — exit 0.
- No real-LLM request/response path touched (pure persisted-entry
  type-guard). A live Qwen run cannot reproduce a corrupt
  reminders.json on demand, so the deterministic regression is
  the rigorous verification — same stance as goals 317 / 316 /
  314 / 282.

## Status

done — a reminder whose persisted `dueAt` does not parse is now
dropped at the load type-guard, consistently with followups
(317), the local calendar (316), and CalDAV (282), so a
corrupt/hand-edited entry can no longer sit listed-but-un-fireable
forever. The reminder firing path is now closed for the same
unparseable-timestamp class goal 314 closed for ordering — the
personal-data silent-never-fire / silent-vanish class is now
closed across calendar (282/316), followups (317), and reminders
(318).
