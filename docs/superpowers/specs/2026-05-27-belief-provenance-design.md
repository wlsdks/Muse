# Belief provenance — "why does Muse believe that" (Hindsight)

- **Date:** 2026-05-27
- **Status:** approved (brainstorming) — proceeding autonomously to PR per user direction
- **Direction:** research-based agent-quality upgrade (EXPANSION-PLAYBOOK priority #3)
- **Source idea:** Hindsight (arXiv 2512.12818) — separate *evidence* (what the user said) from *inference* (what the agent concluded); a belief points to the evidence it was derived from.

## Problem

Muse's auto-extract turns conversation into remembered **inferences** —
facts/preferences it concluded the user holds. But a stored fact is a bare
`key=value`: it carries **no pointer to the evidence** it was drawn from. The
user can see *that* Muse believes something (`muse memory show`) and now *what
it used to be* (`muse memory history`, the C slice), but never **why** — which
conversation, when, from what the user actually said. Hindsight's core move is
exactly this evidence↔inference separation; Muse has the inference half only.

## Goal

When auto-extract stores a belief (fact/preference), record its **provenance** —
when it was learned, from which session, and a short excerpt of the user message
that triggered it. Surface it: `muse memory why <key>` answers "I remember
`<key> = <value>` — learned `<date>` from your message: \"…\"".

Conservative + isolated: provenance is a **separate store**, written fail-open;
absent provenance (every belief learned before this, or any deployment without
the store wired) degrades to a clear "no recorded provenance" message. No change
to how beliefs are stored or recalled.

## Non-goals (YAGNI)

- **No** belief *revision on veto* (supersede-citing-the-correction) — C already
  records value supersession; revision-on-correction is a later slice.
- **No** change to `UserMemoryStore` (its interface / 3 impls / schema stay
  untouched — that is exactly why a separate store is chosen).
- **No** server/Kysely provenance — the live producer (auto-extract) and the
  live surface (`muse memory`) are the CLI file path; server is out of scope.
- **No** model call for provenance — it rides data the auto-extract hook already
  has in scope (user message, runId, metadata.sessionId).

## Architecture (dedicated store, matches the personal-* store pattern)

### Store — `packages/memory/src/belief-provenance-store.ts`
```ts
export interface BeliefProvenance {
  readonly userId: string;
  readonly key: string;                 // normalised memory key
  readonly kind: "fact" | "preference";
  readonly value: string;               // the value at learn time
  readonly learnedAt: string;           // ISO
  readonly sessionId?: string;
  readonly evidenceExcerpt?: string;    // sanitized, bounded snippet of the user message
}
export interface BeliefProvenanceStore {
  record(entry: BeliefProvenance): Promise<void>;
  query(userId: string, key?: string): Promise<readonly BeliefProvenance[]>; // newest-first
}
export class FileBeliefProvenanceStore implements BeliefProvenanceStore { … }
```
- File: `~/.muse/belief-provenance.json` (env override `MUSE_BELIEF_PROVENANCE_FILE`).
- Same durability posture as the sibling stores: atomic write (tmp + rename),
  tolerant read, corrupt store quarantined aside, entries flat-array +
  `flatMap`-validated, **capped** (newest `MAX_BELIEF_PROVENANCE_ENTRIES = 1000`).
- `query(userId)` returns this user's entries newest-first; `query(userId, key)`
  filters to the normalised key (so the latest record for a key is `[0]`).
- `record` appends with the cap applied; never throws to the caller beyond what
  the hook's fail-open wrapper already swallows.

### Producer — `packages/memory/src/memory-auto-extract.ts`
- Hook options gain optional `provenanceStore?: BeliefProvenanceStore`.
- In the `afterComplete` body, derive a provenance context once:
  `{ sessionId: metadataString(metadata, "sessionId"), evidenceExcerpt:
  sanitize+bound(userPrompt, 160) }`.
- `persist(...)` gains the optional store + context; after each successful
  `upsertFact` / `upsertPreference`, it records a `BeliefProvenance`
  (`kind`, normalised `key`, `value`, `learnedAt = now`, `sessionId`,
  `evidenceExcerpt`). Per-write fail-open (reuse the existing `safeWrite`
  pattern) — a provenance failure never blocks the memory write.
- Absent `provenanceStore` ⇒ byte-identical to today (no-op).

### Consumer — `muse memory why <key>` (`apps/cli/src/commands-memory.ts`)
- New subcommand in the `memory` group (mirrors `history`): reads
  `FileBeliefProvenanceStore.query(userId, normalizeMemoryKey(key))`, prints the
  latest: `<key> = <value> — learned <learnedAt>` + `  ↳ from your message: "<excerpt>"`
  + `  ↳ session <id>` when present; `--json` returns the raw records.
- No record ⇒ `(no recorded provenance for "<key>" — learned before provenance tracking, or not remembered)`.

### Wiring — `packages/autoconfigure/src/index.ts`
- Construct a `FileBeliefProvenanceStore` and pass it as `provenanceStore` into
  `createUserMemoryAutoExtractHook`, gated by `MUSE_BELIEF_PROVENANCE`
  (default true) so the producer is live wherever auto-extract runs.

## Data flow

```
agent turn → afterComplete auto-extract hook
  extractor → facts/preferences (inferences)
  persist(): for each stored key →
    upsertFact/upsertPreference (existing)         [the inference]
    + provenanceStore.record({ key, kind, value,    [the evidence pointer]
        learnedAt: now, sessionId, evidenceExcerpt }) (fail-open)
                         │
muse memory why <key> → provenanceStore.query(userId, key) → newest →
  "I remember <key>=<value> — learned <date> from your message: \"…\" (session …)"
```

## Error handling

- Store read: missing file → `[]`; corrupt → quarantine + `[]` (parity with veto store).
- `record` fail-open at the per-write boundary (the hook is already fail-open).
- `evidenceExcerpt` passes the existing secret redactor + control-char strip and
  is capped (160 chars) — a leaked credential or ANSI escape never reaches it.
- `muse memory why` with no store/file/record → friendly message, never throws.

## Testing & verification

1. `packages/memory` belief-provenance-store.test.ts: record→query newest-first,
   user-scoping, key filter (normalised), cap (oldest dropped), tolerant read of
   missing/corrupt file.
2. `packages/memory` auto-extract integration: with a `provenanceStore` injected,
   a stored fact records a matching provenance entry (right key/value/excerpt,
   sanitized); without the store ⇒ no provenance + memory write unchanged.
3. `apps/cli` memory `why` test: provenance present (formatted + `--json`),
   absent (friendly message), key normalisation.
4. `pnpm --filter @muse/{memory,cli,autoconfigure} test`, `pnpm lint` 0/0.
5. LIVE qwen3:8b end-to-end: a chat turn stating a fact → auto-extract (real
   model) records provenance → `muse memory why <key>` shows the learned-from
   evidence over the real `~/.muse/belief-provenance.json`.

## Decisions

- **Dedicated store, not a UserMemoryStore extension.** Matches Muse's
  per-concern JSON store pattern (veto / action-log / objectives / consents),
  keeps the provenance feature isolated and avoids rippling the 3 user-memory
  store impls + DB schema.
- **Evidence excerpt, not just an id.** "Learned from your message: '…'" is far
  more legible than a bare sessionId; both are recorded, the excerpt is
  sanitized + bounded.
- **Fail-open producer.** Provenance is an enhancement on top of the memory
  write; it must never jeopardise the write or the run. Absent store ⇒ exact
  no-op, so smoke:live and un-wired deployments are unaffected.
- **CLI file surface.** The live producer + reader are the CLI daily-driver
  path, consistent with the C slice; server provenance is deferred.

## Acceptance check (the deliverable's proof)

- Green `@muse/memory` store + auto-extract-provenance tests and `apps/cli`
  `memory why` test.
- LIVE: a real qwen3:8b turn → provenance recorded → `muse memory why` surfaces
  the evidence.
- `pnpm lint` 0/0.
