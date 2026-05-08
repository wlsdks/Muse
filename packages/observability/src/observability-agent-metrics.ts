/**
 * AgentMetrics implementations + their wiring decorators extracted
 * from packages/observability/src/index.ts.
 *
 * Owns `NoOpAgentMetrics` (drops every event), `InMemoryAgentMetrics`
 * (records every event into a queryable `recordedEvents()` array),
 * `createNoOpAgentMetrics` factory, and the two derived-metrics
 * decorators (`createSloFeedingAgentMetrics` is a thin wrapper around
 * `createDerivedAgentMetrics({ slo })`; `createDerivedAgentMetrics`
 * is the generalised fan-out that lets the operator forward
 * `recordAgentRun` into an `SloAlertEvaluator` and `recordTokenUsage`
 * into a `PromptDriftDetector` without altering the inner metrics).
 *
 * Re-exported from the observability barrel for backwards compatibility.
 */

import type { ModelUsage } from "@muse/model";
import type { JsonObject } from "@muse/shared";
import type {
  PromptDriftDetector,
  SloAlertEvaluator
} from "./observability-detectors.js";
import type {
  AgentMetrics,
  AgentRunMetric,
  OutputGuardMetricAction,
  RecordedMetricEvent
} from "./index.js";

export class NoOpAgentMetrics implements AgentMetrics {
  recordAgentRun(): void {}
  recordGuardRejection(): void {}
  recordOutputGuardAction(): void {}
  recordTokenUsage(): void {}
}

export class InMemoryAgentMetrics implements AgentMetrics {
  private readonly events: RecordedMetricEvent[] = [];

  recordAgentRun(event: AgentRunMetric): void {
    this.events.push({
      payload: toJsonObject(event),
      type: "agent_run"
    });
  }

  recordGuardRejection(stage: string, reason: string, metadata: JsonObject = {}): void {
    this.events.push({
      payload: { metadata, reason, stage },
      type: "guard_rejection"
    });
  }

  recordOutputGuardAction(
    stage: string,
    action: OutputGuardMetricAction,
    reason: string,
    metadata: JsonObject = {}
  ): void {
    this.events.push({
      payload: { action, metadata, reason, stage },
      type: "output_guard_action"
    });
  }

  recordTokenUsage(usage: ModelUsage, metadata: JsonObject = {}): void {
    this.events.push({
      payload: { metadata, ...toJsonObject(usage) },
      type: "token_usage"
    });
  }

  recordedEvents(): readonly RecordedMetricEvent[] {
    return this.events.map((event) => ({
      payload: { ...event.payload },
      type: event.type
    }));
  }
}

export function createNoOpAgentMetrics(): AgentMetrics {
  return new NoOpAgentMetrics();
}

/**
 * Wraps an existing AgentMetrics so that every `recordAgentRun` event also
 * feeds an `SloAlertEvaluator` (latency sample + success/failure result).
 * Other metric methods are forwarded unchanged so the wrapper is a drop-in
 * replacement for the inner metrics in the runtime.
 */
export function createSloFeedingAgentMetrics(slo: SloAlertEvaluator, inner: AgentMetrics): AgentMetrics {
  return createDerivedAgentMetrics({ inner, slo });
}

export interface DerivedAgentMetricsOptions {
  readonly inner: AgentMetrics;
  readonly slo?: SloAlertEvaluator;
  readonly drift?: PromptDriftDetector;
}

/**
 * Generalised fan-out: every method on the inner AgentMetrics still gets
 * called, AND each optional derived sink receives the slice of data it cares
 * about. `slo` consumes `recordAgentRun` (latency + result), `drift` consumes
 * `recordTokenUsage` (input + output token lengths). Cost-anomaly is fed via
 * `createCostAnomalyFeedingTokenUsageSink` because cost lives on
 * `TokenUsageRecord`, not on `AgentMetrics`.
 */
export function createDerivedAgentMetrics(options: DerivedAgentMetricsOptions): AgentMetrics {
  const { inner, slo, drift } = options;
  return {
    recordAgentRun(event) {
      slo?.recordLatency(event.durationMs);
      slo?.recordResult(event.status === "completed");
      inner.recordAgentRun(event);
    },
    recordGuardRejection(stage, reason, metadata) {
      inner.recordGuardRejection(stage, reason, metadata);
    },
    recordOutputGuardAction(stage, action, reason, metadata) {
      inner.recordOutputGuardAction(stage, action, reason, metadata);
    },
    recordTokenUsage(usage, metadata) {
      if (drift) {
        if (typeof usage.inputTokens === "number") {
          drift.recordInput(usage.inputTokens);
        }
        if (typeof usage.outputTokens === "number") {
          drift.recordOutput(usage.outputTokens);
        }
      }
      inner.recordTokenUsage(usage, metadata);
    }
  };
}

function toJsonObject(value: object): JsonObject {
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, entry]) => entry !== undefined)
  ) as JsonObject;
}
