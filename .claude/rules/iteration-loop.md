# Iteration-loop contract

A fresh, context-free agent fires every ~20 min, reads this file +
`docs/goals/OUTWARD-TARGETS.md` + `docs/goals/README.md` +
`MEMORY.md`, ships one commit, repeats **forever**.

---

# ★ READ THIS FIRST — the 5 rules. If you internalise nothing else:

1. **Never stop. Never ask a human for work. Never declare
   complete.** Infinite operation is the invariant. A human only
   intervenes by issuing a direct command; absent that, you decide
   and proceed.
2. **First action every iteration: falsify the previous
   iteration's capability claim.** Run the automated check named in
   the newest `CAPABILITIES.md` line. If it does not pass
   end-to-end, repairing that is THIS entire iteration. A faked or
   broken capability is the highest-priority work — no new goal
   until the ledger is honest.
3. **Advance the highest unmet target in `OUTWARD-TARGETS.md`.**
   Direction is yours to choose and evolve toward the north star
   (proactive + instantly-responsive personal assistant) — but
   every goal must pass the falsifiable-outward test and ship a
   **green automated check** (test/smoke id), appended as one line
   to `CAPABILITIES.md`. No green check ⇒ not a capability ⇒ not a
   valid iteration.
4. **Inward churn is banned as a deliverable.** Cosmetic/defensive
   guards w/o an observed failure, re-sort/re-format, comment/
   dead-import/provenance sweeps, pure renames, signature-only or
   already-covered tests, lint-only. They may ride *inside* a
   capability goal; never be it. Relabelling these "outward" is the
   exact prior failure — forbidden.
5. **The immutable core is not yours to edit.** You may ONLY:
   append ≤1 backlog row, flip status of goals you touched, append
   to `CAPABILITIES.md` and the Rejected ledger, and refine the
   target map's *direction* with a recorded rationale. You may NOT
   weaken the north star, the outward test, the banned list, the
   capability-check/verification rules, or the never-stop
   invariant. Those change by human command only.

Everything below is detail serving these five.

---

## Direction is self-directed (this is the point)

You are the intelligence; choosing and evolving the outward
direction is your job, drawing on best-practice knowledge of what
a great personal AI assistant does. `OUTWARD-TARGETS.md` is the
loop's own map — you may reorder/split/extend it when your
judgement finds a stronger outward direction; record why in the
goal's `## Decisions`. The ONLY brake on direction is rule 4 + the
immutable core: freedom to choose *what* outward, never freedom to
call inward work outward or skip the check.

## Per-iteration procedure

1. **Falsify previous claim (rule 2).** Run the newest
   `CAPABILITIES.md` check. Not green end-to-end → fixing it is the
   whole iteration; commit; done.
2. **Health + stagnation.** `git status` clean & synced (if dirty
   from an interrupted iter, restoring a clean tree IS the
   iteration). `git log --oneline -8`: if ≥3 recent commits are
   janitorial/off-target or one area churned, you MUST pick a
   different outward target this iteration. Detection forces
   redirect — never a halt.
3. **Continuity before novelty.** Read every open goal's
   `## Status`/`## Decisions` + the Rejected ledger. Advance the
   oldest open epic's next undone slice before self-generating any
   new goal. New `NNN` only when no open epic has an undone slice.
4. **Select.** Highest unmet `OUTWARD-TARGETS.md` target → its next
   real slice, finishable as one commit, non-trivial (state why),
   behaviourally distinct from the last 8 shipped goals.
5. **Define the check up front.** State the executable acceptance
   check (a real test or smoke id), the failing case it closes,
   and that it fails before / passes after. No check ⇒ regenerate.
6. **Implement, then adversarial self-critique.** As a hostile
   reviewer whose only job is to prove "this is busywork / fake
   progress / inward in disguise", attack your diff. If it lands,
   revise or regenerate before committing.
7. **Verify for real.** `pnpm check` + `pnpm lint` (0/0) +
   `pnpm smoke:broad`. Any request/response-path change → `pnpm
   smoke:live` MUST execute a round-trip. smoke:live uses the loop
   PC's **LOCAL OLLAMA QWEN ONLY — never a cloud API**. "smoke:live
   auto-skips" is a banned justification (= a skipped test); if it
   skips, making it run is itself the priority outward goal
   (Autonomy: the loop can verify itself).
8. **Capability ledger.** Append one `CAPABILITIES.md` line:
   `[axis] capability — command/surface — <automated check id>`.
   The check must exist and be green. If the line count has not
   strictly increased across the last 5 iterations, the next
   iteration's sole mandate is to add one real capability + check.
9. **Commit + ledgers.** One Conventional Commit, dashboard-legible
   subject. Append outcome to `## Status` + non-obvious choices to
   `## Decisions`. Deferred discovery path → one Rejected-ledger
   line in `README.md` so no future agent re-mines it.
10. **Continue.** Backlog table append/flip-only: ≤1 new row, flip
    only goals you touched; never reorder/delete an open row or
    rewrite another goal's status (merge-safe on the shared
    remote). The loop never stops.

## Long-horizon regression sweep (move 4)

Every iteration whose number is a multiple of 10 (count
`CAPABILITIES.md` lines): re-run **all** capability checks. Any
regression → the next iteration's sole mandate is to restore it
(an outward, on-map goal). This makes "are we still actually
better after hundreds of iters" a mechanical, recurring,
no-human gate.

## Guaranteed non-stall fallback

"Nothing permissible" is impossible: if step 4 yields nothing
finishable in one commit, decompose the largest unbuilt
`docs/design/*.md` gap into one more end-to-end vertical slice and
ship its smallest real increment (never a stub/guard/test-only). A
void iteration (no functional diff) is a failed iteration: record
why in the next goal's `## Status` while still shipping the slice.

## Dashboard = infra, not iteration work

`scripts/dashboard-server.mjs` renders live from git; needs no
per-commit edit. Never commit a LIVE_URL/tunnel/dashboard change as
shipped work. Goal 376 is closed human-operated infra.

## After-correction protocol

Only a human-directed change edits the immutable core or this file.
If the loop is seen degenerating, the human adds one concrete
prohibition here; the loop never edits it itself.
