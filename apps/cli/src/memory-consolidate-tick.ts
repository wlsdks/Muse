import { planMemoryConsolidationTick, type MemoryConsolidationTickState, type RecallHitLike } from "@muse/memory";

export interface MemoryConsolidationTickDeps {
  readonly enabled: boolean;
  readonly nowMs: number;
  readonly lastRunMs: number | undefined;
  readonly readHits: () => Promise<readonly RecallHitLike[]>;
  readonly log: (line: string) => void;
  readonly minIntervalMs?: number;
  readonly minNewHits?: number;
}

/**
 * One background memory-consolidation tick: if enabled, read recall hits and run
 * planMemoryConsolidationTick (brake-gated). REPORT-ONLY — on a run it logs the
 * promote/fade counts; it does NOT yet persist promotions (a later slice). Fail-
 * soft (a read/plan error logs nothing and leaves state unchanged). Returns the
 * next scheduling state for the daemon closure to keep.
 */
export async function runMemoryConsolidationTick(deps: MemoryConsolidationTickDeps): Promise<MemoryConsolidationTickState> {
  if (!deps.enabled) return { lastRunMs: deps.lastRunMs };
  let records: readonly RecallHitLike[];
  try {
    records = await deps.readHits();
  } catch {
    return { lastRunMs: deps.lastRunMs };
  }
  const result = planMemoryConsolidationTick(records, { lastRunMs: deps.lastRunMs }, {
    nowMs: deps.nowMs,
    ...(deps.minIntervalMs !== undefined ? { minIntervalMs: deps.minIntervalMs } : {}),
    ...(deps.minNewHits !== undefined ? { minNewHits: deps.minNewHits } : {})
  });
  if (result.ran && result.plan) {
    deps.log(`[${new Date(deps.nowMs).toISOString()}] consolidate-memory: ${result.plan.promote.length.toString()} promotable, ${result.plan.fade.length.toString()} fading (report-only)`);
  }
  return result.nextState;
}
