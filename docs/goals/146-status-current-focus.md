# 146 — `muse status` surfaces `persona.currentFocus`

## Why

The `current_focus` memory entry (preference first, fact
fallback) flows into the agent's `[Active Context]` block via
`DefaultActiveContextProvider` (active-context.ts line 174), so
every model turn reads "what is the user working on?". The user
never saw it surfaced in their own dashboard, though — `muse
status` showed counts and slot/template metadata but didn't echo
the focus string. JARVIS-class: when the user asks "what am I
working on?" the dashboard tells them, no `muse memory show`
plumbing required.

## Scope

- `apps/cli/src/commands-status.ts`:
  - `collectStatus` extracts `persona.preferences.current_focus`
    (priority) then `persona.facts.current_focus` (fallback),
    trimming and dropping empty / whitespace-only values. Same
    precedence the active-context resolver uses.
  - Conditionally adds `currentFocus: string` to the `persona`
    block (omitted when missing — no `"(none)"` filler).
  - Text renderer prints `    current focus: <value>` under the
    template line when set.
- Additive only — `schemaVersion` stays at `1`.

## Verify

- New `apps/cli/test/program.test.ts` case:
  - Preferences set → `currentFocus` returns the preference
    value (wins over the facts side).
  - Facts-only fallback works.
  - Missing → field omitted from JSON.
  - Text render line `current focus: <value>` present when set.
- `pnpm --filter @muse/cli test` — 362 tests pass.
- `pnpm check` exit 0; `pnpm lint` exit 0.
- No real-LLM path touched.

## Status

done — `muse status` now answers "what am I working on?" the
same way the agent already sees it via `[Active Context]`.
