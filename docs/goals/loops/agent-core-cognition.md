# Loop journal — agent-core-cognition

Per-loop journal (loop-creator v1.14.0). Cron 39b9bdec (15m). Successor to the
fires 1–41 chain recorded in the shared `loop-digest.md` (retired for this loop to
avoid cross-loop conflict). Theme: agent-core Muse cognition core strengthening,
paper-grounded (public arXiv only), 5-theme round-robin → gap-scout. Tier1.

## fire 1 · 2026-06-13 · skill v1.14.0 · 9b6b5a3e
meta: value-class=new-capability · pkg=@muse/agent-core+@muse/cli · kind=recall-ranking-selection · verdict=PASS · firesSinceDrill=1
ratchet: testFiles 905→906 (+commands-ask-adaptive-k) · fabrication 0 (STRENGTHENED — fewer decoys) · eval n/a (deterministic selection)
- 무엇: Adaptive-k (arXiv:2506.08479, Taguchi/Maekawa/Bhutani EMNLP 2025) — `selectByScoreGap` (largest consecutive-gap knee) trims the `muse ask` grounding window to `effectiveK = min(topK, gap-cut)` in `diversifyAskChunks`. Trim-only (cap topK, floor 1, top match always kept). Distinct from shipped MVT (mean give-up vs largest cliff).
- 왜+arXiv: fixed topK=3 padded the prompt with near-miss decoys when scores fall off a cliff (fabrication surface for the local 12B); the paper's single-pass distribution-based k trims to the natural knee. Diversified off the last 2 council/semantic fires (40/41). arXiv:2506.08479.
- 리뷰지점: maker=Sonnet / judge=Opus 4.8 (independent, Fable-5 세션 미가용). v1 FAIL (FLOOR: gap-cut fed the trimmed set to classifyRetrievalConfidence which keys on top AND runner-up → borderline-flat verdict flipped "ambiguous"→"confident", false confidence). v2 PASS: split prompt-window trim from verdict input (notesGroundingFraming takes UNTRIMMED preGapScored). Judge swept ALL trimmed-set consumers floor-safe/fail-closed; counterfactual non-vacuous (verdict-from-trimmed → confident); non-inert real-revert (cliff→1 fails when disabled). Independent re-verify: agent-core 1943 + cli 2563 + builds + lint green.
- 리스크: 낮음 — trim-only count selection over the user's own chunks; verdict provably unchanged (from untrimmed distribution); fewer chunks → lower coverage → MORE ungrounded (fail-closed); fail-open on flat distribution. Caveat (process): the Opus judge accidentally `git checkout`ed the uncommitted commands-ask.ts mid-judging and reconstructed it byte-faithfully — orchestrator independently re-ran the full suite (floor + counterfactual + value tests pass) before commit, confirming soundness. Backlog: extend to recall/render surfaces; A/B gap vs MVT vs fixed on embedder-ab; per-query-type k.
