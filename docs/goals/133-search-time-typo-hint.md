# 133 — `muse search --time <typo>` rejects with closest-match hint

## Why

`muse search --time weak` (typo for `week`) silently dropped the
filter — `normaliseTimeRange` in the MCP server returns
`undefined` for unknown input so an LLM passing garbage doesn't
crash the tool call. On the CLI a typo is a real user error: the
user thinks they filtered to last week's results and gets the
full undated set.

JARVIS-class: surface the gap with a closest-match hint, same
shape as goals 099 / 100 / 118 / 119 / 124 / 125 / 131 / 132.

## Scope

- `packages/mcp/src/index.ts` re-exports `normaliseTimeRange` so
  the CLI can reuse the canonical normaliser instead of cloning
  the accepted set.
- `apps/cli/src/commands-search.ts`:
  - New `TIME_RANGE_FORMS` literal mirrors the normaliser's
    accepted spellings (canonical + every shortcut).
  - Validates `--time` up-front: if `normaliseTimeRange` returns
    `undefined` for a non-empty input, throw with the
    `closestCommandName` hint.
  - Loopback server stays lenient (LLM-friendly); only the CLI
    tightens up.

## Verify

- New `apps/cli/test/program.test.ts` case pins:
  - `--time weak` → `did you mean 'week'?`.
  - `--time months` (plural slip) → `did you mean 'month'?`.
  - `--time totally-unrelated` → "must be one of …" without a
    false-positive suggestion.
- `pnpm --filter @muse/cli test` — 354 tests pass.
- `pnpm check` exit 0; `pnpm lint` exit 0.
- No real-LLM path touched.

## Status

done — `muse search --time` joins the rest of the
typo-suggestion line.
