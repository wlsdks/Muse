# 264 — a bare `\r` in streamed text truncated the SSE response

## Why

`/api/chat/stream` (the SSE endpoint the REPL and web client
consume) frames every model text-delta, tool event, and citation
through `sseData`:

```ts
function sseData(value: string): string {
  return value.split(/\r?\n/u).map((line) => line.length > 0 ? line : " ").join("\ndata: ");
}
```

The WHATWG/EventSource spec splits an SSE stream on **CRLF, a
lone CR, or LF** — all three are line terminators. `/\r?\n/`
only splits on `\n` (with an optional preceding `\r`); a **bare
`\r`** (CR not followed by LF) was left raw inside a `data:`
line. The browser/Node EventSource parser then treats that CR as
a line break: everything after it on that line is parsed as a new
line *without* the `data: ` prefix and is dropped, and frame
parsing desyncs — so a model delta or tool-result JSON containing
a bare `\r` (a progress char, CR-only file content, a chunk
boundary that split CRLF) silently **truncated the streamed
response** mid-message in the client.

## Scope

`apps/api/src/server-multipart-sse.ts`:

- Split on `/\r\n|\r|\n/u` instead of `/\r?\n/u`. CRLF is matched
  first so it stays a single separator (no spurious empty
  segment); a lone CR now correctly starts its own `data:`
  segment, exactly as the SSE client will re-join it.
- `sseData` is `export`ed for direct unit-test coverage of the
  line-splitting (same convention as other pure helpers).

For any value **without** a bare `\r` (all normal `\n` / `\r\n`
text — the overwhelming common case) the output is
byte-for-byte identical to before; only the previously-corrupting
bare-CR case changes. The empty-interior-line → single-space
behaviour is untouched.

## Verify

- `pnpm --filter @muse/api test` — 156 pass (was 155; +1). New
  `sseData` unit test asserts a bare `\r` splits into its own
  `data:` segment with no raw CR surviving, CRLF and LF normalise
  identically (no regression / no spurious empty segment), and an
  empty interior line still becomes `data:  `. The 29 existing
  chat / SSE route test files (which drive the real
  `/api/chat/stream` handler through `sseData`) stay green.
- `pnpm check` — every workspace green (apps/api 156, apps/cli
  560, all packages). `pnpm lint` — exit 0.
- Real-LLM verification posture: the SSE stream path was touched,
  but the change is provably a no-op for every input lacking a
  bare `\r` (identical output to the old regex for `\n` / `\r\n`
  text), so the live streaming happy-path cannot regress. A Qwen
  round-trip cannot deterministically emit a bare `\r`, so it
  would add no signal over the deterministic unit test (which
  covers the changed branch) plus the green route-level SSE tests
  exercising the real handler — that is the rigorous
  verification here, the same honest stance used for prior pure
  deterministic-transform fixes.

## Status

done — the SSE encoder now honours all three SSE line
terminators, so a bare `\r` anywhere in streamed model / tool
output can no longer break frame parsing and silently truncate
the response in the REPL or web client.
