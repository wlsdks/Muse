# 184 — `muse job list --limit` strict numeric

## Why

`muse job list` resolved `--limit` as
`Math.max(1, Math.min(200, Number.parseInt(options.limit, 10)
|| 20))`. `Number.parseInt` is a forgiving prefix parse, so
`--limit 20x` silently became 20 and `--limit abc` silently
20 — the silent-numeric anti-pattern already fixed across the
CLI in goals 143 / 144 / 155 / 177 / 178 / 179. The job
family (goals 150–152) was the remaining daily surface still
masking the user's intent here.

## Scope

- `apps/cli/src/commands-jobs.ts`:
  - New exported `parseJobListLimit(raw)`: blank → 20
    (commander default, unchanged); a genuine number is
    truncated + clamped to `[1, 200]`; a non-numeric /
    non-positive value throws `--limit must be a positive
    number (got '<raw>')`. `--limit 999` still clamps to 200,
    only garbage rejects. Local per-command helper (matches
    goal 177 `parseLimit` / goal 179 `clampLimit` — three
    similar lines beat a premature shared abstraction).
- `apps/cli/src/commands-jobs.test.ts`: 3 new cases —
  blank→20, valid+trunc+clamp, unit-slip/non-numeric/
  non-positive throw.

## Verify

- `pnpm --filter @muse/cli test` — 470 pass (3 new).
- `pnpm check` exit 0; `pnpm lint` exit 0.
- No real-LLM path touched (pure numeric parsing; smoke:live
  not required).

## Status

done — every daily CLI numeric flag I've audited now rejects a
fat-fingered value instead of silently substituting a default;
the strict-numeric line is consistent across feeds / session /
maintenance / pattern / ask / recall / job list.
