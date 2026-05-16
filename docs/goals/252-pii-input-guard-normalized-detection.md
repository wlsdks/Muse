# 252 — PII input guard could be evaded by zero-width / homoglyph splitting

## Why

Sibling of goal 251 in the security-primitive layer. The
fail-close `pii-input-guard` (`createPiiInputGuard`) detected PII
via `maskPii(joinMessages(...)).findings`. `maskPii` runs the
patterns on the **raw** text — deliberately, because it also
rewrites content (the output-mask guard) and normalising before
substitution would corrupt legitimate output.

But the *input* guard only needs to know whether PII is present —
it fail-close blocks the whole request, it never uses the masked
text. Running the regexes on raw text meant the same evasion class
goal 251 closed for injection applied here: a zero-width space, a
homoglyph digit, an NFKC compatibility form, or an HTML-entity
inside an SSN / card / KR-RRN (`123\u200b-45\u200b-6789`,
`123&#x200b;-45-6789`, fullwidth-digit card) sailed straight past
`\d{3}-\d{2}-\d{4}` etc. — a trivially automatable bypass that
let PII through the guard that exists to stop it.

## Scope

- `packages/policy/src/pii-patterns.ts`: new exported `findPii` —
  detection-only, runs the patterns over
  `normalizeForInjectionDetection(text)` (the same canonicaliser
  the injection detector uses: decode entities → NFKC → strip
  zero-width → fold homoglyphs/diacritics). It returns findings
  only and never rewrites text, so it is safe to normalise.
  `maskPii` is intentionally left untouched — it must keep
  operating on raw text so the output-mask guard does not corrupt
  legitimate content.
- `packages/agent-core/src/guards.ts`: `createPiiInputGuard` now
  calls `findPii(...)` instead of `maskPii(...).findings`. The
  output-mask guard (`createPiiMaskingOutputGuard`) still uses
  `maskPii` unchanged.

Scope is deliberately the input guard only. Correctly masking
*obfuscated* PII in model output (span-preserving redaction
across a normalise↔original mapping) is a larger design problem
and is explicitly out of scope here — the high-leverage, safe win
is the fail-close input guard, where detection-time normalisation
cannot corrupt anything.

## Verify

- `pnpm --filter @muse/policy test` — 53 pass (was 52; +1). New
  test asserts `findPii` flags a zero-width-split SSN, a
  fullwidth-digit credit card (built via `String.fromCodePoint`,
  zero-width via `\u200b` — no raw non-ASCII in source), an
  entity-encoded-zero-width SSN, a plain SSN (parity with
  `maskPii` detection), and yields `[]` on ordinary text (no
  false positive).
- `pnpm check` — every workspace green (policy 53, agent-core
  533, apps/api 155, apps/cli 555, all packages). The existing
  agent-core "blocks private identifiers through a default input
  guard" test still passes (plain email is unchanged by
  normalisation → still `PII_DETECTED`). A narrow agent-core-only
  run first showed a spurious `GUARD_ERROR` from an un-rebuilt
  `@muse/policy` dist (`findPii` absent → `TypeError`); the
  build-ordering `pnpm check` is green — code was correct, the
  narrow run was stale-dist, not a bug.
- `pnpm lint` — exit 0.
- No real-LLM request/response path touched (deterministic
  security primitive). The threat is an adversarial input a benign
  turn never produces, so the deterministic unit test injecting
  the exact bypass strings is the rigorous verification — the same
  stance the 227-251 security-transform work used.

## Status

done — a zero-width / homoglyph / NFKC / HTML-entity-obfuscated
identifier can no longer slip PII past the fail-close PII input
guard. Detection now runs on the same canonicalised text the
injection guard uses, while `maskPii`'s raw-text rewrite path is
preserved so legitimate output is never corrupted.
