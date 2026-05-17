# 304 — structured-output extractor used first-opener→last-closer (300 sibling)

## Why

`normalizeStructuredOutput` (`@muse/policy`) is the
architecture-mandated fallback parser for structured responses
("If structured output is unavailable → parser + validator").
Its `extractJsonCandidate` recovered prose-embedded JSON with a
crude span:

```ts
const start = first index of `{` or `[`;
const end   = trimmed.lastIndexOf(closer);   // last `}` / `]`
return trimmed.slice(start, end + 1);
```

First-opener → **last**-closer is the same small-model
fragility goal 300 fixed in `memory-auto-extract`: a small local
Qwen routinely trails an example or a note (`{...} For example
{...}`), so the span engulfs the prose between two objects, the
slice is unbalanced, `JSON.parse` throws, and the model's valid
structured answer is **silently rejected** (`normalized: false`)
— the whole point of the fallback parser defeated. A `}` *inside
a JSON string value* could likewise be picked as the closer.

## Scope

`packages/policy/src/structured-output.ts` —
`extractJsonCandidate`:

- Keep the clean / clearly-JSON fast path
  (`trimmed.startsWith("{" | "[")` → return as-is) **unchanged**
  — zero behaviour change for clean or already-JSON input,
  including the truncated `{"ok":` fail-open case.
- For the prose-embedded path, replace the last-closer heuristic
  with `firstBalancedJsonBlock(trimmed, start)`: scan from the
  first opener tracking `{`/`[`/`}`/`]` depth, string state, and
  escapes; return the first value that closes to depth 0 (goal
  300's pattern, extended to handle `[]` and mixed nesting).
  One short WHY comment records the trailing-example rationale.

Behaviour-preserving for every existing case (clean fenced /
single prose-embedded object / invalid truncated / YAML); only
the trailing-blob / string-internal-brace cases — previously
silent rejections — now extract correctly.

## Verify

- `pnpm --filter @muse/policy test` — 59 pass (was 56; +3). New:
  `Result: {"answer":42}. For example {"answer":0}` → normalizes
  to the first object (pre-fix: invalid → rejected); a
  prose-embedded array with a trailing `[9]` blob normalizes to
  `[1,2,3]`; a `}` inside a JSON string value no longer closes
  the value early. The existing fenced / prose / fail-open /
  YAML tests stay green.
- `pnpm check` — every workspace green (policy 59, apps/cli
  563, apps/api 161, all packages). `pnpm lint` — exit 0.
- Real-LLM path touched (the fallback parser consumes the
  model's response) → dog-fooded a real Qwen round-trip:
  `OllamaProvider` `qwen3:8b` (`127.0.0.1:11434`, `think:false`,
  no paid key) asked for a JSON object plus an explanation +
  example → qwen3:8b returned fenced JSON followed by
  `**Explanation:** … **Example:** …` prose;
  `normalizeStructuredOutput(..., "json")` returned
  `normalized: true` with exactly `{"name":"Stark","active":true}`
  and no error — confirming end-to-end on the real small-model
  output shape this fix targets; the trailing-blob / in-string
  edges are pinned by the deterministic regressions.

## Status

done — the structured-output fallback parser now extracts the
first balanced JSON value instead of an opener→last-closer span,
so a small local model trailing an example/note no longer
silently makes its valid structured answer fail to parse. The
clean / fenced / invalid / YAML paths are unchanged. Closes the
naive-JSON-extraction class on the second of the two extractor
sites (memory-auto-extract 300, structured-output 304).
