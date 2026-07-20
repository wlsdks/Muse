import { Readable } from "node:stream";
import { type AgentRunInput, type AgentRuntime } from "@muse/agent-core";
import type { AgentSpecRegistry } from "@muse/agent-specs";

import {
  InMemoryAgentMessageBus,
  InMemoryOrchestrationHistoryStore,
  MultiAgentOrchestrator,
  OrchestrationCancelledError,
  SubAgentRunRegistry,
  detectFanInConflicts,
  detectFanInRedundancy,
  type AgentWorker,
  type OrchestrationHistoryStore,
  type OrchestrationMode
} from "@muse/multi-agent";
import type { ModelProvider } from "@muse/model";
import type { FastifyInstance } from "fastify";
import { createAnswerVerifier, createWorkerSummarizer, createWorkerSynthesizer } from "./multi-agent-workers.js";
import { parseOrchestrateBody, toConversationEntry, type ApiError, type OrchestrateBody } from "./multi-agent-parse.js";
import { readOrchestrationSignals, toMultiAgentSseStream } from "./multi-agent-sse.js";
import { buildTieredOrchestration, createSpecWorker, orderWorkersForPipeline, resolveOrchestrateTierModels, resolveStallSweepMs, resolveTierCapacityProbe } from "./multi-agent-tiering.js";

export { parseOrchestrateBody, toConversationEntry } from "./multi-agent-parse.js";
export { toMultiAgentSseStream } from "./multi-agent-sse.js";
export { buildTieredOrchestration, orderWorkersForPipeline, resolveOrchestrateTierModels, resolveStallSweepMs, resolveTierCapacityProbe, resolveWorkerTimeoutMs, type TieredOrchestration } from "./multi-agent-tiering.js";

export interface MultiAgentRouteOptions {
  readonly agentRuntime?: AgentRuntime;
  readonly agentSpecRegistry: AgentSpecRegistry;
  /**
   * Per-route auth gate — the same seam the scheduler/mcp/compat routes use.
   * These routes RUN the agent runtime and fan out workers, so they must gate
   * like their siblings (defense-in-depth alongside the global preHandler; the
   * gap was a `MUSE_REQUIRE_AUTH=false`-with-authService downgrade leaving only
   * multi-agent ungated). Omitted ⇒ no per-route gate (test callers).
   */
  readonly requireAuthenticated?: (
    request: unknown,
    reply: { status(statusCode: number): { send(payload: unknown): void } }
  ) => boolean;
  readonly defaultModel?: string;
  readonly historyStore?: OrchestrationHistoryStore;
  readonly modelProvider?: ModelProvider;
  readonly embed?: (text: string) => Promise<readonly number[]>;
  readonly runRegistry?: SubAgentRunRegistry;
  /**
   * Per-worker wall-clock deadline (ms) for an orchestration run. Threaded into
   * the orchestrator so a hung sub-agent is terminated and recorded `timed-out`
   * through the LIVE server, not just in constructor tests. Opt-in: omitted ⇒ no
   * deadline (legacy behavior). It is a HARD cap (not a no-progress timeout), so
   * it needs no heartbeat to be correct.
   */
  readonly workerTimeoutMs?: number;
}


export function registerMultiAgentRoutes(server: FastifyInstance, options: MultiAgentRouteOptions): void {
  const historyStore = options.historyStore ?? new InMemoryOrchestrationHistoryStore();
  const runRegistry = options.runRegistry ?? new SubAgentRunRegistry();

  // Background stall sweep. The on-read sweep in GET /runs makes a hung run
  // observable only to a caller who polls — with nobody watching, a stalled
  // record stays "running" forever and every consumer keyed on terminal
  // parents (orphan recovery, cancel-children) never fires. Unref'd (never
  // keeps the process alive) and cleared on server close.
  const sweepMs = resolveStallSweepMs(process.env);
  if (sweepMs > 0) {
    const sweepTimer = setInterval(() => {
      runRegistry.markStalledAsTimedOut();
    }, sweepMs);
    sweepTimer.unref?.();
    server.addHook("onClose", async () => {
      clearInterval(sweepTimer);
    });
  }

  // Per-route auth gate (defense-in-depth beside the global preHandler). Returns
  // true when the request may proceed; when it returns false the gate already
  // sent the 401. No gate configured (tests) ⇒ allow.
  const authed = (request: unknown, reply: { status(statusCode: number): { send(payload: unknown): void } }): boolean =>
    options.requireAuthenticated === undefined || options.requireAuthenticated(request, reply);

  server.get("/api/multi-agent/orchestrations", async (request, reply) => {
    if (!authed(request, reply)) {
      return;
    }
    const limitRaw = (request.query as { readonly limit?: string } | undefined)?.limit;
    let limit: number | undefined;

    if (limitRaw !== undefined) {
      // Strict-parse — `Number.parseInt("20x", 10)` returns 20 and
      // would pass the range check, so a typo'd `?limit=20x` /
      // unit-slip `?limit=5min` silently masqueraded as valid.
      const trimmed = limitRaw.trim();
      const parsed = /^\d+$/u.test(trimmed) ? Number.parseInt(trimmed, 10) : Number.NaN;
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1_000) {
        return reply.status(400).send({
          code: "INVALID_LIMIT",
          message: "limit must be an integer between 0 and 1000"
        } satisfies ApiError);
      }
      limit = parsed;
    }

    const entries = limit === undefined ? historyStore.list() : historyStore.list(limit);
    return {
      entries: entries.map((entry) => ({
        completedCount: entry.completedCount,
        durationMs: entry.durationMs,
        failedCount: entry.failedCount,
        finishedAt: entry.finishedAt.toISOString(),
        mode: entry.mode,
        runId: entry.runId,
        startedAt: entry.startedAt.toISOString(),
        status: entry.status,
        workerCount: entry.workerCount,
        ...(entry.conversation ? { conversationLength: entry.conversation.length } : { conversationLength: 0 }),
        ...(entry.error ? { error: entry.error } : {})
      })),
      total: entries.length
    };
  });

  server.get("/api/multi-agent/orchestrations/stats", async (request, reply) => {
    if (!authed(request, reply)) {
      return undefined;
    }
    return historyStore.summary();
  });

  // Live sub-agent run lifecycle (running runs + any stalled→timed-out
  // transitions), distinct from the finished-run audit above. Marking
  // stalled runs as timed-out on read makes a hung sub-agent observable
  // without a background sweep.
  server.get("/api/multi-agent/runs", async (request, reply) => {
    if (!authed(request, reply)) {
      return undefined;
    }
    const timedOut = runRegistry.markStalledAsTimedOut();
    return {
      activeCount: runRegistry.activeCount(),
      runs: runRegistry.list().map((run) => ({
        finishedAt: run.finishedAt?.toISOString(),
        lastHeartbeatAt: run.lastHeartbeatAt.toISOString(),
        parentRunId: run.parentRunId,
        runId: run.runId,
        startedAt: run.startedAt.toISOString(),
        status: run.status,
        ...(run.outcome ? { outcome: run.outcome } : {}),
        ...(run.error ? { error: run.error } : {})
      })),
      timedOutOnRead: timedOut.length
    };
  });

  // User-facing stop for a live run. Cooperative: the registry flags the
  // run cancelled; the orchestrator refuses to start further workers and
  // finalizes the run as cancelled. An in-flight model call still settles
  // in the background but can no longer flip the run's terminal status.
  server.post("/api/multi-agent/runs/:runId/cancel", async (request, reply) => {
    if (!authed(request, reply)) {
      return undefined;
    }
    const { runId } = request.params as { runId: string };
    const existing = runRegistry.get(runId);
    if (!existing) {
      return reply.status(404).send({ code: "RUN_NOT_FOUND", message: `no run "${runId}"` } satisfies ApiError);
    }
    if (existing.status !== "running") {
      return reply.status(409).send({
        code: "RUN_NOT_RUNNING",
        message: `run is already ${existing.status}`
      } satisfies ApiError);
    }
    runRegistry.cancel(runId);
    // Take the whole tree down: child worker runs die with the parent.
    for (const child of runRegistry.children(runId)) {
      if (child.status === "running") {
        runRegistry.cancel(child.runId, "parent run cancelled");
      }
    }
    return { cancelled: true, runId };
  });

  server.get("/api/multi-agent/orchestrations/:runId", async (request, reply) => {
    if (!authed(request, reply)) {
      return undefined;
    }
    const { runId } = request.params as { readonly runId: string };

    if (!runId || runId.length === 0) {
      return reply.status(400).send({
        code: "INVALID_RUN_ID",
        message: "runId path parameter is required"
      } satisfies ApiError);
    }

    const entry = historyStore.getByRunId(runId);

    if (!entry) {
      return reply.status(404).send({
        code: "ORCHESTRATION_NOT_FOUND",
        message: `Orchestration not found for runId: ${runId}`
      } satisfies ApiError);
    }

    return {
      completedCount: entry.completedCount,
      conversation: (entry.conversation ?? []).map((message) => ({
        content: message.content,
        sourceAgentId: message.sourceAgentId,
        timestamp: message.timestamp.toISOString(),
        ...(message.metadata ? { metadata: message.metadata } : {}),
        ...(message.targetAgentId ? { targetAgentId: message.targetAgentId } : {})
      })),
      durationMs: entry.durationMs,
      failedCount: entry.failedCount,
      finishedAt: entry.finishedAt.toISOString(),
      mode: entry.mode,
      runId: entry.runId,
      startedAt: entry.startedAt.toISOString(),
      status: entry.status,
      workerCount: entry.workerCount,
      ...(entry.conflicts && entry.conflicts.length > 0 ? { conflicts: entry.conflicts } : {}),
      ...(entry.redundancies && entry.redundancies.length > 0 ? { redundancies: entry.redundancies } : {}),
      ...(entry.verificationSatisfied !== undefined ? { verificationSatisfied: entry.verificationSatisfied } : {}),
      ...(entry.error ? { error: entry.error } : {})
    };
  });

  server.post("/api/multi-agent/orchestrate", async (request, reply) => {
    if (!authed(request, reply)) {
      return undefined;
    }
    if (!options.agentRuntime) {
      return reply.status(503).send({
        code: "AGENT_RUNTIME_UNAVAILABLE",
        message: "Agent runtime is not configured"
      } satisfies ApiError);
    }

    const parsed = parseOrchestrateBody(request.body);

    if (!parsed.ok) {
      return reply.status(400).send(parsed.error);
    }

    const prepared = await prepareOrchestration(options, parsed.value, historyStore, runRegistry);

    if ("error" in prepared) {
      return reply.status(prepared.error.status).send(prepared.error.body);
    }

    const { messageBus, input, orchestrator, orchestrationOptions } = prepared;

    if (parsed.value.background === true) {
      try {
        const handle = orchestrator.runBackground(input, orchestrationOptions);
        return reply.status(202).send({
          background: true,
          orchestrationId: handle.orchestrationId,
          subtaskCount: handle.subtaskCount
        });
      } catch (error) {
        reply.log.error({ err: error }, "multi-agent background orchestration dispatch failed");
        return reply.status(500).send({
          code: "MULTI_AGENT_ORCHESTRATION_FAILED",
          message: "multi-agent orchestration failed"
        } satisfies ApiError);
      }
    }

    try {
      const orchestration = await orchestrator.run(input, orchestrationOptions);

      return {
        conversation: messageBus.getConversation().map(toConversationEntry),
        mode: orchestration.mode,
        response: {
          id: orchestration.response.id,
          model: orchestration.response.model,
          output: orchestration.response.output
        },
        ...readOrchestrationSignals(orchestration.response.raw),
        results: orchestration.results.map((step) => ({
          status: step.status,
          workerId: step.workerId,
          ...(step.result ? { model: step.result.response.model, output: step.result.response.output } : {}),
          ...(step.error ? { error: step.error } : {})
        })),
        runId: orchestration.runId
      };
    } catch (error) {
      if (error instanceof OrchestrationCancelledError) {
        return reply.status(200).send({ cancelled: true, ...(input.runId ? { runId: input.runId } : {}) });
      }
      // Server-side log only; the raw message can leak internals.
      reply.log.error({ err: error }, "multi-agent orchestration failed");
      return reply.status(500).send({
        code: "MULTI_AGENT_ORCHESTRATION_FAILED",
        message: "multi-agent orchestration failed"
      } satisfies ApiError);
    }
  });

  server.post("/api/multi-agent/orchestrate/stream", async (request, reply) => {
    if (!authed(request, reply)) {
      return undefined;
    }
    if (!options.agentRuntime) {
      return reply.status(503).send({
        code: "AGENT_RUNTIME_UNAVAILABLE",
        message: "Agent runtime is not configured"
      } satisfies ApiError);
    }

    const parsed = parseOrchestrateBody(request.body);

    if (!parsed.ok) {
      return reply.status(400).send(parsed.error);
    }

    const prepared = await prepareOrchestration(options, parsed.value, historyStore, runRegistry);

    if ("error" in prepared) {
      return reply.status(prepared.error.status).send(prepared.error.body);
    }

    const { messageBus, input, orchestrator, orchestrationOptions, effectiveMode } = prepared;

    reply.header("content-type", "text/event-stream; charset=utf-8");
    reply.header("cache-control", "no-cache");
    reply.header("x-accel-buffering", "no");

    return reply.send(
      Readable.from(toMultiAgentSseStream({ messageBus, orchestrator, input, options: orchestrationOptions, mode: effectiveMode ?? "sequential" }))
    );
  });
}

interface PreparedOrchestrationError {
  readonly error: { readonly status: number; readonly body: ApiError };
}

type OrchestrationRunOptions = NonNullable<Parameters<MultiAgentOrchestrator["run"]>[1]>;

interface PreparedOrchestration {
  readonly messageBus: InMemoryAgentMessageBus;
  readonly input: AgentRunInput;
  readonly orchestrator: MultiAgentOrchestrator;
  readonly orchestrationOptions: OrchestrationRunOptions;
  readonly effectiveMode: OrchestrationMode | undefined;
}

// Shared setup for both /orchestrate handlers: spec selection, worker
// construction (incl. tiered), message bus, input, and orchestration
// options. Returns an `error` envelope (with the HTTP status the caller
// must send) instead of writing to `reply`, so the two handlers keep
// their distinct response shapes (JSON vs SSE) while sharing this body.
async function prepareOrchestration(
  options: MultiAgentRouteOptions,
  parsed: OrchestrateBody,
  historyStore: OrchestrationHistoryStore,
  runRegistry: SubAgentRunRegistry
): Promise<PreparedOrchestration | PreparedOrchestrationError> {
  const allSpecs = await options.agentSpecRegistry.listEnabled();
  const requestedIds = parsed.workerIds;
  const selected = requestedIds
    ? allSpecs.filter((spec) => requestedIds.includes(spec.name))
    : orderWorkersForPipeline(allSpecs);

  if (selected.length === 0) {
    return {
      error: {
        body: {
          code: "NO_AGENT_WORKERS",
          message: requestedIds
            ? "No enabled agent specs match the requested workerIds"
            : "No enabled agent specs are available to orchestrate"
        },
        status: 409
      }
    };
  }

  const messageBus = new InMemoryAgentMessageBus();
  const input: AgentRunInput = {
    messages: [{ content: parsed.message, role: "user" }],
    model: parsed.model ?? options.defaultModel ?? "default"
  };
  let workers: AgentWorker[];
  let effectiveMode = parsed.mode;
  if (parsed.tiered) {
    const tiered = await buildTieredOrchestration(
      selected,
      options.agentRuntime!,
      resolveOrchestrateTierModels(input.model, process.env),
      resolveTierCapacityProbe(process.env)
    );
    workers = tiered.workers;
    if (tiered.collapsedToHeavy) {
      effectiveMode = "sequential";
    }
  } else {
    workers = selected.map((spec) => createSpecWorker(spec, options.agentRuntime!));
  }
  const orchestrator = new MultiAgentOrchestrator({
    historyStore,
    messageBus,
    runRegistry,
    workers,
    ...(options.workerTimeoutMs !== undefined && options.workerTimeoutMs > 0
      ? { workerTimeoutMs: options.workerTimeoutMs }
      : {})
  });

  const summarizer = parsed.summarize === true
    ? createWorkerSummarizer(options.modelProvider, input.model)
    : undefined;
  const synthesizer = parsed.synthesize === true
    ? createWorkerSynthesizer(options.modelProvider, input.model)
    : undefined;
  const verifier = parsed.verify === true
    ? createAnswerVerifier(options.modelProvider, input.model)
    : undefined;
  const detectConflicts = options.embed
    ? (parts: ReadonlyArray<{ readonly workerId: string; readonly output: string }>) =>
        detectFanInConflicts(parts, options.embed!)
    : undefined;
  const detectRedundancies = options.embed
    ? (parts: ReadonlyArray<{ readonly workerId: string; readonly output: string }>) =>
        detectFanInRedundancy(parts, options.embed!)
    : undefined;
  const orchestrationOptions: OrchestrationRunOptions = {
    ...(effectiveMode ? { mode: effectiveMode } : {}),
    ...(parsed.maxWorkers !== undefined ? { maxWorkers: parsed.maxWorkers } : {}),
    ...(parsed.maxOutputCharsPerWorker !== undefined
      ? { maxOutputCharsPerWorker: parsed.maxOutputCharsPerWorker }
      : {}),
    ...(summarizer ? { summarizeWorkerOutput: summarizer } : {}),
    ...(synthesizer ? { synthesizeFinalAnswer: synthesizer } : {}),
    ...(verifier ? { verifyFinalAnswer: verifier } : {}),
    ...(detectConflicts ? { detectConflicts } : {}),
    ...(detectRedundancies ? { detectRedundancies } : {})
  };

  return { effectiveMode, input, messageBus, orchestrationOptions, orchestrator };
}

