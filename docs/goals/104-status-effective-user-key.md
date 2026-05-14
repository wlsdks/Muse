# 104 — `muse status` reads memory + trust at `<user>@<slot>` when persona slot active

## Why

Goal 098 surfaced the active persona slot in `muse status`. Goal
103 made `muse memory` read / write at the slot-composed key. But
`muse status` itself still pulled facts / preferences / trust from
the **bare `<user>`** record — so a `MUSE_PERSONA=work muse status`
showed a "slot: work" badge while every count below it (factCount,
preferenceCount, vetoCount, trust.blockedTools, trust.trustedTools)
came from the home / default record.

This is the same silent-divergence bug goal 103 fixed for the
`memory` group — closing it here makes the status dashboard
trustworthy when a user lives across multiple slots.

## Scope

- `apps/cli/src/commands-status.ts` `collectStatus`:
  - Resolve `slot` BEFORE reading the user-memory document. Compose
    `effectiveUserKey = slot ? \`${userId}@${slot}\` : userId`.
  - Use the composed key for the memory `users[…]` lookup and for
    `readTrust(…)`. Trust already supports user@slot keys via
    `MUSE_TRUST_FILE` (goal 097).
  - JSON snap: when a slot is active, add `effectiveUserKey` to
    `persona` alongside `slot` + `slotSource` so jq pipelines +
    downstream tooling don't have to recompose it.
- Strictly additive: `effectiveUserKey` is omitted when no slot is
  active; `schemaVersion` stays at `1`. No on-disk changes.

## Verify

- New `apps/cli/test/program.test.ts` case seeds BOTH a `stark`
  record AND a `stark@work` record (with distinct factCount,
  vetoCount, trust lists) and asserts:
  - With `MUSE_PERSONA=work`, `factCount === 2`, `vetoCount === 1`,
    `effectiveUserKey === "stark@work"`, `updatedAt` matches the
    work record's timestamp.
  - Without `MUSE_PERSONA`, the bare record is read, `factCount
    === 1`, `effectiveUserKey` is omitted.
- `pnpm --filter @muse/cli test` — 321 tests pass.
- `pnpm check` exit 0; `pnpm lint` exit 0.
- No real-LLM path touched.

## Status

done — the goal-098 slot badge now describes data the status
dashboard actually surfaces. Followups / episodes / patterns
still filter by base userId; those rows are user-scoped, not
slot-scoped, so the existing filter is correct. A future
iteration could add per-slot followups if a real divergence shows
up.
