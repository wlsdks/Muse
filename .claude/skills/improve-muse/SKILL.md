---
name: improve-muse
description: Use when deciding what to work on next in the Muse repo — at the start of a dev session, after finishing a slice, or when it feels like there is nothing left to do. Muse-specific; the daily dev entrypoint.
---

# improve-muse — find the next slice

## Overview

One invocation answers ONE question: **"지금 Muse에서 가장 가치 있는 다음
작업은 무엇인가?"** The deliverable is a short ranked recommendation —
this skill does NOT build. Once a slice is picked (by Jinan, or by
standing autonomous instruction), execution follows
[`harness/host/dev-loop.md`](../../../harness/host/dev-loop.md) §3
(PLAN→BUILD→VERIFY→WRITE-BACK→COMMIT) in the normal conversation flow.

**A lazy "할 게 없다" cop-out is forbidden — but an HONEST "the
high-value board is genuinely clean right now" IS a first-class output**,
when (and only when) it is *earned*: every collect step ran AND the
discovery scouts (e1→e2) came back dry. The pipeline never returns empty
because it didn't look; a drained backlog means the recommendation IS a
refill scout, a blocked item IS the decision that unblocks it. The two
failure modes this guards are SYMMETRIC: refusing to look (cop-out) and
manufacturing busywork to avoid an empty hand. An earned-clean report —
with the evidence of what was scanned — beats both.

## The pipeline (collect, then rank)

1. **ORIENT** — `pnpm self-eval` (a regression auto-wins rank #1; ~1.5s
   warm via the eslint cache, ~11s cold on the first run of a session —
   REUSE an earlier self-eval result from THIS session if nothing changed
   since, don't re-run it each invocation); `git log --oneline -8` (what
   shipped recently — this is also the freshness oracle below);
   `curl -s localhost:11434/api/tags` (live batteries possible?).
2. **COLLECT candidates** from every source, in priority order:
   - (a) self-eval regression → rank #1, stop collecting.
   - (b) `docs/goals/backlog.md` ★ OPEN — a declared PREREQUISITE
     outranks the feature it unblocks.
   - (c) ⏳ blocked-on-Jinan items → "decision-needed" candidates.
     Surface them with the EXACT question + options; never hide them.
   - (d) ◦ ready items.
   - **FRESHNESS GUARD (run before recommending ANY ◦/★/⏳ item):** the
     backlog lags reality — an item marked `◦ open` may ALREADY be shipped
     (observed: `A2`/`A3` sat open after they landed). Cross-check each
     candidate against `git log` (recent commits) and codegraph (does the
     named symbol/wiring already exist?). A done-but-open item is NOT a
     recommendation — it is a one-line backlog-hygiene fix (flip it to ✓);
     surface that instead of proposing already-finished work.
   - (e) If (a)–(d) yields fewer than 2 actionable candidates → DISCOVER, in
     this order, and WRITE findings back to the backlog (the scout output IS the
     candidate set):
     - (e1) **SIGNAL scout FIRST** — `node scripts/scout-signals.mjs`: clusters
       the FAILING run-log traces (`.muse/runs/`, the labels Muse already writes)
       by frequency. A recurring ungrounded / failed query IS the work — real
       failure beats a guess (the dominant 2026 triage pattern).
     - (e2) **if signals are clean** → codebase gap-scout
       ([`docs/EXPANSION-PLAYBOOK.md`](../../../docs/EXPANSION-PLAYBOOK.md)) —
       proactive expansion/hardening.
     - (e3) **if BOTH are dry** → this is the EARNED-clean output: report "no
       high-value work found" + the evidence (what was scanned: self-eval clean,
       signal scout 0 clusters, gap-scout dry), and stop. **Never invent busywork**
       (the field's failure mode). This is NOT the forbidden "할 게 없다" — that
       one skips the scan; this one EARNED the verdict by running it.
3. **RECOMMEND** — the deliverable, then STOP:
   - 1–3 candidates: what / why (source line in backlog or failing
     gate) / which gate it strengthens / risk + size.
   - One line: **"내 추천: …"** with the reason it beats the others.
   - Decision-needed (⏳) items listed separately as questions with
     options, so a pick unblocks them.

Building starts only after the pick. An autonomous loop with a standing
instruction takes the top recommendation as its pick and continues per
dev-loop.md — the finder/builder split still holds.

## Forbidden outputs (the failures this skill exists to prevent)

| Rationalization | Reality |
|---|---|
| "★ OPEN 섹션이 비어 있으니 할 게 없다" | Empty top section ≠ no work. Steps (c)–(e) still produce candidates; a refill scout IS the work. |
| "남은 건 blocked뿐이라 못 한다" | Surfacing the blocking decision with the exact question IS the recommendation. |
| "스킬이 호출됐으니 BUILD~COMMIT까지 지금 돌린다" | No — this skill ends at the recommendation. Execution follows dev-loop.md after the pick. |
| "추천만 하면 되니 self-eval은 생략" | The regression check is non-negotiable; a regression auto-wins rank #1. (Reuse this session's recent run — but never skip it entirely.) |
| "백로그 읽기 귀찮으니 느낌상 가치 높은 걸 추천" | Every candidate must cite real state — a backlog line, a failing gate, or a labeled trace. |
| "백로그에 `◦ open`이니 아직 할 일이다" | The backlog lags — run the FRESHNESS GUARD first. An already-shipped item is a hygiene fix, not work. |
| "보드가 깨끗하니 아무거나 하나 만들어 추천" | Manufacturing busywork is the OPPOSITE failure from the cop-out. An earned-clean report (with scan evidence) is the correct output. |

## Evaluation (this skill ships with evals — `agent-testing.md`)

A finder skill needs its own check that it RECOMMENDS WELL, not just runs.
The golden scenarios + rubric live in [`evals.md`](evals.md): each is a
repo-state → expected-recommendation-SHAPE case (regression present /
stale-but-open item / blocked-only board / genuinely-clean board). Run
them by reading `evals.md` and confirming this skill's output matches the
expected shape; when a real miss happens (a bad or already-done
recommendation), add it there as a new case — the eval is the source of
truth, grown from real failures (start small, ~4 cases).

## Hard rules

- Never end with "nothing to do" — fail-closed to the refill scout instead.
- Never ask "뭘 만들까" as a substitute for running the pipeline; the
  only question to the human is a SPECIFIC ⏳ fork, with options.
- This skill writes at most: backlog refill entries. No `src/` changes,
  no commits, no pushes.
- Non-negotiables stay with the builder: fabrication=0,
  `MUSE_LOCAL_ONLY`, draft-first outbound, verify-before-claim
  (`CLAUDE.md` + `.claude/rules/`).
