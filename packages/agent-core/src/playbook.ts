/**
 * Playbook — the ACE evolving-strategy surface. This module is a thin
 * re-export hub; the implementation lives in cohesive siblings so every
 * existing `./playbook.js` import keeps resolving:
 *
 *   - `playbook-model`     — the strategy data model (PlaybookStrategy /
 *     PlaybookProvider), the `[Learned Strategies]` renderer + its inline
 *     sanitiser, reward bounds / clamping, the D-UCB recency multiplier, and
 *     the evidence-damped reward + implicit-success reinforcement.
 *   - `playbook-lifecycle` — probation / avoid / stale gating: the Wilson
 *     interval + PEVI ranking utility, Memp lifecycle plan, and the
 *     injectable / avoided / stale eligibility predicates + thresholds.
 *   - `playbook-ranking`   — relevance ranking (lexical + embedding), the
 *     MemRL two-phase + MMR diversity cut, near-duplicate / low-support
 *     suppression, and semantic credit assignment.
 *   - `playbook-injection` — `applyPlaybook`: rank + render + inject the
 *     learned-strategies system block, and read back the injected ids.
 */

export * from "./playbook-model.js";
export * from "./playbook-lifecycle.js";
export * from "./playbook-ranking.js";
export * from "./playbook-injection.js";
