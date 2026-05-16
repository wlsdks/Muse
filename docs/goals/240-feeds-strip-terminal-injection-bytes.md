# 240 — `muse feeds` passed raw publisher bytes to the terminal

## Why

The un-swept sibling of the control-byte sanitiser sweep (goals
227-231 for prompt-context surfaces; goal 234 for search
results). `feeds-store.ts` `parseFeedBody` built each `FeedEntry`
straight from the RSS/Atom XML via `readScalar` with **zero**
sanitisation:

```ts
const title = readScalar(raw.title);          // publisher-controlled
return [{ id: guid, title, link: link ?? "",
          publishedAt: readScalar(raw.pubDate) ?? "",
          summary: readScalar(raw.description) ?? "" }];
```

`commands-feeds.ts` then writes those fields **raw** to the
terminal:

```ts
io.stdout(`[${entry.feedId}] ${entry.title} — ${entry.publishedAt || "(no date)"}\n`);
if (entry.link) io.stdout(`  ${entry.link}\n`);
```

A feed's `<title>` / `<description>` / `<link>` is wholly
controlled by whoever publishes the URL the user added with
`muse feeds add` — a low-trust action: you vet a URL once, you do
not audit every future item the publisher pushes. A malicious or
compromised feed can embed ANSI / OSC / C0 / C1 / DEL bytes
(`ESC[2J` clear-screen, `ESC]0;…BEL` title-spoof, cursor moves)
that execute in the user's terminal **every** time they run the
JARVIS-ambient `muse feeds today` / `list`. The bytes also land
verbatim in `~/.muse/feeds.json` and would reach any future
ambient-prompt surface that renders feed text.

## Scope

`apps/cli/src/feeds-store.ts` — sanitise at the **parse
boundary** (the chokepoint), so every consumer (terminal today,
on-disk store, any future prompt surface) gets clean data, exactly
like the inbox / episodic surfaces sanitise on ingestion:

- New `sanitizeFeedText(v)` =
  `stripUntrustedTerminalChars(v ?? "").replace(/\s+/gu, " ").trim()`
  — the same primitive + whitespace-collapse the search surface
  uses (`@muse/shared`, already an `apps/cli` dep).
- `toRssEntry` / `toAtomEntry` now run `title`, `link`, `summary`,
  `publishedAt`, and the `id`/`guid` through it. Semantics
  preserved: an item is still dropped iff it has no title or no
  derivable id; the id still falls back link→title (now from the
  sanitised values). An all-control-byte title degrades to "" and
  is dropped — a strict improvement (it was attack/junk).
  `publishedAt` stays `Date.parse`-able (valid RFC822/ISO dates
  carry no control bytes and single-space after collapse).

No render-site change needed — fixing the boundary fixes both
`today` and `list` and is robust against new call sites.

## Verify

- `pnpm --filter @muse/cli test` — 554 pass (was 553; +1). New
  test feeds an RSS item whose title/description/link/guid carry
  `ESC[2J`, a C1 CSI, BEL, DEL and a `\n\n   ` splice (bytes built
  via `String.fromCharCode`, never raw in source — goal-227 rule),
  and asserts every parsed field contains none of them AND that
  internal whitespace was collapsed (which the XML parser does not
  do — proving our normaliser ran). The goal-092/115 RSS/Atom/
  merge/filter tests still pass, confirming the rewrite preserved
  semantics.
- `pnpm check` — every workspace green (apps/cli 554, apps/api
  153, all packages). `pnpm lint` — exit 0.
- No real-LLM request/response path touched (XML parse path, no
  model round-trip), so no Qwen dog-food applies.

## Status

done — a hostile or compromised RSS/Atom feed can no longer hijack
or spoof the user's terminal through `muse feeds today` / `list`,
nor park control bytes in `~/.muse/feeds.json`. Feed text is
neutralised once at the parse boundary, bringing feeds to parity
with the inbox / episodic / search surfaces.
