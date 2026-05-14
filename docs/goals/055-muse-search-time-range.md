# 055 — muse search --time today | week | month

## Why

Most search backends accept time-range hints. Map the flag → SearXNG's
time_range param OR DDG's df= param.

## Scope

- Add --time flag.
- Per-backend translation.

## Verify

- cli +1 test.

## Status

done — `muse search "..." --time today|week|month|year` plumbs the
hint through to the `muse.search` MCP tool, which translates per
backend:

  - SearXNG: appends `time_range=day|week|month|year` to the
    upstream `/search` request.
  - DuckDuckGo fallback: appends `df=d|w|m|y` (DDG's date filter).
  - Unknown / empty values fall through unfiltered.

The MCP tool's `inputSchema` now declares `time_range` as an
optional enum so the agent runtime can also forward the hint when
the model passes it. mcp +1 test asserts both per-backend
query strings (positive) and the unfiltered fall-through
(negative) so a typo can't silently produce no-result pages.
