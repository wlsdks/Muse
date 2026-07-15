/**
 * Guard / response-filter / output-guard evaluation extracted from
 * packages/agent-core/src/index.ts.
 *
 * Three pipelines around the model call:
 *   - evaluateGuards: pre-execution input guards. Fails closed —
 *     a guard exception or `allowed: false` decision throws
 *     GuardBlockedError and short-circuits the run.
 *   - applyResponseFilters: post-execution transforms over the model
 *     response. Fails open — a filter exception is logged on the span
 *     but does not change the response.
 *   - applyOutputGuards: post-execution content guards that may modify
 *     or reject the response. Fails closed on exception, supports
 *     allow / modify / reject decisions.
 *
 * Each is a free function taking the relevant deps directly so the
 * AgentRuntime threads its `this.tracer` / `this.metrics` /
 * `this.guardBlockRateMonitor` / `this.guards` / etc. visibly.
 */

import type { GuardBlockRateMonitor } from "@muse/policy";
import type { AgentMetrics, MuseTracer } from "@muse/observability";
import type { ModelResponse } from "@muse/model";
import { errorMessage } from "@muse/shared";

import { GuardBlockedError, OutputGuardBlockedError } from "./errors.js";
import type {
  AgentRunContext,
  GuardDecision,
  GuardStage,
  OutputGuardDecision,
  OutputGuardStage,
  ResponseFilterStage
} from "./types.js";
import type { ResponseFilterEvidence } from "./runtime-internals.js";

export async function evaluateGuards(
  context: AgentRunContext,
  guards: readonly GuardStage[],
  tracer: MuseTracer,
  metrics: AgentMetrics,
  monitor: GuardBlockRateMonitor | undefined
): Promise<void> {
  for (const guard of guards) {
    let decision: GuardDecision;
    const span = tracer.startSpan("muse.guard.evaluate", {
      "guard.id": guard.id,
      "run.id": context.runId
    });

    try {
      decision = await guard.evaluate(context);
    } catch (error) {
      const message = errorMessage(error, "Guard failed closed");
      span.setError(error);
      span.setAttribute("guard.allowed", false);
      span.setAttribute("guard.reason", message);
      span.end();
      monitor?.record({
        allowed: false,
        guardId: guard.id,
        reason: message,
        runId: context.runId
      });
      metrics.recordGuardRejection(guard.id, message, context.input.metadata);
      throw new GuardBlockedError(guard.id, message, "GUARD_ERROR");
    }

    if (!decision.allowed) {
      span.setAttribute("guard.allowed", false);
      span.setAttribute("guard.reason", decision.reason);
      span.end();
      monitor?.record({
        allowed: false,
        guardId: guard.id,
        reason: decision.reason,
        runId: context.runId
      });
      metrics.recordGuardRejection(guard.id, decision.reason, context.input.metadata);
      throw new GuardBlockedError(guard.id, decision.reason, decision.code);
    }

    span.setAttribute("guard.allowed", true);
    span.end();
    monitor?.record({
      allowed: true,
      guardId: guard.id,
      reason: null,
      runId: context.runId
    });
  }
}

export async function applyResponseFilters(
  context: AgentRunContext,
  response: ModelResponse,
  filters: readonly ResponseFilterStage[],
  tracer: MuseTracer,
  evidence: ResponseFilterEvidence = { toolInsights: [], toolsUsed: [], verifiedSources: [] }
): Promise<ModelResponse> {
  let filtered = response;

  for (const stage of filters) {
    const span = tracer.startSpan("muse.response_filter.apply", {
      "response_filter.id": stage.id,
      "run.id": context.runId
    });

    try {
      filtered = await stage.apply(filtered, {
        input: context.input,
        response: filtered,
        runId: context.runId,
        toolInsights: evidence.toolInsights,
        toolsUsed: evidence.toolsUsed,
        verifiedSources: evidence.verifiedSources
      });
      span.setAttribute("response_filter.applied", true);
    } catch (error) {
      span.setError(error);
      span.setAttribute("response_filter.applied", false);
    } finally {
      span.end();
    }
  }

  return filtered;
}

export async function applyOutputGuards(
  context: AgentRunContext,
  response: ModelResponse,
  outputGuards: readonly OutputGuardStage[],
  tracer: MuseTracer,
  metrics: AgentMetrics
): Promise<ModelResponse> {
  let guarded = response;

  for (const stage of outputGuards) {
    let decision: OutputGuardDecision;
    const span = tracer.startSpan("muse.output_guard.check", {
      "output_guard.id": stage.id,
      "run.id": context.runId
    });

    try {
      decision = await stage.check(guarded.output, {
        input: context.input,
        response: guarded,
        runId: context.runId
      });
    } catch (error) {
      const message = errorMessage(error, "Output guard failed closed");
      span.setError(error);
      span.setAttribute("output_guard.action", "rejected");
      span.setAttribute("output_guard.reason", message);
      span.end();
      metrics.recordOutputGuardAction(stage.id, "rejected", message, context.input.metadata);
      throw new OutputGuardBlockedError(stage.id, message, "OUTPUT_GUARD_ERROR");
    }

    if (decision.action === "reject") {
      span.setAttribute("output_guard.action", "rejected");
      span.setAttribute("output_guard.reason", decision.reason);
      span.end();
      metrics.recordOutputGuardAction(stage.id, "rejected", decision.reason, context.input.metadata);
      throw new OutputGuardBlockedError(stage.id, decision.reason, decision.code);
    }

    if (decision.action === "modify") {
      span.setAttribute("output_guard.action", "modified");
      span.setAttribute("output_guard.reason", decision.reason);
      span.end();
      metrics.recordOutputGuardAction(stage.id, "modified", decision.reason, context.input.metadata);
      guarded = { ...guarded, output: decision.content };
      continue;
    }

    span.setAttribute("output_guard.action", "allowed");
    span.end();
    metrics.recordOutputGuardAction(stage.id, "allowed", "", context.input.metadata);
  }

  return guarded;
}
