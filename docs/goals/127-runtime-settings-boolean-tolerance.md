# 127 — `RuntimeSettings.getBoolean` accepts common truthy / falsy spellings

## Why

`RuntimeSettings.getBoolean(key, default)` only recognised the
exact literal `"true"`. Any other value — `"1"`, `"yes"`, `"on"`,
`"True "` (trailing space), even `"false"` itself — returned
plain `false`, completely ignoring `defaultValue`. The admin who
set `webSearch.enabled = "1"` via `/api/admin/runtime-settings`
silently disabled the feature instead of enabling it.

JARVIS-class settings parsing accepts the spellings a human
naturally types and falls back to the caller's default when the
value is unrecognised (admin error → "I'll do what you originally
asked", not "I'll silently flip it to false").

## Scope

- `packages/runtime-settings/src/index.ts`:
  - New module-local helper `parseBooleanValue(value)`:
    - Whitespace-trimmed + lowercased.
    - `"true" / "1" / "yes" / "on"` → `true`.
    - `"false" / "0" / "no" / "off"` → `false`.
    - Anything else → `undefined` (caller falls back to default).
  - Exported public alias `parseBooleanSetting` for consumers
    wiring custom boolean-shaped settings to share the same
    parser.
  - `getBoolean` calls the helper and returns
    `parsed ?? defaultValue` — unrecognised values now respect
    the default instead of silently coercing to `false`.

## Verify

- Existing test extended in
  `packages/runtime-settings/test/runtime-settings.test.ts`:
  - `"1"` / `"Yes"` / `"on"` → `true`.
  - `"0"` / `"No"` / `"off"` → `false`.
  - `"maybe"` (unknown) → `defaultValue` (was silently `false`).
- `pnpm --filter @muse/runtime-settings test` — 9 tests pass.
- `pnpm check` exit 0; `pnpm lint` exit 0.
- `pnpm smoke:live` — 13/0 (runtime-settings drives webSearch.enabled
  on the request path; live round-trip confirms the parse change
  doesn't flip the live default).

## Status

done — admin-supplied boolean settings now behave the way an
admin expects.
