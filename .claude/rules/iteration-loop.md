# Iteration-loop contract

A fresh, context-free agent fires every ~20 min, ships one commit,
repeats **forever**.

**Mandatory reads every iteration: exactly two — THIS file and
`docs/goals/CAPABILITIES.md`.** Consult `OUTWARD-TARGETS.md` at
step 4 (selection), the backlog/ledger in `README.md` at step 3,
and `MEMORY.md` only if a step sends you there. Two files carry the
invariant; the rest are referenced on demand, not re-read wholesale
(reduces skip risk on a 20-min agent).

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

## Cold-start: legacy goals (deterministic — no judgement)

The **legacy set is exactly {373, 375}** — epics authored before
`OUTWARD-TARGETS.md`. Their remaining slices are **exempt from the
falsifiable-outward test and the metric** (they predate it).
Mandate: finish every undone legacy slice **first, one per
iteration, before any other work or any new goal**, then close
them. When {373,375} are both done this clause is spent forever —
**no goal created after this may ever be tagged `legacy`**, and the
full outward bar applies to everything else with no exception.
This removes the continuity-vs-outward deadlock at the boundary.

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
3. **Legacy first, then continuity.** If any legacy slice
   ({373,375}) is undone, do exactly that — skip steps 4–6, it is
   exempt from the outward test/metric; commit; done. Else read
   every open goal's `## Status`/`## Decisions` + the Rejected
   ledger and advance the oldest open epic's next undone slice
   before self-generating any new goal. New `NNN` only when no open
   epic has an undone slice.
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
   auto-skips" is a banned justification (= a skipped test). If the
   change is request/response-path and smoke:live did NOT actually
   execute a round-trip (Ollama down), the new `CAPABILITIES.md`
   line is tagged `[UNVERIFIED-LIVE]` — it ships but **does NOT
   count toward the metric** until a later iteration runs the live
   check and removes the tag. So unverifiable work can never
   inflate progress; getting Ollama/Qwen up to clear the tag is
   then the highest-priority outward goal.
8. **Capability ledger + the metric.** Append one `CAPABILITIES.md`
   line `[axis] capability — command/surface — <runnable check id>`
   (anti-zero: every goal adds one). **The success metric is NOT
   line count — it is OUTWARD-TARGETS *bullets* flipped
   unmet→met.** A bullet is "met" only when a non-`[UNVERIFIED-LIVE]`
   line with a green check delivers it end-to-end; thin work that
   adds a line without flipping a bullet does not satisfy the
   metric. **If no bullet has flipped unmet→met in the last 5
   iterations, the next iteration's sole mandate is to flip one
   bullet end-to-end** (no other work). Flat bullets over 5 iters =
   degeneration; act on it — never stop, never ask.
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
