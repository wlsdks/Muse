# 228 — active-context sanitizer must strip control / ANSI bytes too

## Why

The goal-227 bug class in its highest-leverage sibling.
`sanitizeInline` (`active-context.ts`) is the prompt-injection
/ terminal-safety chokepoint for the `[Active Context]`
system-prompt block — applied to the active task title / id /
dueIso, `current_focus`, and every imminent calendar event
title / location and reminder text. It was identical to the
pre-227 episodic sanitiser:

```ts
return value.replace(/\s+/gu, " ").trim();
```

`\s+` collapse neutralises a `\n[System Override]\n`
section-header splice (the documented, tested concern) but
does NOT match non-whitespace control bytes — ESC (0x1b),
the rest of C0 (0x00-0x08), C1 (0x80-0x9f), DEL (0x7f).

Higher leverage than episodic-recall (227):

- the `[Active Context]` block is injected into **every**
  agent turn's system prompt;
- one of its fields is the **calendar event title**, which is
  **externally controllable** — anyone who can send the user
  a meeting invite can title it with ANSI / control bytes. A
  poisoned invite title (`ESC ] 0 ; ... BEL`, `ESC [ 2 J`)
  survived the sanitiser and reached the model's system
  prompt AND, raw, the user's terminal when active-context is
  printed (ANSI execution / title hijack).

The codebase already has the canonical
`stripUntrustedTerminalChars` (@muse/shared) for exactly the
`0x00-0x08, 0x0b-0x1f, 0x7f-0x9f` range; active-context just
wasn't using it.

## Scope

- `packages/agent-core/src/active-context.ts`: compose the
  shared `stripUntrustedTerminalChars` (a confirmed
  `@muse/shared` dependency, now also used by
  episodic-recall) with the existing whitespace collapse —
  control bytes removed first, then `\s+` collapse + trim.
  Clean / whitespace-only inputs unchanged, so every existing
  newline-splice / calendar / render test still passes; no
  duplicated regex (reuses the chokepoint). Mirrors goal 227.
- `packages/agent-core/test/active-context.test.ts`: new
  regression — a poisoned **calendar invite title** (the
  external vector) + active task carrying ESC / BEL / C1-CSI /
  NUL / DEL (built via `String.fromCharCode`, no raw bytes in
  source) AND the `\n[System Override]\n` splice. The rendered
  block must contain no byte in the
  `0x00-0x08, 0x0b-0x1f, 0x7f-0x9f` range and still only the
  one real `[Active Context]` header line.

## Verify

- `pnpm --filter @muse/agent-core test` — 527 pass (1 new;
  existing active-context / calendar / newline-splice tests
  unchanged → no regression).
- `pnpm check` exit 0; `pnpm lint` exit 0.
- Deterministic prompt-sanitiser: model invocation unchanged;
  the new test asserts the exact injected `[Active Context]`
  text is control-byte-free via the public
  `renderActiveContextSection` (authoritative per the testing
  rules). No smoke:live — same stance as the deterministic
  prompt-sanitisation goals 197 / 208 / 209 / 227.

## Status

done — an externally-controllable calendar-invite title (or a
poisoned task / focus / reminder) can no longer carry ANSI /
C0 / C1 / DEL bytes into the `[Active Context]` system-prompt
block or the terminal; the `\n[System Override]` newline-splice
defence is preserved. Both the active-context (228) and
episodic (227) prompt-context chokepoints now reuse the shared
`stripUntrustedTerminalChars`.
