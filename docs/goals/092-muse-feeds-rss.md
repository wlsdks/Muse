# 092 — `muse feeds` — RSS/Atom ingest for ambient world-state

## Why

JARVIS keeps Tony abreast of "the Times". Muse currently has zero
passive world-state intake — every news touch is a manual web
search. Add an RSS/Atom poller that stores feed config in
`~/.muse/feeds.json` and surfaces fresh entries in `muse today`
+ a dedicated `muse feeds today`. All-OSS — uses `fast-xml-parser`
(MIT, pure JS, ~30KB).

## Scope

- New `apps/cli/src/commands-feeds.ts`:
  - `muse feeds add <url> [--id <alias>] [--name <name>]`
  - `muse feeds list [--json]`
  - `muse feeds remove <id>`
  - `muse feeds refresh [--id <id>]` — re-fetches one or all
  - `muse feeds today [--hours <n>] [--json]` — entries from last
    24h (default), newest first.
- `~/.muse/feeds.json` shape:
  `{ version: 1, feeds: [{ id, url, name, lastFetchedAt,
  entries: [{ id, title, link, publishedAt, summary }] }] }`.
- Add `fast-xml-parser` to `apps/cli/package.json`.
- Soft-fail per-feed: a 404 / parse error logs to stderr but the
  other feeds still refresh.

## Verify

- cli +1 unit test on the parser (hand-written RSS 2.0 XML
  string → expected entry array).
- Dogfood:
  ```
  HOME_DIR=$(mktemp -d -t muse-feeds-XXXX)
  # Write a fixture RSS file we can serve via file:// URL.
  cat > "$HOME_DIR/feed.xml" <<'EOF'
  <?xml version="1.0"?>
  <rss version="2.0"><channel>
    <title>Test Feed</title>
    <item>
      <title>Hello JARVIS</title>
      <link>https://example.test/a</link>
      <pubDate>Wed, 14 May 2026 12:00:00 GMT</pubDate>
      <description>first entry</description>
    </item>
  </channel></rss>
  EOF
  HOME="$HOME_DIR" node apps/cli/dist/index.js feeds add "file://$HOME_DIR/feed.xml" --id test
  HOME="$HOME_DIR" node apps/cli/dist/index.js feeds today --hours 24000 --json
  ```
  Pass if JSON output contains `Hello JARVIS`.

## Status

done — `muse feeds add / list / remove / refresh / today`
covers the full CRUD + lookback surface. Storage in
`~/.muse/feeds.json` (env override `MUSE_FEEDS_FILE`) via
atomic tmp+rename writes + 0o600 mode mirroring the rest of
the personal stores. Pure XML parsing via `fast-xml-parser`
(MIT, ~30KB); supports both RSS 2.0 (`channel/item`) and Atom
(`feed/entry`) feeds.

`file://` URLs supported alongside `http(s)://` so dogfood +
offline tests skip network. `today --hours N` defaults to
24h, stable date-sort keeps undated entries in tail position.

cli +1 test exercises `parseFeedBody` (RSS 2.0 / Atom /
garbage→empty) and `filterRecentFeedEntries` (cutoff +
undated kept). Dogfood: planted a `file://` RSS fixture +
`feeds add` + `feeds today --hours 24000 --json` returned
the `Hello JARVIS` entry; pass criterion met.
