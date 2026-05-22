export type ModelTier = "fast" | "heavy";

export interface TierModels {
  readonly fast: string;
  readonly heavy: string;
}

export interface TieredTask {
  readonly id: string;
  readonly text: string;
}

export interface TieredAssignment {
  readonly id: string;
  readonly tier: ModelTier;
  readonly model: string;
}

export interface TieredRunPlan {
  readonly assignments: readonly TieredAssignment[];
  readonly mode: "parallel" | "sequential";
  readonly collapsedToHeavy: boolean;
}

export interface PlanTieredRunArgs {
  readonly tasks: readonly TieredTask[];
  readonly models: TierModels;
  readonly canHoldBothTiers: () => boolean | Promise<boolean>;
}

// Reasoning is checked BEFORE lookup so a task that carries both signals
// ("define a strategy to…") stays heavy — the safe direction. English +
// Korean stems (Muse is Korean-first).
const REASONING_SIGNALS = [
  "why", "analyze", "analyse", "design", "plan", "compare", "explain",
  "reason", "debug", "refactor", "strategy", "trade-off", "tradeoff",
  "step by step", "prove", "evaluate", "optimize", "optimise", "architect",
  "왜", "분석", "설계", "계획", "비교", "설명", "전략"
] as const;

const LOOKUP_SIGNALS = [
  "what is", "what's", "what time", "who is", "who's", "define",
  "definition of", "convert", "translate", "spell", "look up", "lookup",
  "how many", "when is", "where is",
  "무엇", "정의", "변환", "번역", "몇"
] as const;

/**
 * Deterministic tier router: simple lookups → fast, anything with a
 * reasoning signal (or no clear lookup signal) → heavy. Heavy is the
 * default-when-unsure so reasoning is never silently downgraded to the
 * fast model; fast requires positive lookup evidence and the absence of
 * a reasoning signal.
 */
export function classifyTier(text: string): ModelTier {
  const normalized = text.toLowerCase();
  if (REASONING_SIGNALS.some((signal) => normalized.includes(signal))) {
    return "heavy";
  }
  if (LOOKUP_SIGNALS.some((signal) => normalized.includes(signal))) {
    return "fast";
  }
  return "heavy";
}

/**
 * Turns a set of tasks into a per-task model assignment. When the host
 * can hold both tiers resident at once, each task routes to its
 * classified tier and the run goes parallel. When it cannot — or the
 * capacity probe throws — the run collapses to the single
 * high-capability model, sequentially (fail-open to single-heavy: a
 * probe error must never silently downgrade to the fast model).
 */
export async function planTieredRun(args: PlanTieredRunArgs): Promise<TieredRunPlan> {
  const heavyOnly = (): TieredRunPlan => ({
    assignments: args.tasks.map((task) => ({ id: task.id, model: args.models.heavy, tier: "heavy" })),
    collapsedToHeavy: true,
    mode: "sequential"
  });

  let canHoldBoth: boolean;
  try {
    canHoldBoth = await args.canHoldBothTiers();
  } catch {
    return heavyOnly();
  }

  if (!canHoldBoth) {
    return heavyOnly();
  }

  return {
    assignments: args.tasks.map((task) => {
      const tier = classifyTier(task.text);
      return { id: task.id, model: tier === "fast" ? args.models.fast : args.models.heavy, tier };
    }),
    collapsedToHeavy: false,
    mode: "parallel"
  };
}
