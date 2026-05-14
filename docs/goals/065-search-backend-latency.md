# 065 — muse search formatted output shows backend latency

## Why

After the result count + backend banner, append '(N ms)'.

## Scope

- Wrap the loopback search call in a Date.now() pair.
- Add to formatted output.

## Verify

- cli +1 test (mock fetch with delay → latency printed).

## Status

done — `muse search`'s formatted banner now ends with the
backend round-trip wall-clock time: `(2 result(s) via
duckduckgo — 47 ms)`. The JSON output is unchanged so
structured consumers stay byte-identical.

cli +1 test asserts the latency segment appears, and the
existing search-output test was updated to match the new
format (which is the only behavioral consumer that pinned the
banner shape).
