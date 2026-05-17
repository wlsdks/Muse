# 347 — `muse feeds recent` printed third-party feed text raw to the terminal

## Why

Direct sibling of goal 346, found by sweeping the CLI for the
same class: which external-content commands import
`stripUntrustedTerminalChars`? `commands-search` / `glance` /
`messaging` (post-346) do; **`commands-feeds` did not** — and
the established posture (goal-089 glance comment) names exactly
"feeds / inbox / search" as the surfaces that must strip.

`apps/cli/src/commands-feeds.ts` (the `recent` action)
rendered:
```ts
io.stdout(`[${entry.feedId}] ${entry.title} — ${entry.publishedAt || "(no date)"}\n`);
if (entry.link) io.stdout(`  ${entry.link}\n`);
```
`title` / `link` / `publishedAt` come straight from a
third-party RSS/Atom feed — the feed author has **full
control** over them (it's the canonical "you subscribe to a URL,
a stranger controls the bytes" surface). A hostile or
compromised feed embedding ANSI escapes in `<title>` /
`<link>` (clear-screen, set-terminal-title, OSC-8 hyperlink
spoofing, cursor / false-output injection) **hijacks the user's
terminal** the moment they run `muse feeds recent`. The file
imported nothing from `@muse/shared` — zero sanitisation on
this boundary.

## Scope

`apps/cli/src/commands-feeds.ts`:

- New exported pure `formatFeedEntryLines(entry)` — applies the
  established `stripUntrustedTerminalChars(v).replace(/\s+/gu,
  " ").trim()` treatment (identical to inbox / search) to
  `feedId`, `title`, `link`, `publishedAt` before composing the
  1–2 output lines. The `recent` loop is now
  `for (const line of formatFeedEntryLines(entry)) io.stdout(…)`.
  Exported pure (the goal-089 / 346 boundary-helper pattern) so
  the security boundary is directly unit-tested.
- The `--json` path is untouched: `JSON.stringify` escapes
  control bytes to `\u00xx` so they never reach the terminal as
  active escapes — fix correctly scoped to the human listing
  (same scoping as 346).

Behaviour-preserving for clean entries (whitespace-collapse +
trim only, and the empty-`publishedAt` → `(no date)` fallback
is preserved); only control/ESC bytes and multi-line sprawl
change.

## Verify

- `commands-feeds.test.ts` (already existed for `slugifyUrl`) —
  +3 cases: a feed entry with `ESC[2J ESC]0;… BEL …` title and
  an ESC in `link` → joined output has **no** C0/C1/DEL byte
  (code-point predicate; ESC/BEL via `String.fromCharCode` —
  goal-227 safe) and the visible headline survives; multi-line
  title collapses to one line and blank `publishedAt` →
  `(no date)`; a clean entry is byte-identical (no regression).
- `pnpm --filter @muse/cli test` — 592 pass (+3). `pnpm check`
  — every workspace green (apps/cli 595 incl. the test/ glob,
  apps/api 161, all packages). `pnpm lint` — exit 0. The
  goal-227 enforcement test (328) stays green; the test file
  self-scans clean.
- No real-LLM request/response path touched (deterministic
  terminal-output sanitisation). The deterministic suite —
  including the explicit no-control-byte assertion — is the
  rigorous verification.

## Status

done — `muse feeds recent` now strips ESC/C0/C1/DEL from
third-party feed `title` / `link` / `publishedAt` before
printing, closing the feeds terminal-injection hole. The
untrusted-text-to-terminal boundary is now consistently
sanitised across the three surfaces the established posture
names — search, inbox (346), and feeds (347).
