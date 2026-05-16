# 224 — `muse proactive watch` cadence flags strict numeric

## Why

`muse proactive watch` is the anticipatory-surfacing daemon —
it ticks every `--interval` seconds and fires notices for
events within `--lead-minutes`. Both flags used the
silent default-fallback anti-pattern the strict-numeric line
(177 / 178 / 179 / 184 / 188 / 192 / 215) removed everywhere
else:

```ts
const interval   = Math.max(5, Number.parseInt(options.interval, 10) || 60);
const leadMinutes = Math.max(1, Number.parseInt(options.leadMinutes, 10) || 10);
```

`Number.parseInt("30abc", 10) === 30`, so
`muse proactive watch --interval 30abc` **silently** ran the
daemon ticking every 30 s; `--interval abc` / `--lead-minutes
0` **silently** became 60 / 10. For the daemon whose entire
job is to surface things *at the right time*, a
silently-wrong cadence is a silently-wrong JARVIS — the user
gets notices at an interval/look-ahead they never asked for,
with no signal anything was misparsed. `commands-proactive.ts`
also had **zero direct test coverage**.

## Scope

- `apps/cli/src/commands-proactive.ts`: add an exported
  `parseBoundedFlag(raw, flag, min, max, fallback)` mirroring
  `commands-ask.ts`'s `parseBoundedInt` (goal 178) —
  absent/blank → fallback; `Number()` (not `parseInt`);
  reject non-finite / below-min with
  `<flag> must be an integer in [min, max] (got 'x')`;
  truncate + clamp to max. Wire the `watch` daemon's two
  cadence flags: `--interval` → `[5, 86400]` (5 s … 1 day),
  `--lead-minutes` → `[1, 1440]` (1 min … 24 h). The action
  is `async`, so a throw surfaces through the existing
  commander error envelope and the daemon never starts on a
  bad flag. Helper added locally (per the per-command
  convention used by 192/198/199), exported for direct unit
  coverage (the command had none).
- New `apps/cli/src/commands-proactive.test.ts`: absent →
  fallback, truncate + clamp-to-max, and rejection of
  `30abc` / `abc` / below-min / `0` / `-5` / `1O`.

Scoped to the `watch` daemon's two timing flags (the
JARVIS-core, highest-impact pair). The one-shot `scan
--lead-minutes` and the `--limit` list flag have the same
pattern but are lower leverage — left as a follow-up to keep
this tight; the helper is exported and ready for them.

## Verify

- `pnpm --filter @muse/cli test` — 534 pass (new test file).
- `pnpm check` exit 0; `pnpm lint` exit 0.
- Dog-fooded the real command (parsing is pre-daemon;
  deterministic, same stance as the rest of the strict line):
  - `muse proactive watch --interval 30abc …` → stderr
    `muse: --interval must be an integer in [5, 86400] (got
    '30abc')`, exit **1**, daemon never starts (was: silent
    30 s tick).
  - `muse proactive watch --lead-minutes 0 …` → stderr
    `muse: --lead-minutes must be an integer in [1, 1440]
    (got '0')`, exit **1** (was: silent 10).

## Status

done — the proactive daemon's interval / lead-minutes can no
longer be silently wrong from a typo or unit slip; a bad
cadence flag is rejected with an actionable message before the
daemon starts, and the command finally has direct unit
coverage. The `scan`/`--limit` flags remain a noted follow-up.
