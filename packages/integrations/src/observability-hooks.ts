/**
 * Observability HookStage factories extracted from
 * packages/integrations/src/index.ts.
 *
 * Owns the three hooks that bridge `agent-core`'s lifecycle into
 * `@muse/observability` detectors / evaluators:
 *
 *   - `createCostAnomalyHook`: records per-request cost into a
 *     `CostAnomalyDetector` (+ optional per-tenant budget tracker)
 *     and forwards anomalies / budget transitions.
 *   - `createPromptDriftHook`: records input length on `beforeStart`
 *     + output length on `afterComplete`, forwards drift anomalies.
 *   - `createSloAlertHook`: records wall-clock latency + result
 *     outcomes into a `SloAlertEvaluator`, fires SLO violations.
 *
 * All three swallow notify failures via the optional `logger` so the
 * agent run never breaks on observability signaling.
 *
 * Re-exported from the integrations barrel for backwards compatibility.
 */

import type { AgentRunContext, HookStage } from "@muse/agent-core";
import type { ModelResponse } from "@muse/model";
import type {
  CostAnomaly,
  CostAnomalyDetector,
  DriftAnomaly,
  MonthlyBudgetStatus,
  MonthlyBudgetTracker,
  PromptDriftDetector,
  SloAlertEvaluator,
  SloViolation
} from "@muse/observability";
import type { Awaitable } from "./index.js";

export interface CostAnomalyHookOptions {
  readonly detector: CostAnomalyDetector;
  readonly id?: string;
  readonly budgetTracker?: MonthlyBudgetTracker;
  readonly tenantIdFromContext?: (context: AgentRunContext) => string | undefined;
  readonly costFromResponse: (context: AgentRunContext, response: ModelResponse) => number | undefined;
  readonly notify?: (event: { readonly anomaly?: CostAnomaly; readonly budgetStatus?: MonthlyBudgetStatus; readonly tenantId?: string }) => Awaitable<void>;
  readonly logger?: (message: string, error?: unknown) => void;
}

export function createCostAnomalyHook(options: CostAnomalyHookOptions): HookStage {
  return {
    afterComplete: async (context, response) => {
      const cost = options.costFromResponse(context, response);
      if (cost === undefined) {
        return;
      }
      options.detector.recordCost(cost);
      const anomaly = options.detector.evaluate();
      const tenantId = options.tenantIdFromContext?.(context);
      let budgetStatus: MonthlyBudgetStatus | undefined;
      if (tenantId && options.budgetTracker) {
        budgetStatus = options.budgetTracker.recordCost(tenantId, cost);
      }
      if (!options.notify) {
        return;
      }
      if (anomaly === undefined && (budgetStatus === undefined || budgetStatus === "ok")) {
        return;
      }
      try {
        await options.notify({
          ...(anomaly ? { anomaly } : {}),
          ...(budgetStatus ? { budgetStatus } : {}),
          ...(tenantId ? { tenantId } : {})
        });
      } catch (error) {
        options.logger?.("CostAnomalyHook notify failed", error);
      }
    },
    id: options.id ?? "cost-anomaly"
  };
}

export interface PromptDriftHookOptions {
  readonly detector: PromptDriftDetector;
  readonly id?: string;
  readonly notify?: (anomalies: readonly DriftAnomaly[]) => Awaitable<void>;
  readonly logger?: (message: string, error?: unknown) => void;
}

export function createPromptDriftHook(options: PromptDriftHookOptions): HookStage {
  return {
    afterComplete: async (_context, response) => {
      options.detector.recordOutput(response.output?.length ?? 0);
      const anomalies = options.detector.evaluate();
      if (anomalies.length === 0 || !options.notify) {
        return;
      }
      try {
        await options.notify(anomalies);
      } catch (error) {
        options.logger?.("PromptDriftHook notify failed", error);
      }
    },
    beforeStart: async (context) => {
      const totalLength = context.input.messages.reduce(
        (sum, message) => sum + (message.content?.length ?? 0),
        0
      );
      options.detector.recordInput(totalLength);
    },
    id: options.id ?? "prompt-drift"
  };
}

export interface SloAlertHookOptions {
  readonly evaluator: SloAlertEvaluator;
  readonly id?: string;
  readonly notify?: (violations: readonly SloViolation[]) => Awaitable<void>;
  readonly now?: () => number;
  readonly logger?: (message: string, error?: unknown) => void;
}

export function createSloAlertHook(options: SloAlertHookOptions): HookStage {
  const now = options.now ?? (() => Date.now());
  const startedAtByRun = new Map<string, number>();

  async function dispatch(violations: readonly SloViolation[]): Promise<void> {
    if (violations.length === 0 || !options.notify) {
      return;
    }
    try {
      await options.notify(violations);
    } catch (error) {
      options.logger?.("SloAlertHook notify failed", error);
    }
  }

  return {
    afterComplete: async (context) => {
      const startedAt = startedAtByRun.get(context.runId) ?? context.startedAt.getTime();
      startedAtByRun.delete(context.runId);
      options.evaluator.recordLatency(now() - startedAt);
      options.evaluator.recordResult(true);
      await dispatch(options.evaluator.evaluate());
    },
    beforeStart: async (context) => {
      startedAtByRun.set(context.runId, now());
    },
    id: options.id ?? "slo-alert",
    onError: async (context) => {
      const startedAt = startedAtByRun.get(context.runId) ?? context.startedAt.getTime();
      startedAtByRun.delete(context.runId);
      options.evaluator.recordLatency(now() - startedAt);
      options.evaluator.recordResult(false);
      await dispatch(options.evaluator.evaluate());
    }
  };
}
