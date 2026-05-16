# 281 — inbox-injection cursor compared ISO timestamps as raw strings

## Why

`advanceInboxInjectionCursor` (`@muse/messaging`) is the
per-source watermark for the agent-prompt inbox-injection surface
(Context Engineering Phase 2): it records the newest message
timestamp already injected so the next poll doesn't re-feed the
same inbound messages into the agent's context. It advanced the
cursor with a **raw string comparison**:

```ts
const prior = merged[source];
if (!prior || iso > prior) { merged[source] = iso; }
```

with a comment claiming "string comparison works for ISO-8601 in
UTC". That invariant is false in general:

- **Mixed precision**: `"2026-05-11T08:00:01.500Z"` is a *later*
  instant than `"2026-05-11T08:00:01Z"`, but string-compares as
  **less** (`'.'` 0x2E < `'Z'` 0x5A). So a later sub-second
  message whose prior cursor was whole-second never advances the
  cursor — and is **re-injected into the agent context on every
  poll** (the exact duplication this module exists to prevent).
- **Timezone offset**: `"2026-05-11T18:00:00+09:00"` is the same
  instant as `09:00:00Z` — *earlier* than a `10:00:00.000Z`
  prior — yet string-compares as greater (`"18" > "10"`), moving
  the cursor **backward** and replaying an hour of messages.

Provider `receivedAtIso` values come from several code paths
(`Date.toISOString()` is `.fffZ`, but other providers/seed values
need not be), so a single mixed-format pair silently stalls or
rewinds the watermark.

## Scope

`packages/messaging/src/inbox-injection-cursor.ts` —
`advanceInboxInjectionCursor`:

- Compare **parsed instants** (`Date.parse`) instead of raw
  strings: advance only when the incoming instant is strictly
  later than the stored one. An unparseable incoming `iso` is
  skipped (never stored — the cursor must hold comparable
  instants); an unparseable / absent prior is treated as "advance"
  so a legacy-garbage cursor self-heals to a valid instant. The
  stored value is still the original ISO string (callers may
  depend on the exact text); only the comparison changed. The
  doc comment now states the accurate WHY.

Behaviour-preserving for the canonical case: two
`Date.toISOString()` (`YYYY-MM-DDTHH:MM:SS.fffZ`) strings order
identically under lexicographic and instant comparison, so all
existing same-format cursor behaviour is unchanged.

## Verify

- `pnpm --filter @muse/messaging test` — 122 pass. New
  regression: a whole-second prior `"…08:00:01Z"` is correctly
  advanced by the later `"…08:00:01.500Z"` (pre-fix: not
  advanced → perpetual re-injection); a `+09:00` offset string
  that is an *earlier* instant than the UTC prior does **not**
  move the cursor backward (pre-fix: it did); an unparseable
  `"soon"` is never stored. Existing newest-per-source,
  per-user-isolation, v1→v2 migration, and read/write tests stay
  green (all use canonical `.000Z`, unaffected).
- `pnpm check` — every workspace green (messaging 122,
  apps/cli 561, apps/api 160, all packages). `pnpm lint` —
  exit 0.
- No real-LLM request/response path touched (pure deterministic
  cursor comparison). A live Qwen run cannot reproduce a
  mixed-precision / offset ISO pair on demand, so the
  deterministic regression is the rigorous verification — same
  stance as goals 261 / 274–280.

## Status

done — the inbox-injection cursor now advances by instant, so a
mixed-precision or timezone-offset timestamp can no longer stall
the watermark (re-injecting the same message every poll) or rewind
it (replaying an hour of messages). Canonical same-format
behaviour is unchanged.
