# 098 — `muse status` surfaces active persona slot + template

## Why

After goal 097, `MUSE_PERSONA` silently steers every persona-aware
subcommand — but `muse status` (the user's morning dashboard)
never showed which slot was active or which persona template
(`jarvis` / `casual` / `professional` / `default`, goal 094) was
prefacing each model call. Three different things are all called
"persona" in this repo:

1. The persona **template** (goal 094) — tone preamble stored in
   `~/.muse/persona.json`.
2. The persona **slot** (`work` / `home` / `hobby`) — multi-persona
   memory keying via `--persona` / `MUSE_PERSONA`.
3. The persona **memory** — facts / preferences for a given
   `user@slot` key.

`muse status` already surfaced #3. After this goal it surfaces #1
and #2 too, so the user can answer "which voice + which slot am I
in right now?" without spelunking through env + persona.json.

## Scope

- `collectStatus()` now reads `~/.muse/persona.json` via
  `readPersonaStore` and resolves the active multi-persona slot
  via `resolvePersona(undefined)`. (Status has no `--persona`
  flag, so the slot is env-only here; the `slotSource` field
  records the env name so future flag support is additive.)
- The `persona` JSON block gains:
  - `slot?: string` + `slotSource?: "MUSE_PERSONA"` when set.
  - `template: { activeId, isBuiltin, preambleBytes, description? }`
    — `description` is filled from `BUILTIN_PERSONAS` for built-in
    ids; absent for custom personas.
- The text renderer adds at most two new lines under `  user:`:
  - `    slot: work (from MUSE_PERSONA)` when a slot is active.
  - `    template: jarvis (built-in, NNN-byte preamble)` when the
    active template isn't `default` or has a non-empty preamble.
- Additive JSON change — `schemaVersion` stays at `1` (no fields
  renamed or removed).

## Verify

- `pnpm --filter @muse/cli test` — 276 tests pass (one new
  asserting both `--json` shape and human text).
- `pnpm check` — full build + every workspace test passes.
- `pnpm lint` — clean.
- No real-LLM path touched, so `smoke:live` is skipped.

## Status

done — `MUSE_PERSONA=work muse status` now prints the slot and the
active template id alongside the existing facts / prefs / vetoes
summary.
