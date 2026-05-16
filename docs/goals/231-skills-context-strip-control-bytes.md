# 231 — skills-context sanitizer must strip control / ANSI bytes too

## Why

The 5th and final prompt-context chokepoint with the
identical control-byte gap, closing the sweep started in
goals 227 (episodic), 228 (active-context), 229 (inbox +
attachment). `skills-context.ts:sanitizeInline` was
`value.replace(/\s+/gu, " ").trim()` — applied to skill
`emoji` / `name` / `description` / `requiresBins` /
`requiresAnyBins` before the `[Available Skills]`
system-prompt block.

`\s+` collapse neutralises a `\n[System Override]\n` splice
(the documented, tested concern — the module's own comment
already calls SKILL.md "a buggy or actively hostile file")
but does NOT match non-whitespace control bytes — ESC
(0x1b), the rest of C0 (0x00-0x08), C1 (0x80-0x9f), DEL
(0x7f). Skills are loaded from SKILL.md files on disk; a
hostile or buggy one (e.g. from a shared / installed skill
pack — a supply-chain-ish vector) could carry ANSI / control
bytes that survived the sanitiser and reached the model's
system prompt AND, raw, the user's terminal when the skills
catalog is printed (ANSI execution / title hijack).

## Scope

- `packages/agent-core/src/skills-context.ts`: compose the
  shared `stripUntrustedTerminalChars` (@muse/shared — already
  used by episodic-recall 227 / active-context 228 /
  inbox + attachment 229) into `sanitizeInline`, control bytes
  stripped first then the existing whitespace collapse + trim.
  Clean / whitespace-only inputs unchanged, so every existing
  newline-splice / clean-catalog test still passes; no
  duplicated regex. Identical shape to goals 227–229.
- `packages/agent-core/test/skills-context.test.ts`: new
  regression — a hostile SKILL.md entry with name / emoji /
  description / requiresBins carrying ESC / BEL / C1-CSI /
  NUL / DEL (built via `String.fromCharCode`, no raw bytes in
  source) AND the `\n[System Override]\n` splice. The rendered
  block must contain no byte in
  `0x00-0x08, 0x0b-0x1f, 0x7f-0x9f` and still only the one
  real `[Available Skills]` header line.

## Verify

- `pnpm --filter @muse/agent-core test` — 530 pass (1 new;
  existing skills newline-splice / clean-catalog tests
  unchanged → no regression).
- `pnpm check` exit 0; `pnpm lint` exit 0.
- Deterministic prompt-sanitiser: model invocation unchanged;
  the new test asserts the exact injected `[Available Skills]`
  text is control-byte-free via the public
  `renderSkillsCatalogSection` (authoritative per the testing
  rules). No smoke:live — same stance as 197 / 208 / 209 /
  227 / 228 / 229.

## Status

done — the control-byte-strip sweep is now complete across
ALL FIVE prompt-context chokepoints: episodic-recall (227),
active-context (228), inbox-context + attachment-context
(229), and skills-context (231). Every field that flows from
disk / external input into a system-prompt context block now
reuses the shared `stripUntrustedTerminalChars` and can no
longer carry ANSI / C0 / C1 / DEL bytes into the prompt or the
terminal; the `\n[System Override]` newline-splice defence is
preserved everywhere.
