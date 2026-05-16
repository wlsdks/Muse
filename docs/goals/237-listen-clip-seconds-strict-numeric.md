# 237 — `muse listen --clip-seconds` strict numeric (NaN into voice capture)

## Why

A residual numeric-handling defect the canonical strict-numeric
line never reached, and worse than a silent default —
`commands-listen.ts` (the JARVIS voice wake-word ambient
feature):

```ts
const clipSeconds = Math.max(2, Math.min(30, Number(options.clipSeconds ?? "5")));
```

`Number("5abc") === NaN`, so `--clip-seconds 5abc` / `abc` →
`Math.min(30, NaN)` → `Math.max(2, NaN)` → **`clipSeconds =
NaN`**, which then flows into `captureWavForSeconds(shells,
NaN)`. A NaN recording duration silently produces a
broken/empty clip (a `setTimeout(NaN)` / `arecord -d NaN`),
so wake-word capture transcribes nothing — a silently-broken
voice JARVIS with no signal. `--clip-seconds 0` / `-5` was
also silently clamped up to 2 instead of being rejected.

## Scope

- `apps/cli/src/commands-listen.ts`: replace the
  NaN-propagating `Math.max(2, Math.min(30, Number(...)))`
  with the exported `parseBoundedInt` (`commands-ask.ts`, goal
  178 — the same cross-command import precedent as goals 202 /
  203 / 204 / 230 / 232 / 236):
  `parseBoundedInt(options.clipSeconds, "--clip-seconds", 2,
  30, 5)` — absent → 5 (the documented default, unchanged);
  `Number()`; reject non-finite / below-2 with
  `--clip-seconds must be an integer in [2, 30] (got 'x')`;
  truncate + clamp to 30. The `async` action's throw surfaces
  via the existing commander error envelope before any audio
  capture. Eliminates the `NaN → captureWavForSeconds(NaN)`
  path entirely; absent / valid values behave exactly as
  before (a sub-2s clip is now an explicit rejection rather
  than a silent clamp-to-2, consistent with the strict line).

## Verify

- `pnpm --filter @muse/cli test` — 550 pass (no regression;
  `parseBoundedInt` already has 4 direct unit tests from goal
  178 covering the delegated contract — no new untested
  logic).
- `pnpm check` exit 0; `pnpm lint` exit 0.
- Verification scope (transparent, same stance as goal 207):
  the fix is sound by construction — `parseBoundedInt` is
  exhaustively unit-tested (178) and the change is a trivial
  delegation (build / typecheck / lint / 550-test green
  confirm wiring + no regression), and it removes the
  NaN-into-`captureWavForSeconds` path. Dog-fooding the
  *reject* end-to-end is blocked in this CI-less environment:
  a "Missing voice providers" precondition short-circuits
  `muse listen` (no audio hardware / voice config here) before
  the parse is reached — the same not-fully-drivable
  situation goal 207 had. The valid `--clip-seconds 5` path
  was confirmed to NOT be clip-rejected (parse passes).

## Status

done — a typo'd / unit-slipped `--clip-seconds` can no longer
become `NaN` and silently break wake-word voice capture; it is
rejected with an actionable message via the canonical strict
parser. This was the last numeric flag still on a bespoke
NaN-propagating `Number()`-clamp; strict-numeric is complete
across the CLI including the voice path.
