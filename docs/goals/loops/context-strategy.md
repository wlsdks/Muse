# Loop journal — context-strategy

**Theme:** Context engineering — assemble the *leanest sufficient* context per
model turn, never fill it indiscriminately. Strengthen + PROVE Muse's
selective-context machinery (relevance-gated tool exposure, trimming, tool-output
capping + just-in-time retrieval, importance scoring, compaction/summary, budgets).

**Autonomy:** Tier2 — dedicated branch `loop/context-strategy` in a /tmp worktree;
each fire commits AND pushes the branch + maintains a draft PR; human merges.
Hard floor unchanged: NO auto-merge to main, NO force-push, NO `--no-verify`.

**Cadence:** session cron `caf5b755`, 20 min. **Stop:** `CronDelete caf5b755` or cmux.

---

## Candidate queue (gap-scout / web / competitor study refills)

Verified existing context-strategy seams (from codegraph, 2026-06-20):
- **Relevance-gated tool exposure** — `ToolRegistry.planForContext` /
  `filterToolsForContext` / `DefaultToolFilter`: keep the per-turn tool catalog
  small (tool-calling.md ≤5–7). Levers: domain-tag coverage gaps, keyword recall,
  `maxTools` tuning, scope-hint inference.
- **Tool-output capping + JIT retrieval** — `maxToolOutputChars` + content-addressed
  `ContextReferenceStore` + `muse.context.fetch({ ref })`. Levers: importance-aware
  cap, ref hit-rate, head+tail elision quality.
- **Tool-output importance scoring** — `scoreToolOutputImportance` / `trimToolOutput`.
- **Conversation trimming** — `trimConversationMessages` (pairing, hard budget, anchor).
- **Compaction / summary** — `ConversationSummaryStore`, activity-log gz compaction.
- **Budgets** — `StepBudgetTracker` / `systemPromptTokenBudget` / step caps.

### Open follow-ups (next-fire candidates)
- ◦ **Thread per-turn query relevance into the cross-block edge-place** (fire-1
  deferred): wire episode `.score` / contact match score into
  `OptionalGroundingSource.relevance` at `commands-ask.ts` so the reorder uses
  query-specific relevance, not just the fixed tier. Needs a shared 0–1 scale so
  relevance and tier don't scale-mix. (new-capability / @muse/cli+recall)
- ◦ **Grounding-quality eval under the new block order**: assert the edge-placed
  prompt order does not regress answer grounding (the judge flagged no eval
  measured this). Likely `eval:chat-grounding` / `precheck:grounding` case.

---

## fire 1 · 2026-06-20 · skill v1.14.0 · <commit-pending>
meta: value-class=micro-fix · pkg=@muse/recall · kind=context-assembly-hardening · verdict=PASS · firesSinceDrill=1
ratchet: testFiles +0 (extended existing) · recall 326 pass · cli 2745 pass · pnpm check exit0 · pnpm lint exit0 · fabrication 0 · eval:tools=ATTEMPTED-STALLED (Ollama gen-model load hung before first result — known PC issue, see project_smoke_live_stall; slice is orthogonal to tool selection)
- **What:** Cross-block edge-placement reorder of the optional grounding blocks in
  `@muse/recall` (`optionalGroundingSections`/`present.ts`). Present blocks are now
  ordered highest-priority→HEAD+TAIL, lowest→middle via a pure stable
  `edgePlaceByPriority`, with an explicit deterministic `OPTIONAL_GROUNDING_TIER`
  fallback (tasks>reminders>calendar>memories>contacts>actions>git>shell>episodes>feeds>reflection)
  and an optional per-block `relevance?` override.
- **Why:** "Lost in the Middle" (arXiv:2307.03172) + "Attention Basin"
  (arXiv:2508.05128) — LLMs under-attend the middle of a context sequence. Muse
  already edge-places WITHIN blocks (`reorderForLongContext`) but emitted the
  CROSS-block order relevance-blind, so an answer-bearing block could sit in the
  attention dead-zone. hermes/openclaw have no deterministic grounding-aware block
  reorder (free-form summary/recency only) → this widens Muse's edge, not copies.
- **Review point:** behavior-change to the live prompt order (set-invariant,
  gate-neutral); CLI still passes no per-turn relevance so production uses the
  fixed tier (query-relevance threading deferred — see follow-up above).
- **Risk:** none to floor — reorder is a pure permutation of the SAME present
  blocks (set-equality asserted), no drop/add, no touch to selection / citation
  gate / notesFraming / verifyGrounding / the "(grounded on …)" banner. Verified
  by independent Opus judge (6/6) + mutation RED→GREEN (identity-order → edge case
  RED; drop-block → set-equality RED).

---
