# 062 — muse history relative time in formatted output

## Why

Currently shows ISO. Render '2h ago', 'yesterday', '5d ago' when
recent; ISO for older entries.

## Scope

- Helper formatRelativeTime(iso, now).
- Apply in commands-history.ts formatted block.

## Verify

- cli +2 tests.

## Status

done — new `formatRelativeTime(iso, now, timeZone?)` helper in
`human-formatters.ts` returns "Ns / Nm / Nh / Nd ago" (and
matching "in N…" prefixes for future timestamps) when the delta
is ≤ 7 days; otherwise delegates to `formatLocalDateTime` so the
table keeps full precision past the relative window.
`commands-history.ts` swaps its render path over to the new
helper. cli +1 test covers past / future / fallback past 7d /
invalid input.
