/**
 * Tiered-orchestration wiring: env-resolved worker timeouts, stall sweeps,
 * per-tier model routing, capacity probing, and worker construction.
 */

import { summarizeTokenConfidence, type AgentRuntime } from "@muse/agent-core";
import type { AgentSpec } from "@muse/agent-specs";
import {
  createCascadeRuntimeAgentWorker,
  createRuntimeAgentWorker,
  planTieredRun,
  type AgentWorker,
  type TierModels
} from "@muse/multi-agent";

export function resolveWorkerTimeoutMs(env: NodeJS.ProcessEnv): number | undefined {
  const raw = env.MUSE_MULTI_AGENT_WORKER_TIMEOUT_MS?.trim();
  if (!raw || !/^\d+$/u.test(raw)) {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Interval for the background stalled-run sweep. Whole-token decimal ms only
 * (a typo'd "30s" must fall back, not silently become 30); `0` disables the
 * sweep (the on-read sweep in GET /runs still applies). Default 30s — well
 * inside any realistic per-run timeout, and a sweep is just a Map scan.
 */
export function resolveStallSweepMs(env: NodeJS.ProcessEnv): number {
  const raw = env.MUSE_MULTI_AGENT_STALL_SWEEP_MS?.trim();
  if (raw === undefined || raw.length === 0 || !/^\d+$/u.test(raw)) {
    return 30_000;
  }
  return Number.parseInt(raw, 10);
}

export function resolveOrchestrateTierModels(defaultModel: string, env: NodeJS.ProcessEnv): TierModels {
  const fast = env.MUSE_FAST_MODEL?.trim();
  const heavy = env.MUSE_HEAVY_MODEL?.trim();
  return {
    fast: fast && fast.length > 0 ? fast : defaultModel,
    heavy: heavy && heavy.length > 0 ? heavy : defaultModel
  };
}

// Tiered orchestration classifies each worker by its spec's role
// A host that declares it can hold only one model at a time
// (`MUSE_TIER_SINGLE_MODEL_HOST` truthy) makes the capacity probe
// report `false`, so `planTieredRun` collapses a tiered run to the
// single heavy model sequentially instead of thrashing two large
// models. Default (unset) ⇒ both tiers may run.
export function resolveTierCapacityProbe(env: NodeJS.ProcessEnv): () => boolean {
  const single = env.MUSE_TIER_SINGLE_MODEL_HOST?.trim().toLowerCase();
  const canHoldBoth = !(single === "1" || single === "true" || single === "yes");
  return () => canHoldBoth;
}

export interface TieredOrchestration {
  readonly workers: AgentWorker[];
  readonly collapsedToHeavy: boolean;
}

// Tiered orchestration runs each worker on the model `planTieredRun`
// assigns from its spec role (`description`): a "look up / fetch" worker
// takes the fast model, an "analyze / plan" worker the heavy one — so
// one run spreads across both local tiers. When the capacity probe says
// the host can't hold both (or throws), the plan collapses every worker
// to the single heavy model (the caller then forces sequential mode).
// Default-heavy classification never downgrades an unrecognised role.
export async function buildTieredOrchestration(
  specs: readonly AgentSpec[],
  runtime: AgentRuntime,
  tierModels: TierModels,
  canHoldBothTiers: () => boolean | Promise<boolean>
): Promise<TieredOrchestration> {
  const plan = await planTieredRun({
    canHoldBothTiers,
    models: tierModels,
    tasks: specs.map((spec) => ({ id: spec.name, text: spec.description }))
  });
  const modelByName = new Map(plan.assignments.map((assignment) => [assignment.id, assignment.model]));
  const tierByName = new Map(plan.assignments.map((assignment) => [assignment.id, assignment.tier]));
  // Opt-in cascade (FrugalGPT, arXiv:2305.05176): a FAST-classified worker runs
  // the fast model first and escalates to heavy only when its answer is
  // low-confidence — accuracy-positive (a weak fast answer is never kept) and
  // off by default, so the plan is unchanged unless MUSE_TIERED_CASCADE is set.
  const cascade = process.env.MUSE_TIERED_CASCADE === "1" || process.env.MUSE_TIERED_CASCADE?.toLowerCase() === "true";
  return {
    collapsedToHeavy: plan.collapsedToHeavy,
    workers: specs.map((spec) =>
      cascade && !plan.collapsedToHeavy && tierByName.get(spec.name) === "fast"
        ? createCascadeRuntimeAgentWorker({
            confidenceOf: (result) => summarizeTokenConfidence(result.response.logprobs ?? [])?.meanLogprob,
            fastModel: tierModels.fast,
            heavyModel: tierModels.heavy,
            runtime,
            spec: {
              description: spec.description,
              id: spec.name,
              specId: spec.id,
              toolNames: spec.toolNames,
              ...(spec.systemPrompt ? { systemPrompt: spec.systemPrompt } : {})
            }
          })
        : createSpecWorker(spec, runtime, modelByName.get(spec.name))
    )
  };
}

/**
 * Order auto-selected workers (no explicit workerIds) for the sequential
 * pipeline by creation time, not the registry's alphabetical display sort —
 * so the first-seeded worker runs first (e.g. the default Generalist before
 * the Critic, rather than "Critic" winning on name alone). Name breaks ties.
 */
export function orderWorkersForPipeline(specs: readonly AgentSpec[]): readonly AgentSpec[] {
  return [...specs].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.name.localeCompare(b.name)
  );
}

export function createSpecWorker(spec: AgentSpec, runtime: AgentRuntime, model?: string): AgentWorker {
  return createRuntimeAgentWorker({
    ...(model ? { model } : {}),
    runtime,
    spec: {
      description: spec.description,
      id: spec.name,
      specId: spec.id,
      toolNames: spec.toolNames,
      ...(spec.systemPrompt ? { systemPrompt: spec.systemPrompt } : {})
    }
  });
}

