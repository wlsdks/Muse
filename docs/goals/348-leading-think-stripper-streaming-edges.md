# 348 — untested cross-chunk edges in the streaming <think> stripper (Qwen reasoning path)

## Why

`createLeadingThinkStripper` (`@muse/model` provider-shared) is
the **streaming** counterpart of `stripLeadingThinkBlock` — it
suppresses a leaked leading `<think>…</think>` block as SSE
deltas arrive. It is squarely on the **Qwen reasoning-off
runtime path**: qwen3 can still emit a leading think block, and
the stream must strip it across arbitrary chunk boundaries
without eating real content. This is subtle, stateful code (a
4-state machine over a re-sliced buffer), so its hard edges
deserve direct coverage.

The existing `goal 173` block covered single-chunk, split-tag,
verbatim-passthrough, unterminated, and no-whitespace-after-close
— but **two edges the implementation has dedicated code for
were untested**, both realistic Qwen-streaming scenarios:

1. **`trim` mode spanning *separate* whitespace-only chunks.**
   The code has a `mode === "trim"` branch whose comment says
   "the close + following blank line often span separate
   chunks". Every prior test delivered the post-close whitespace
   in the same delta as the close or the content — none
   exercised trim mode persisting across multiple whitespace-only
   deltas (the exact case the mode exists for).
2. **A buffered `<th…` prefix that resolves to `<thought>` /
   `<thinking>`, not `<think>`.** scan-mode buffers `<th` (a
   prefix of `<think>`) and emits `""`; if it then resolves to a
   *different* tag the buffered text must be emitted **verbatim**,
   not silently eaten. A regression that mishandled that branch
   would silently swallow real content beginning with a
   `<thought>`/`<thinking>` tag, with nothing to catch it.

## Scope

Test-only. `packages/model/test/model.test.ts`, the existing
`describe("createLeadingThinkStripper (goal 173)")` — +3 cases
(via the existing `feed(deltas)` helper):

- close + `\n` + `\n  ` + `  ` + content as **five separate
  deltas** → `"The answer."` (trim mode across chunks).
- `["<th","ought>keep me</thought> done"]` →
  `"<thought>keep me</thought> done"` and
  `["<thi","nking>real text"]` → `"<thinking>real text"`
  (only exact `<think>` is stripped; buffered prefix emitted
  verbatim).
- leading whitespace + split `<th`/`ink>` + content across
  chunks → content only.

Every expected value was hand-traced through the state machine
before asserting (scan→in→trim→pass transitions, the
`CLOSE_TAG.length-1` tail re-slice, the prefix-disambiguation
`else` branch). No production code changed — this locks the
current correct behaviour.

## Verify

- `pnpm --filter @muse/model test` — 153 pass (was 150; +3; 5
  pre-existing live-only skips). The existing
  `stripLeadingThinkBlock` / single-chunk / split-tag /
  passthrough / unterminated cases stay green.
- `pnpm check` — every workspace green (model 153, apps/cli
  595, apps/api 161, all packages). `pnpm lint` — exit 0. The
  goal-227 enforcement test (328) stays green (no raw bytes —
  `\n` escapes only).
- No real-LLM request/response path *behaviour* touched (test
  only) — and a live Qwen run cannot deterministically force a
  given SSE chunk split anyway, which is precisely why the
  deterministic delta-by-delta test is the rigorous
  verification.

## Status

done — the streaming `<think>` stripper's two
hardest-and-previously-untested cross-chunk edges (trim mode
across whitespace-only deltas; `<thought>`/`<thinking>` prefix
disambiguation) now have direct regression coverage, locking
subtle stateful behaviour on the Qwen reasoning-off path. No
behaviour changed; future regressions now fail `pnpm check`.
