# 343 — renderResponseFormatInstruction had zero test coverage

## Why

This iteration surveyed broadly and **verified-and-rejected**
several candidates as already-sound/mature rather than forcing a
change: the persona store (dangling-`activeId` warning is wired
into `persona list`/`show`), `closest-command` (a correct,
directly-tested two-row Levenshtein powering "did you mean"
across ~10 commands), `RuntimeAgentWorker` (a 3-line pure
delegation adapter — testing it would be a tautology), and
`buildMusePersona`/`formatCurrentContextLine` (defensive,
well-formed). The codebase is genuinely mature.

The one concrete, non-tautological gap is the testing.md lane:
`renderResponseFormatInstruction` (`@muse/prompts`) had **zero**
test references. It is the public dispatcher on the
structured-output prompt path:

```ts
if (responseFormat === "json") return renderJsonInstruction(responseSchema);
if (responseFormat === "yaml") return renderYamlInstruction(responseSchema);
return undefined;
```

It is load-bearing — `buildSystemPrompt` calls it for every
request, and it is **especially** critical on the Qwen
reasoning-off path, where structured output relies on this
prompt instruction (not native structured-output support). Its
contract has real, regressable properties that
`renderJsonInstruction`/`renderYamlInstruction`'s own tests do
**not** cover: the format → renderer mapping, schema
forwarding, verbatim (un-wrapped) delegation, and — the safety
one — `"text"`/`undefined` contributing **no** format
instruction (a free-text turn must never be told to emit
JSON/YAML). A future refactor that fell `"text"` through to the
JSON branch, or dropped schema forwarding, would silently
corrupt requests with nothing to catch it.

## Scope

Test-only. `packages/prompts/test/prompts.test.ts` — one new
`it` in the existing `describe("prompt instruction rendering")`
(import added):

- `"json"` (with & without schema) `=== renderJsonInstruction(…)`
  exactly (pins verbatim delegation + schema forwarding) and
  contains `"valid JSON only"`.
- `"yaml"` (with schema) `=== renderYamlInstruction(…)`,
  contains `"valid YAML only"`.
- `"text"` (even with a schema arg) → `undefined`;
  `undefined` → `undefined` (the no-instruction safety
  property).

No production code changed — this locks the existing contract.

## Verify

- `pnpm --filter @muse/prompts test` — 25 pass (was 24; +1).
  The existing `renderJsonInstruction`/`renderYamlInstruction`
  / exemplar / cache-boundary suites stay green.
- `pnpm check` — every workspace green (prompts 25, apps/cli
  581, apps/api 161, all packages). `pnpm lint` — exit 0. The
  goal-227 enforcement test (328) stays green.
- No real-LLM request/response path touched (deterministic
  prompt-string dispatch). The deterministic suite is itself
  the verification.

## Status

done — the structured-output prompt-instruction dispatcher now
has direct coverage of its format→renderer mapping, verbatim
schema-forwarding delegation, and the text/undefined
no-instruction safety property, closing an implicit-only-coverage
gap on a load-bearing prompt path. No behaviour changed; future
regressions now fail `pnpm check`.
