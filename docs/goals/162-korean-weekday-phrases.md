# 162 — Korean weekday phrases (`다음 주 월요일`)

## Why

Korean relative-time line: 160 (day+time), 161 (duration
offset), this is 162 (weekday names) — the Korean parallel of
the English `next monday`. "다음 주 월요일에 회의", "이번 주
금요일까지" is everyday scheduling phrasing.

## Scope

- `packages/mcp/src/loopback-relative-time.ts`:
  - `resolveKoreanWeekdayPhrase`, tried after the duration
    offset, before the day-word match (no collision: weekday
    phrases always contain `요일`).
  - Pattern `^(다음\s*주|다음주|담주|이번\s*주|이번주)?\s*([월화수목금토일])요일(?:\s+(.+))?$`.
  - ISO week (starts Monday — Korean convention):
    - bare `<요일>` → next occurrence, always future
      (matches the English bare-weekday semantics: today's
      weekday → +7).
    - `이번 주 <요일>` → this ISO-week's occurrence (may be
      today or in the past — computed literally).
    - `다음 주 <요일>` / `담주` → next ISO-week's occurrence.
  - Time spec reuses `parseKoreanTimeOfDay` (오후 3시 etc.;
    absent → 09:00).
- `packages/mcp/test/mcp.test.ts`:
  - "resolves Korean weekday phrases — 다음 주 / 이번 주
    (goal 162)": bare/이번 주/다음 주 forms, weekday+time,
    today's-weekday → +7 edge.

## Verify

- `pnpm --filter @muse/mcp test` — 330 pass (1 new).
- `pnpm check` exit 0; `pnpm lint` exit 0.
- End-to-end (Ollama qwen3:8b API, reasoning off; ref Fri
  2026-05-15): `다음 주 월요일` → 2026-05-18 09:00,
  `이번 주 금요일` → 2026-05-15, `다음 주 월요일 오후 3시`
  → 2026-05-18 15:00, `수요일 오전 10시` → 2026-05-20 10:00.

## Status

done — pure date logic, no model round-trip (smoke:live not
required). Remaining Korean: "반" half-hour shorthand
("3시 반"); the Korean line is otherwise comprehensive.
