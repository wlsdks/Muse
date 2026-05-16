# 267 — `muse show` was a silent no-op in Kitty

## Why

`muse show` renders an image inline by emitting the **iTerm2
OSC-1337** inline-image escape (`\x1b]1337;File=...`).
`detectInlineImageSupport` gated that on the terminal and
returned `true` for `TERM=xterm-kitty`:

```ts
const term = env.TERM?.trim() ?? "";
if (term.startsWith("xterm-kitty")) return true;
```

But Kitty does **not** implement the iTerm2 OSC-1337 protocol —
it has its own, incompatible terminal-graphics protocol
(`\x1b_G…`). So in Kitty `muse show <img>`:

1. emitted an OSC-1337 sequence Kitty ignores (nothing renders),
   **and**
2. because `inlineCapable` was `true`, **skipped** the
   `open` / `xdg-open` fallback that would have worked.

Net: a blank line, no image, no error, exit 0 — a silent no-op
for every Kitty user, while the command's own description claimed
"iTerm2/Kitty/WezTerm" support. Implementing Kitty's graphics
protocol is a feature; the bug is claiming support for a protocol
this command does not speak and thereby suppressing the working
fallback.

## Scope

`apps/cli/src/commands-show.ts`:

- `detectInlineImageSupport` now returns `true` **only** for
  `TERM_PROGRAM`s in the iTerm2-OSC-1337-honouring allow-list
  (iTerm.app / WezTerm / tabby / ghostty / vscode). The
  `xterm-kitty → true` branch is removed (and the now-unused
  `TERM` read), so Kitty falls through to the OS-viewer fallback
  — which renders the image. A one-line WHY comment records why
  Kitty is deliberately excluded.
- The command description no longer claims "Kitty"; it states the
  fallback covers Kitty (incompatible protocol).

The `xterm-kitty` branch only ever matched Kitty (WezTerm /
Ghostty / etc. are detected via `TERM_PROGRAM`), so removing it
loses no terminal this command can actually serve.

## Verify

- `pnpm --filter @muse/cli test` — 560 pass. The goal-096 test's
  assertion was correcting an expectation that pinned the bug
  (`xterm-kitty → true`); it now asserts `xterm-kitty → false`
  with a comment explaining the fallback rationale. iTerm.app /
  WezTerm / tabby / ghostty / vscode → `true` and
  Apple_Terminal / `{}` → `false` and the
  `buildIterm2InlineImageSequence` shape all stay green (no
  regression for terminals we can serve).
- `pnpm check` — every workspace green (apps/cli 560, apps/api
  155, all packages). `pnpm lint` — exit 0.
- No real-LLM request/response path touched (pure env →
  capability detection feeding a display command); the
  deterministic unit test is the rigorous verification.

## Status

done — Kitty users get the working OS-viewer fallback instead of
a silent blank: `muse show` no longer claims inline support for a
protocol it does not emit, so the fallback is no longer
suppressed. Terminals that honour iTerm2 OSC-1337 are unaffected.
