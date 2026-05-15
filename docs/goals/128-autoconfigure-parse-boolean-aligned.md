# 128 — `autoconfigure.parseBoolean` aligned with goal-127 boolean contract

## Why

`parseBoolean(value, fallback)` is the canonical env-var boolean
parser in autoconfigure; every `MUSE_*` feature flag walks
through it. Two gaps vs. the goal-127 `RuntimeSettings.getBoolean`
contract:

- Truthy set was `{"1", "true", "yes"}` — missing `on`, which is
  the third common admin spelling. Asymmetric vs. the runtime-
  settings parser introduced in goal 127.
- Anything unrecognised (`"Treu"`, `"maybe"`, empty after trim)
  silently returned `false`, ignoring the caller's `fallback`.
  A typo'd `MUSE_PROACTIVE_AGENT_TURN=Treu` produced `false`
  regardless of whether the operator's default was true. The
  fallback exists to be the safe baseline — bypassing it on
  garbage input is the opposite of safe.

## Scope

- `packages/autoconfigure/src/env-parsers.ts` `parseBoolean`:
  - Whitespace-trim + lowercase the value.
  - `TRUTHY_ENV_VALUES = {true, 1, yes, on}` → `true`.
  - `FALSY_ENV_VALUES = {false, 0, no, off}` → `false`.
  - Anything else → `fallback`.
  - Identical semantics to goal-127 `parseBooleanSetting`; the
    two parsers no longer drift.

## Verify

- Existing assertions (`"yes" → true`, `"no" → false`) keep
  passing — the falsy-set widening preserves the previous
  negative answers.
- New `goal 128` test covers:
  - `on` / `1` / `True` / `  yes  ` (whitespace) → `true`.
  - `off` / `0` / `FALSE` → `false`.
  - `"maybe"` / `"Treu"` / `""` → fallback (not silent `false`).
- `pnpm --filter @muse/autoconfigure test` — 128 tests pass.
- `pnpm check` exit 0; `pnpm lint` exit 0.
- `pnpm smoke:live` — 13/0 (parseBoolean drives env-flag
  routing on the request path; live round-trip confirms the
  semantic change doesn't flip the live defaults).

## Status

done — env-var boolean parsing now matches the
runtime-settings parser one-for-one. Typo'd `MUSE_*` flags no
longer silently coerce to `false`.
