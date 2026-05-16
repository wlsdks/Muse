# 276 — math_eval silently truncated a multi-dot number literal instead of erroring

## Why

`math_eval` is the agent's calculator — a personal assistant
reaches for it on "what's 15% of 240?", and its result is relayed
to the user as fact. The hand-rolled recursive-descent evaluator's
`parseNumber` greedily consumes a `[0-9.]+` run, then:

```ts
const literal = stripped.slice(start, cursor);
const value = Number.parseFloat(literal);
if (Number.isNaN(value)) throw new Error(`invalid number literal: ${literal}`);
```

The upstream `MATH_EXPRESSION` gate (`/^[\s\d+\-*/().,%]+$/u`)
only checks the *character set*, not number well-formedness, so a
malformed literal like `1.2.3` reaches `parseNumber`. **`parseFloat`
truncates it** — `Number.parseFloat("1.2.3") === 1.2` (not `NaN`),
so the `Number.isNaN` guard never fires, the trailing `.3` is
silently dropped, and `math_eval` returns a confident **wrong**
result: `"1.2.3"` → `{ result: 1.2 }`, `"3.14.15 * 2"` →
`{ result: 6.28 }`. A wrong number reported as fact with no error
is the worst failure mode for a calculator and the exact
silent-wrong class goals 261 / 274 / 275 keep closing.

## Scope

`packages/tools/src/muse-tools-data.ts` — `parseNumber` inside
`evaluateArithmetic`:

- `Number.parseFloat(literal)` → `Number(literal)`. `Number` is
  strict: `Number("1.2.3")` and `Number("1..2")` are `NaN`, so the
  **existing** `Number.isNaN` guard now correctly throws
  `invalid number literal: …` and the error flows through the
  tool's existing `catch` → `{ error }`. One-line WHY comment
  records the non-derivable parseFloat-vs-Number rationale.

No regression for any valid literal: the consumed run is only
`[0-9.]` (commas are pre-stripped, whitespace excluded by the
slice), and for every well-formed such string `Number` and
`parseFloat` agree — `Number(".5")` = 0.5, `Number("5.")` = 5,
`Number("007")` = 7. There is no valid `[0-9.]+` literal that
`parseFloat` parses correctly but `Number` rejects; the only
behaviour change is malformed multi-dot literals going from
silently-truncated to a clean error. One token changed.

## Verify

- `pnpm --filter @muse/tools test` — 66 pass (1 skipped). The
  existing precedence / parentheses / `%` / thousands-comma and
  reject-unsafe-chars / divide-by-zero assertions stay green and
  now also assert: `"1.2.3"` and `"3.14.15 * 2"` return an
  `invalid number literal` error (pre-fix: `1.2` / `6.28` —
  silently wrong); `.5 + 5.` = 5.5 and `007 + 1` = 8 still
  evaluate (no valid-input regression).
- `pnpm check` — every workspace green (tools 66, apps/cli 561,
  apps/api 160, all packages). `pnpm lint` — exit 0.
- No real-LLM request/response path touched (deterministic
  arithmetic-parser correctness). A live Qwen run cannot
  reproducibly emit a multi-dot literal on demand, so the
  deterministic unit tests are the rigorous verification — same
  stance as goals 261 / 274 / 275.

## Status

done — `math_eval` now rejects a malformed multi-dot number
literal with a clear `invalid number literal` error instead of
silently truncating it via `parseFloat` and returning a confident
wrong result. Every valid expression evaluates exactly as before.
