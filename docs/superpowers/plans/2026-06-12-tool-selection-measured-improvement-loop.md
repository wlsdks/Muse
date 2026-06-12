# Tool-Selection Measured-Improvement Loop — Implementation Plan

> **For agentic workers:** this is a RECURRING loop doctrine, not a one-shot task
> list. Each 15-min fire follows the per-fire procedure below. Subsequent fires
> are data-driven (the baseline measurement decides the target), so only Fire 1
> (measure) has fully-specified steps; later fires pick a target from the data.

**Goal:** Move a REAL, measured agent metric — primary lever **tool-selection
accuracy (`eval:tools`)**, the binding constraint on the local 12B — proving each
change with a baseline→change→re-measure DELTA verified by an actual `muse` run,
instead of latent-bug micro-fixes.

**Architecture:** Per fire: measure `eval:tools` pass^k baseline → make ONE
principled (tool-calling.md-grounded) change to the tool-selection path → re-measure
pass^k → confirm with a real `muse ask` → scoreboard the delta → commit. No
golden-set gaming; no IrrelAcc regression.

**Tech Stack:** local Ollama gemma4:12b (default), `scripts/eval-tool-selection.mjs`
(`pnpm eval:tools`, threshold 85%, `MUSE_EVAL_REPEAT` for pass^k), `node
apps/cli/dist/index.js ask` (live round-trip; smoke:live STALLS here — do not use).

---

## Grilled decisions (the doctrine — from the grill-me session)

1. **Objective:** measured metric improvement (not latent-bug hunting).
2. **Primary lever:** tool-selection accuracy (`eval:tools`). Fallback levers when
   exhausted: grounding false-refusal recall, `eval:vision`, `eval:plan-quality`.
3. **Scope:** the WHOLE tool-selection path — tool names/descriptions/schemas in
   `@muse/tools` + `@muse/mcp`, the projection/filter/exemplars in `@muse/agent-core`,
   the Ollama `tool_calls` adapter in `@muse/model`, and the eval golden set. The
   agent's brain stays Muse-owned (no vendor becomes the runtime owner).
4. **Integrity (anti-gaming):** pass^k (`MUSE_EVAL_REPEAT=3`) + only principled
   tool-calling.md changes (confusable names, thin descriptions, weak schemas) +
   a real `muse ask` selecting the tool. NEVER edit a golden case to pass; NEVER
   regress IrrelAcc (the no-tool cases). One green run ≠ proof.
5. **Collision control:** the concurrent main loop edits mcp/browser LOGIC, so in
   `@muse/tools`/`@muse/mcp` touch only tool METADATA (name/description/schema)
   surgically; do the bulk in agent-core + @muse/model + the eval harness. `git
   fetch origin && merge origin/main` AND stay aware of local main each fire.
6. **Tracking / done:** append each fire's `eval:tools` pass^k score to a
   scoreboard (delta trend). "Done" = a fire can't find a principled change that
   moves the number (headroom exhausted) → say so honestly and switch to the next
   lever. "nothing to do" is forbidden.

---

## Per-fire procedure (every fire)

- [ ] **ORIENT:** `cd /tmp/muse-agent-core-enhance && git fetch origin && git merge --no-edit origin/main`. Read the scoreboard tail for the current trend.
- [ ] **MEASURE baseline:** `MUSE_EVAL_REPEAT=3 pnpm eval:tools` → record the pass^k score and the FAILING cases (which tool was mis-selected / which no-tool case over-fired).
- [ ] **TARGET:** pick ONE failing/weak case class. Diagnose WHY (confusable name? thin description missing "use when / not when"? weak schema? projection dropped it? exemplar imbalance?).
- [ ] **CHANGE:** one principled fix on the tool-selection path per the scope rules. No golden-case edits.
- [ ] **RE-MEASURE:** `MUSE_EVAL_REPEAT=3 pnpm eval:tools` → confirm the score went UP (or the targeted case now passes) AND no previously-passing case (esp. no-tool/IrrelAcc) regressed.
- [ ] **REAL muse:** `pnpm -r build` then `node apps/cli/dist/index.js ask "<a prompt that should select the targeted tool>"` → confirm the tool is actually selected on the assembled path.
- [ ] **SCOREBOARD + COMMIT:** append the before/after pass^k to `docs/tool-selection-scoreboard.md`; commit to `agent-core-enhance` (Conventional Commit). No push, no main-touch.

---

## Fire 1: establish the baseline (fully specified)

**Files:**
- Read/run: `scripts/eval-tool-selection.mjs` (via `pnpm eval:tools`)
- Create: `docs/tool-selection-scoreboard.md`

- [ ] **Step 1: confirm Ollama + default model**

Run: `curl -s --max-time 5 http://localhost:11434/api/tags | grep -o gemma4:12b`
Expected: `gemma4:12b` (the eval's default model is present).

- [ ] **Step 2: build the eval's deps**

Run: `cd /tmp/muse-agent-core-enhance && pnpm --filter @muse/agent-core build && pnpm --filter @muse/model build && pnpm --filter @muse/tools build`
Expected: three `Done`.

- [ ] **Step 3: measure the pass^k baseline (this is slow — 3× the golden set through gemma4:12b)**

Run: `MUSE_EVAL_REPEAT=3 pnpm eval:tools 2>&1 | tee /tmp/eval-tools-baseline.log`
Expected: a final score line (e.g. `selection accuracy NN%`) + per-case pass/fail. Capture: overall %, and the list of cases that failed on ANY of the 3 repeats (those are the headroom).

- [ ] **Step 4: record the baseline**

Create `docs/tool-selection-scoreboard.md` with the date, the pass^k %, and the failing cases. This is the trend anchor every later fire compares against.

- [ ] **Step 5: commit the baseline**

```bash
git add docs/tool-selection-scoreboard.md docs/superpowers/plans/2026-06-12-tool-selection-measured-improvement-loop.md
git commit -m "docs(eval): tool-selection measured-improvement loop plan + pass^k baseline"
```

- [ ] **Step 6: pick Fire 2's target** from the failing cases (the weakest confusable/under-described tool) — that becomes the next fire's CHANGE.

---

## Self-review

- **Spec coverage:** all 6 grilled decisions map to the per-fire procedure (1→objective, 2→MEASURE/TARGET lever, 3→scope rules in CHANGE, 4→pass^k+real-muse+no-gaming in RE-MEASURE/REAL, 5→ORIENT sync + metadata-only rule, 6→SCOREBOARD + headroom-switch).
- **No placeholders:** Fire 1 has exact commands; later fires are intentionally data-driven (the baseline decides the target — can't pre-write without the data, and inventing fake cases would violate decision 4).
- **Risk:** `eval:tools` at pass^k=3 is slow on a 12B; if a fire can't finish the full repeat in budget, measure k=1 to locate the target and gate the COMMIT on a k=3 re-measure of the changed case.
