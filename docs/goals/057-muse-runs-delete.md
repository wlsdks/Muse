# 057 — muse runs delete <run-id> — admin cleanup

## Why

AgentRunHistoryStore has no public delete path through the CLI. Add it
for operator cleanup.

## Scope

- New subcommand under muse runs.
- API + Kysely delete path.
- --before <iso> for bulk.

## Verify

- cli + api tests.

## Status

done — new API + CLI surface:

  - `DELETE /api/admin/runs/:runId` removes a single run via the
    pre-existing `AgentRunHistoryStore.deleteRun` (already
    implemented on both InMemory + Kysely stores). Returns
    `{ deleted, runId }` on success or 404 `RUN_NOT_FOUND`.
  - `DELETE /api/admin/runs?before=<iso>` bulk-deletes every run
    whose `startedAt` is ≤ the cutoff. Runs without a recorded
    startedAt are treated as old enough to delete (conservative
    fallback). Returns `{ before, deleted, scanned }`.
    Missing `before` → 400 `MISSING_BEFORE`. Bad ISO → 400
    `INVALID_BEFORE`.
  - `muse runs delete <run-id>` and
    `muse runs delete --before <iso>` wrap both endpoints.

api +2 tests: single-run delete + 404 round-trip, bulk
parameterised by cutoff (only the old row deletes, recent
survives). The pre-existing `deleteRun` store method already
had its own coverage in `runtime-state`.
