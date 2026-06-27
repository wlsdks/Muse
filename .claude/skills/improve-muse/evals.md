# improve-muse — evals (recommendation-quality golden set)

The skill's source of truth: does it RECOMMEND well, not just run? Each case
is a repo state → the expected SHAPE of the recommendation (not an exact
string — grade the shape/branch, per `agent-testing.md`: outcome not path).
There is no auto-runner (Anthropic's eval format is a rubric); run a case by
reproducing its state and checking the skill's output against
`expected_behavior`. Grow this from REAL misses — when the skill recommends
something bad or already-done, add the case here.

## Contents
- E1 — regression present → regression wins
- E2 — stale-but-open backlog item → hygiene fix, not work
- E3 — board has only blocked (⏳) items → surface the decision
- E4 — genuinely clean board → earned-clean report (not busywork)
- E5 — empty ★ OPEN section → refill scout (not "nothing to do")

---

### E1 — a regression is present
**state:** `pnpm self-eval` exits non-zero (e.g. a tracked count dropped, or lint fails).
**expected_behavior:**
- ORIENT runs self-eval and detects the regression.
- The regression is ranked #1 and collection STOPS — no backlog/scout items compete with it.
- The recommendation names the failing gate and that fixing it is the whole next slice.
- FAIL if it lists feature candidates above/alongside the regression.

### E2 — a backlog item is marked `◦ open` but already shipped
**state:** `docs/goals/backlog.md` has an `◦`/`★` item whose symbol/wiring already exists in HEAD (e.g. a recent commit landed it).
**expected_behavior:**
- The FRESHNESS GUARD cross-checks the candidate against `git log` / codegraph BEFORE recommending it.
- The already-done item is NOT recommended as work; it is surfaced as a one-line backlog-hygiene fix (flip to ✓).
- FAIL if the skill recommends building something that already exists.

### E3 — the board has only blocked (⏳) items
**state:** no `◦` ready items; one or more `⏳` blocked-on-Jinan items remain.
**expected_behavior:**
- The skill does NOT report "nothing to do."
- It surfaces the blocking decision(s) with the EXACT question + options, as a decision-needed recommendation.
- FAIL if it hides the blocked items or asks a vague "뭘 만들까".

### E4 — genuinely clean board
**state:** self-eval clean; signal scout 0 failure clusters; gap-scout (e2) returns nothing high-value.
**expected_behavior:**
- The skill reports the EARNED-clean verdict WITH evidence (self-eval clean, N traces / 0 clusters, gap-scout dry).
- It does NOT manufacture a low-value item just to have a recommendation.
- FAIL on either: a fabricated busywork item, OR a bare "할 게 없다" with no scan evidence.

### E5 — `★ OPEN` section is empty but discovery sources exist
**state:** top backlog section drained; `.muse/runs/` has failing traces, or the gap-scout has targets.
**expected_behavior:**
- The skill falls through to DISCOVER (e1 signal scout → e2 gap-scout) and the scout output IS the candidate set.
- Findings are written back to the backlog as refill entries.
- FAIL if "empty ★ OPEN" is treated as "nothing to do".

## Note on e1 fuel (known limitation, watch this)
The signal scout (e1) depends on `.muse/runs/` traces carrying FAILURE labels.
Today most grounded-but-wrong answers (misgrounding) are labeled as successes,
so failure clusters are ~0 and e1 falls through to e2 almost always. If a
faithfulness probe starts labeling misgrounding as failure, e1 becomes the
primary fuel again — re-weight it then.
