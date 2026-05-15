# 161 — Korean duration offsets (`N분 후` / `3일 뒤`)

## Why

Goal 160 added Korean day+time ("내일 오후 3시"). The other
half of how Koreans express relative time is the duration
offset — "30분 후에 알려줘", "3일 뒤", "2시간 후". This is the
Korean equivalent of the English "in N units" branch, which
was the most common Korean phrasing still rejected after 160.

## Scope

- `packages/mcp/src/loopback-relative-time.ts`:
  - `resolveKoreanDurationOffset` tried first inside
    `resolveKoreanRelativePhrase` (before the day-word match).
  - Pattern `^(\d+)\s*(분|시간|일|주|개월|달)\s*(?:후|뒤)$`:
    분→min, 시간→hour, 일→day, 주→week, 개월/달→month.
  - 개월/달 use `Date.setMonth` calendar semantics (mirrors the
    English "in N months" branch); the rest are flat ms offsets.
  - 후 and 뒤 are interchangeable; whitespace-tolerant.
  - Header doc updated.
- `packages/mcp/test/mcp.test.ts`:
  - "resolves Korean duration offsets — 후 / 뒤 (goal 161)":
    30분 후 / 2시간 후 / 3일 뒤 / 2주 후 / 3개월 후 / 1달 후,
    plus a stray-space "3 일 후" case.

## Verify

- `pnpm --filter @muse/mcp test` — 329 pass (1 new).
- `pnpm check` exit 0; `pnpm lint` exit 0.
- End-to-end (Ollama qwen3:8b API, reasoning off):
  `--due "30분 후"` → +30 min, `2시간 후` → +2h, `3일 뒤` →
  +3d, `1주 후` → +7d, `3개월 후` → 2026-08-15 (calendar).

## Status

done — pure date logic, no model round-trip (smoke:live not
required). Remaining Korean (later goals): weekday names
("다음 주 월요일"), "반" half-hour shorthand.
