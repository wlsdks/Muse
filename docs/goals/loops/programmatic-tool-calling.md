# Loop journal — Programmatic Tool Calling (PTC)

Theme: build PTC (plan-first, design = docs/strategy/programmatic-tool-calling.md) to collapse
local-12B N-step tool chains into ONE inference. BIG chunk per fire (a whole phase, not a slice)
until COMPLETE. Tier1 (local commits, no push). Source mirror: hermes-agent (MIT/Apache), pattern.

## Phases (each fire completes the next incomplete one)
- [x] Phase 1 — Plan schema + DAG interpreter (pure, no model): Zod schema, cycle/unknown-tool/$-ref
      validation, topological execution against a tool-executor seam. Deterministic unit tests.
- [ ] Phase 2 — Wire to AgentRuntime's gated path (toolApprovalGate + groundToolArguments per step) +
      the 5 hostile-review acceptance tests (deny⇒no effect; fabrication⇒dropped; cycle⇒error;
      injection⇒data-only; 1-step⇒unwrapped).
- [ ] Phase 3 — Expose `run_tool_plan` tool + grounding wiring (step outputs → citable sources;
      final answer through the citation gate) + eval:tools golden (multi-step positive + single-call
      negative).
- [ ] Phase 4 — Live proof: eval:tools / smoke:live with MUSE_EVAL_REPEAT on gemma4 — a real
      multi-step task completes in ONE inference, intermediate results absent from context, answer
      grounded. Measure delta vs the per-tool loop.

## Fire log
(appended per fire)

## fire 1 · 2026-06-30 · fire1 · Phase 1
verdict: PASS · Phase 1 (plan schema + DAG interpreter, pure — no AgentRuntime/model)
- WHAT: `packages/agent-core/src/tool-plan.ts` — `parseToolPlan` (deterministic, never-throws validation: shape, step-cap, duplicate binding, unknown-tool, and the CYCLE GUARD = backward-`$`-refs-only ⇒ acyclic by construction) + `executeToolPlan` (resolve `$binding.path` args from PRIOR outputs value-level, run steps via a pluggable executor seam, project the `result`; captures every step output in `steps[]` for Phase 3 grounding). Exported from agent-core.
- WHY: foundation for collapsing local-12B N-step tool chains into ONE inference (Muse's #1 bottleneck). Phase 1 is the pure core so Phase 2 can wire the executor seam to AgentRuntime's gated path (approval + arg-grounding).
- REVIEW: 11 tests (valid plan; each rejection; cycle-guard; data-flow substitution; result projection; thrown-executor aborts with no later steps) + mutation RED (remove the backward-ref check ⇒ cycle test RED) + agent-core 0 TS errors + lint 0.
- RISK: no gate wiring yet (Phase 2) — the module must NOT be exposed to the model until Phase 2/3 add approval + grounding; transform set is minimal (dotted-path pick only) — count/filter are a later-phase add.
