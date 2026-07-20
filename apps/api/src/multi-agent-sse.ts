/**
 * Server-sent-event framing for the orchestrate stream: the event sequence,
 * the orchestration signal reader, and SSE data encoding.
 */

import { EventEmitter, on as waitForEvent } from "node:events";

import type { AgentRunInput } from "@muse/agent-core";
import { errorMessage } from "@muse/shared";
import {
  InMemoryAgentMessageBus,
  MultiAgentOrchestrator,
  type AgentMessage,
  type MultiAgentOrchestrationResult,
  type OrchestrationMode
} from "@muse/multi-agent";

export interface SseStreamArgs {
  readonly messageBus: InMemoryAgentMessageBus;
  readonly orchestrator: MultiAgentOrchestrator;
  readonly input: AgentRunInput;
  readonly options: {
    readonly mode?: OrchestrationMode;
    readonly maxWorkers?: number;
    readonly maxOutputCharsPerWorker?: number;
    readonly summarizeWorkerOutput?: (workerId: string, output: string) => Promise<string>;
  };
  readonly mode: OrchestrationMode;
}

/** Exported for direct test coverage of the unsubscribe lifecycle. */
export async function* toMultiAgentSseStream(args: SseStreamArgs): AsyncIterable<string> {
  const queue: AgentMessage[] = [];
  const wakeup = new EventEmitter();
  const wakeupNotifications = waitForEvent(wakeup, "wakeup");

  args.messageBus.subscribe("__sse__", (message) => {
    queue.push(message);
    wakeup.emit("wakeup");
  });

  let result: MultiAgentOrchestrationResult | undefined;
  let runtimeError: unknown;
  let finished = false;

  const runPromise = args.orchestrator.run(args.input, args.options).then(
    (value) => {
      result = value;
      finished = true;
      wakeup.emit("wakeup");
    },
    (error) => {
      runtimeError = error;
      finished = true;
      wakeup.emit("wakeup");
    }
  );

  try {
    // Inside the try so an early consumer disconnect (generator
    // .return() suspended at the start frame) still runs `finally`
    // — otherwise the bus subscription + queue leak.
    yield `event: start\ndata: ${sseData(JSON.stringify({ mode: args.mode }))}\n\n`;

    while (!finished || queue.length > 0) {
      if (queue.length === 0 && !finished) {
        await wakeupNotifications.next();
        continue;
      }

      const message = queue.shift();

      if (message) {
        yield `event: agent_message\ndata: ${sseData(
          JSON.stringify({
            content: message.content,
            sourceAgentId: message.sourceAgentId,
            timestamp: message.timestamp.toISOString(),
            ...(message.metadata ? { metadata: message.metadata } : {}),
            ...(message.targetAgentId ? { targetAgentId: message.targetAgentId } : {})
          })
        )}\n\n`;
      }
    }

    await runPromise;

    if (runtimeError) {
      yield `event: error\ndata: ${sseData(
        errorMessage(runtimeError)
      )}\n\n`;
      return;
    }

    if (result) {
      yield `event: done\ndata: ${sseData(
        JSON.stringify({
          mode: result.mode,
          response: { id: result.response.id, model: result.response.model, output: result.response.output },
          ...readOrchestrationSignals(result.response.raw),
          results: result.results.map((step) => ({
            status: step.status,
            workerId: step.workerId,
            ...(step.result ? { output: step.result.response.output } : {}),
            ...(step.error ? { error: step.error } : {})
          })),
          runId: result.runId
        })
      )}\n\n`;
    }
  } finally {
    args.messageBus.clear();
    void wakeupNotifications.return?.();
  }
}

interface OrchestrationSignals {
  readonly conflicts?: readonly string[];
  readonly verification?: { readonly satisfied: boolean; readonly missing?: string };
}

/**
 * Surface the orchestrator's structured coordination signals (cross-worker conflicts,
 * objective-coverage verdict) from the opaque `response.raw` so a consumer can ACT on
 * them — not just read the human ⚠ line baked into the answer text. Defensive narrowing:
 * `raw` is typed `unknown`, and an empty/malformed shape yields no field (no noise).
 */
export function readOrchestrationSignals(raw: unknown): OrchestrationSignals {
  if (typeof raw !== "object" || raw === null) return {};
  const record = raw as { readonly conflicts?: unknown; readonly verification?: unknown };
  const signals: { conflicts?: readonly string[]; verification?: { satisfied: boolean; missing?: string } } = {};

  if (
    Array.isArray(record.conflicts) &&
    record.conflicts.length > 0 &&
    record.conflicts.every((entry) => typeof entry === "string")
  ) {
    signals.conflicts = record.conflicts as readonly string[];
  }

  if (typeof record.verification === "object" && record.verification !== null) {
    const verdict = record.verification as { readonly satisfied?: unknown; readonly missing?: unknown };
    if (typeof verdict.satisfied === "boolean") {
      signals.verification = {
        satisfied: verdict.satisfied,
        ...(typeof verdict.missing === "string" ? { missing: verdict.missing } : {})
      };
    }
  }

  return signals;
}

function sseData(value: string): string {
  return value.split(/\r?\n/u).map((line) => (line.length > 0 ? line : " ")).join("\ndata: ");
}

/**
 * The per-worker deadline (ms) from `MUSE_MULTI_AGENT_WORKER_TIMEOUT_MS`, or
 * undefined when unset/invalid (⇒ no deadline). Strict positive-integer parse so
 * a typo (`30x`, `0`, negative) disables it rather than silently capping at a
 * wrong value — the same fail-safe stance as the orchestrations `?limit` parse.
 */
