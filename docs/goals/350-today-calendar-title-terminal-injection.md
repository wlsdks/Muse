# 350 — `muse today` printed third-party calendar event titles raw to the terminal

## Why

Continuation of the terminal-injection hardening (346 inbox,
347 feeds). This iteration first **verified-and-rejected** the
goal-349 follow-up: the OpenAI-compat path not disabling qwen3
reasoning is a *documented deliberate design*
(`adapter-ollama.ts:8-11`: native `/api/chat` is "the only way
to suppress reasoning", which is exactly why `OllamaProvider`
always overrides to native) — not a latent bug. Also confirmed
`commands-search` genuinely *applies* the strip (human + LLM
paths), so the posture's named trio is truly complete.

The strongest remaining concrete vector: a **calendar event
title**. A meeting-invite `SUMMARY` is set by **whoever sent
the invite** (CalDAV / Google / macOS shared calendars) — you
don't choose who invites you, the canonical "third party
controls the bytes" case, exactly like inbound messages (346)
and RSS feeds (347). `commands-today.ts`'s `formatEvents`
rendered:

```ts
events.map((event) => `  - ${event.startsAtIso.slice(11,16)} — ${event.title}`)
```

— `event.title` printed **raw** to `io.stdout` (the file
imported only `redactSecretsInText`, no terminal-char strip). A
hostile calendar invite with ANSI escapes in its title
**hijacks the terminal** every time the user runs `muse today`.
Tasks / reminders / followups in the same render are
**user-authored** (the user types them — not an external threat
model), so the fix is correctly scoped to the genuine
third-party field.

## Scope

`apps/cli/src/commands-today.ts` — `formatEvents` (now
exported for direct testing, the goal-346/347 pure-helper
pattern):

- `event.title` runs through `stripUntrustedTerminalChars(t)
  .replace(/\s+/gu, " ").trim()` — identical treatment to
  inbox / feeds / search — before composing the line.
  `stripUntrustedTerminalChars` added to the existing
  `@muse/shared` import. One short WHY comment (the
  invite-SUMMARY-is-third-party rationale, non-derivable).

Behaviour-preserving for clean titles (whitespace-collapse +
trim only); the not-configured / empty-window states are
unchanged. Tasks/reminders/followups/notes formatters left
alone — they render user-authored text, outside the threat
model, and widening would be scope the bug doesn't require.

## Verify

- `commands-today.test.ts` (already existed for
  `parseLookaheadHours`) — +2 cases: a title with
  `ESC[2J ESC]0;… BEL …\nsecond line` → the rendered block has
  **no** C0/C1/DEL byte (code-point predicate; ESC/BEL via
  `String.fromCharCode` — goal-227 safe), the visible text
  survives collapsed to one line; a clean event is
  byte-identical and the not-configured / empty states are
  preserved (no regression).
- `pnpm --filter @muse/cli test` — 597 pass (+2). `pnpm check`
  — every workspace green (apps/cli 599 incl. the test/ glob,
  apps/api 161, all packages). `pnpm lint` — exit 0. The
  goal-227 enforcement test (328) stays green; the test file
  self-scans clean.
- No real-LLM request/response path touched (deterministic
  terminal-output sanitisation of the structured display
  path). The deterministic suite — including the explicit
  no-control-byte assertion — is the rigorous verification.

## Status

done — `muse today` now strips ESC/C0/C1/DEL from
third-party calendar event titles before printing, closing the
calendar-invite terminal-injection vector. The
untrusted-text-to-terminal boundary is now sanitised across
inbound messages (346), RSS feeds (347), web search, and
calendar titles (350) — every surface where a non-user third
party controls text that Muse prints.
