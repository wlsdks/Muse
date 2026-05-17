# 298 — prompt-leakage detector matched raw text (zero-width / homoglyph evasion)

(Note: this doc describes invisible/homoglyph chars by escape
notation only — never raw bytes in source/docs, per goal 227.)

## Why

`detectSystemPromptLeakage` (`@muse/policy`) flags a model
response that echoes the system prompt back — for a personal
JARVIS that prompt carries the user's persona / context /
memory, so a leak is a privacy breach. It was the **only** policy
guard that matched its regexes (and `canaryTokens`) against the
**raw** content. Every sibling — `findInjectionPatterns`,
`findPii`, `ToolOutputSanitizer.sanitize` — first canonicalises
via `normalizeForInjectionDetection` (NFKC + strip zero-width +
fold homoglyphs + decode entities + strip diacritics). This one
didn't, so the exact evasions those siblings defend against
worked here. Confirmed live:

- `my system<U+200B>prompt is ...` (zero-width split) → pre-fix
  `[]` (clean text → `my_system_prompt`).
- `[L<Cyrillic-a U+0430>nguage Rule]` → the homoglyphed marker
  evaded `prompt_section_marker`.
- canary `CANA<U+200B>RY123` (zero-width inside) → pre-fix `[]`
  (clean → `canary_token`).

The canary case is the worst: canary tokens are the
deterministic high-confidence leak signal, and a single
zero-width char defeated `content.includes(token)` entirely.

## Scope

`packages/policy/src/prompt-leakage.ts`:

- Import `normalizeForInjectionDetection` from
  `./injection-patterns.js` (same package, no cycle) and run
  `content` through it once; match the canary `includes` and all
  patterns against the normalised string — exactly the posture of
  every sibling guard. One short WHY comment records the
  user-context-leak rationale.

Behaviour-preserving for clean content: the normaliser is
identity for plain text without zero-width / homoglyph / entity /
diacritic (the same normaliser the goal 278 / 294 guards use, and
its identity-on-clean property is pinned by those suites).

## Verify

- `pnpm --filter @muse/policy test` — 56 pass (was 55; +1). New
  regression (adversarial chars built via `String.fromCharCode`,
  never raw bytes in source — goal-227 rule): a zero-width inside
  "prompt" still yields `my_system_prompt`; a Cyrillic-homoglyph
  section marker yields `prompt_section_marker`; a zero-width-
  split canary still yields `{canary_token, match:"CANARY123"}`;
  benign text stays `[]`. The existing canary / English / section
  / multilingual / no-false-positive tests stay green.
- `pnpm check` — every workspace green (policy 56, apps/cli 563,
  apps/api 160, all packages). `pnpm lint` — exit 0. Changed
  source byte-scanned ASCII-clean (no raw zero-width / homoglyph
  / control bytes).
- No real-LLM request/response path touched (deterministic
  security normalisation). A live Qwen run cannot reproduce an
  obfuscated prompt-leak echo on demand, so the deterministic
  regression is the rigorous verification — same stance as the
  security goals 294 / 278 / 268 / 269.

## Status

done — the prompt-leakage detector now canonicalises before
matching, closing the zero-width / homoglyph / entity evasion
(including the canary-token bypass) and bringing it in line with
every other policy guard. Clean-content detections are unchanged.
