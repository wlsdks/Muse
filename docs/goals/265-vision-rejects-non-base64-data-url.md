# 265 — `muse vision` fed a non-base64 data: URL to the model as garbage

## Why

`loadImageAsBase64` (the `muse vision` image loader, documented to
accept "Path, http(s):// URL, or data: URL") handled the `data:`
branch as:

```ts
if (trimmed.startsWith("data:")) {
  const comma = trimmed.indexOf(",");
  if (comma < 0) throw new Error("malformed data URL (no comma separator)");
  return trimmed.slice(comma + 1);   // assumed to be base64
}
```

It assumed **every** data URL is base64. Per RFC 2397 a data URL
is base64 only when its metadata segment carries the `;base64`
token; otherwise the post-comma payload is **URL-encoded text**
(the common `data:image/svg+xml,%3Csvg…%3E` SVG form, or any
`data:,…` / `data:text/...` value). For those, the code returned
the percent-encoded string and labelled it base64, so the vision
model received corrupt bytes — a silent wrong/empty answer with
no error, on an input form the command's own `<source>` help
advertises.

Rasterising SVG/text into an image is a feature, not a bug fix.
The bug is the **silent garbage**; the right tight fix is to
reject a non-base64 data URL with a clear, actionable error —
consistent with this file's existing strong error UX (Ollama
unreachable / non-2xx already give actionable messages).

## Scope

`apps/cli/src/commands-vision.ts` — `loadImageAsBase64` data:
branch:

- After locating the comma, require the metadata segment
  (`trimmed.slice("data:".length, comma)`) to end with `;base64`
  (case-insensitive). If not, throw
  `data: URL must be base64-encoded image bytes … a non-base64
  (URL-encoded / SVG / text) data URL is not a supported vision
  image`. Base64 data URLs (with or without an explicit
  mediatype, e.g. `data:;base64,…`) pass through exactly as
  before.

One guard added; the base64 passthrough, http, local-path, and
no-comma branches are unchanged. The command action already wraps
`loadImageAsBase64` in a try/catch that prints
`muse vision: could not load image: <message>` and exits 1, so
the new error surfaces cleanly.

## Verify

- `pnpm --filter @muse/cli test` — 560 pass. The existing
  goal-087 helper test is extended: a non-base64 data URL
  (`data:image/svg+xml,%3Csvg%2F%3E`) and a bare `data:,hello`
  now reject with `/must be base64-encoded/`, while
  `data:;base64,QUJD` still resolves to `QUJD` and the original
  `data:image/png;base64,iVBORw0KGgo=` / no-comma / http /
  local-file assertions stay green (no regression).
- `pnpm check` — every workspace green (apps/cli 560, apps/api
  155, all packages). `pnpm lint` — exit 0.
- No real-LLM request/response path touched: the guard is pure
  string validation that throws *before* the Ollama call. The
  rejected case is an adversarial input a Qwen round-trip would
  not naturally produce, so the deterministic unit test injecting
  it is the rigorous verification — same honest stance as prior
  pure-validation fixes.

## Status

done — `muse vision` now rejects a non-base64 data: URL with a
clear actionable message instead of silently passing
URL-encoded/SVG text to the vision model as if it were image
bytes. Base64 data URLs, paths, and http(s) URLs are unaffected.
