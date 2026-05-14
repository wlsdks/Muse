# 077 — muse metrics show — SLO + drift surface

## Why

runtimeAgentMetrics exposes SLO + drift + budget counters. Expose them
via a CLI for at-a-glance.

## Scope

- New subcommand muse metrics.
- Reads /api/admin/snapshot already exists; pretty-print.

## Verify

- cli +1 test.

## Status

done — new `muse metrics show [--json]` subcommand wraps the
already-exposed `GET /api/admin/muse/snapshot` endpoint. Pure
`formatMetricsSnapshot` renderer groups output by section
(slo / drift / token cost / budget) with a catch-all `other:`
block for fields it doesn't recognize, so a partial / forward-
compatible snapshot still surfaces every key without throwing.

Empty / non-object payloads fall through to a friendly
"observability is not configured" hint instead of producing a
blank table.

cli +1 unit test drives the formatter with a fixture covering
every known section + the stragglers bucket + the empty-input
fallback.
