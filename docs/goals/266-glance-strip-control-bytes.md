# 266 — `muse glance` printed raw window-title / clipboard bytes

## Why

The screen-awareness "see" surface was the last un-swept sibling
of the control-byte / terminal-injection sweep (goals 227-231
prompt surfaces, 234/247 search, 240 feeds, 245 auto-extract).

`parseOsascriptGlance` turns the osascript output into
`{ app, window, selected }` with only `.trim()` + a
"missing value" → "" normalisation:

```ts
const norm = (value) => {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed === "missing value" || trimmed === "") return "";
  return trimmed;
};
```

`window` is the **front window's title** — for a browser that is
the active tab's `<title>`, fully controlled by whatever page the
user is on (`document.title = "\x1b[2J\x1b]0;evil\x07"`).
`selected` is literally `the clipboard as text` — arbitrary
content the user copied, possibly from a hostile source. Both are
then printed **raw** to the terminal by `muse glance`:

```ts
io.stdout(`window:   ${snapshot.window || "(none)"}\n`);
io.stdout(`selected: ${snapshot.selected || "(empty …)"}\n`);
```

So a malicious tab title or clipboard payload carrying ANSI / C0 /
C1 / DEL bytes hijacks or spoofs the user's terminal the moment
they run `muse glance` — exactly the class every other untrusted
surface was already hardened against.

## Scope

`apps/cli/src/commands-glance.ts` — sanitise at the
`parseOsascriptGlance` parse boundary (the chokepoint, same as
feeds-store goal 240 / inbox-context), so every consumer (the
terminal display today, any future agent-context use of the
snapshot) gets clean data:

- `norm` now composes
  `stripUntrustedTerminalChars(value).replace(/\s+/gu, " ").trim()`
  (the established `@muse/shared` primitive + whitespace-collapse
  the search / feeds surfaces use) before the "missing value"
  check. `@muse/shared` is already an `apps/cli` dependency.

One helper changed; behaviour for clean titles is unchanged
(strip is a no-op on control-byte-free text, the whitespace
collapse is identity on already-single-spaced strings, the trim
was already there) — only the adversarial bytes are neutralised.

## Verify

- `pnpm --filter @muse/cli test` — 560 pass. The goal-089
  `parseOsascriptGlance` test is extended: a fixture whose
  app / window / selected carry `ESC[2J`, a C1 CSI, DEL and
  multi-space runs is asserted to contain none of those control
  bytes and to equal
  `{ app: "Safari[2J", window: "EvilPage", selected: "copied text
  with spaces" }` (bytes built via `String.fromCharCode`, never
  raw in source — goal-227 rule). The existing
  normal / missing-value / whitespace-trim / em-dash cases stay
  green (no regression).
- `pnpm check` — every workspace green (apps/cli 560, apps/api
  155, all packages). `pnpm lint` — exit 0.
- No real-LLM request/response path touched (deterministic
  osascript-output parser → terminal display). The threat is an
  adversarial title/clipboard a benign run does not produce, so
  the deterministic unit test injecting it is the rigorous
  verification — the same stance the rest of the control-byte
  sweep used.

## Status

done — `muse glance` can no longer have its terminal hijacked or
spoofed by a hostile browser-tab title or clipboard payload; the
screen-awareness snapshot is neutralised once at the parse
boundary, bringing it to parity with the inbox / feeds / search /
auto-extract surfaces. The control-byte sweep now covers every
untrusted ingestion point.
