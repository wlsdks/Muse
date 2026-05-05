import type { AgentRunInput, AgentRunResult, AgentRuntime } from "@muse/agent-core";
import type { ModelMessage } from "@muse/model";
import { createRunId, type JsonObject } from "@muse/shared";

export interface AgentWorker {
  readonly id: string;
  readonly description: string;
  canHandle(input: AgentRunInput): number;
  run(input: AgentRunInput): Promise<AgentRunResult>;
}

export interface HandoffDecision {
  readonly from?: string;
  readonly to: string;
  readonly reason: string;
  readonly confidence: number;
}

export interface MultiAgentRunResult extends AgentRunResult {
  readonly selectedAgentId: string;
  readonly handoffs: readonly HandoffDecision[];
}

export interface SupervisorOptions {
  readonly workers: readonly AgentWorker[];
  readonly defaultWorkerId?: string;
  readonly minConfidence?: number;
  readonly maxHandoffs?: number;
  readonly idFactory?: () => string;
}

export class NoAgentWorkerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoAgentWorkerError";
  }
}

export class RuntimeAgentWorker implements AgentWorker {
  constructor(
    readonly id: string,
    readonly description: string,
    private readonly runtime: AgentRuntime,
    private readonly matcher: (input: AgentRunInput) => number
  ) {}

  canHandle(input: AgentRunInput): number {
    return this.matcher(input);
  }

  run(input: AgentRunInput): Promise<AgentRunResult> {
    return this.runtime.run(input);
  }
}

export class RuleBasedAgentWorker implements AgentWorker {
  private readonly keywords: readonly string[];

  constructor(
    readonly id: string,
    readonly description: string,
    keywords: readonly string[],
    private readonly handler: (input: AgentRunInput) => Promise<AgentRunResult> | AgentRunResult
  ) {
    this.keywords = keywords.map((keyword) => keyword.toLowerCase());
  }

  canHandle(input: AgentRunInput): number {
    const text = joinMessages(input.messages).toLowerCase();
    const matched = this.keywords.filter((keyword) => text.includes(keyword)).length;
    return this.keywords.length === 0 ? 0 : matched / this.keywords.length;
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    return this.handler(input);
  }
}

export class SupervisorAgent {
  private readonly workers: readonly AgentWorker[];
  private readonly defaultWorkerId?: string;
  private readonly minConfidence: number;
  private readonly maxHandoffs: number;
  private readonly idFactory: () => string;

  constructor(options: SupervisorOptions) {
    if (options.workers.length === 0) {
      throw new NoAgentWorkerError("SupervisorAgent requires at least one worker");
    }

    this.workers = options.workers;
    this.defaultWorkerId = options.defaultWorkerId;
    this.minConfidence = options.minConfidence ?? 0.1;
    this.maxHandoffs = options.maxHandoffs ?? 3;
    this.idFactory = options.idFactory ?? (() => createRunId("multi_agent"));
  }

  selectWorker(input: AgentRunInput, excludedIds: ReadonlySet<string> = new Set()): HandoffDecision {
    const ranked = this.workers
      .filter((worker) => !excludedIds.has(worker.id))
      .map((worker) => ({
        confidence: clamp(worker.canHandle(input), 0, 1),
        worker
      }))
      .sort((left, right) => right.confidence - left.confidence);
    const best = ranked[0];

    if (best && best.confidence >= this.minConfidence) {
      return {
        confidence: best.confidence,
        reason: "highest-confidence-worker",
        to: best.worker.id
      };
    }

    const fallback = this.defaultWorkerId
      ? this.workers.find((worker) => worker.id === this.defaultWorkerId && !excludedIds.has(worker.id))
      : this.workers.find((worker) => !excludedIds.has(worker.id));

    if (!fallback) {
      throw new NoAgentWorkerError("No eligible worker remains for handoff");
    }

    return {
      confidence: best?.confidence ?? 0,
      reason: "default-worker",
      to: fallback.id
    };
  }

  async run(input: AgentRunInput): Promise<MultiAgentRunResult> {
    const runId = input.runId ?? this.idFactory();
    const handoffs: HandoffDecision[] = [];
    const excluded = new Set<string>();
    let currentInput: AgentRunInput = { ...input, runId };

    for (let attempt = 0; attempt <= this.maxHandoffs; attempt += 1) {
      const decision = this.selectWorker(currentInput, excluded);
      handoffs.push(decision);

      try {
        const worker = this.requireWorker(decision.to);
        const result = await worker.run({
          ...currentInput,
          metadata: {
            ...currentInput.metadata,
            selectedAgentId: worker.id
          }
        });

        return {
          ...result,
          handoffs,
          runId: result.runId || runId,
          selectedAgentId: worker.id
        };
      } catch (error) {
        excluded.add(decision.to);

        if (attempt >= this.maxHandoffs || excluded.size >= this.workers.length) {
          throw error;
        }

        currentInput = addHandoffMessage(currentInput, decision.to, error);
      }
    }

    throw new NoAgentWorkerError("No worker completed the request");
  }

  private requireWorker(id: string): AgentWorker {
    const worker = this.workers.find((candidate) => candidate.id === id);

    if (!worker) {
      throw new NoAgentWorkerError(`Worker not found: ${id}`);
    }

    return worker;
  }
}

export function createWorkerResult(
  workerId: string,
  output: string,
  input: AgentRunInput,
  metadata: JsonObject = {}
): AgentRunResult {
  return {
    response: {
      id: createRunId("response"),
      model: input.model,
      output,
      raw: metadata
    },
    runId: input.runId ?? createRunId(workerId)
  };
}

function addHandoffMessage(input: AgentRunInput, workerId: string, error: unknown): AgentRunInput {
  const message: ModelMessage = {
    content: `Worker '${workerId}' failed: ${error instanceof Error ? error.message : "unknown error"}`,
    role: "system"
  };

  return {
    ...input,
    messages: [message, ...input.messages]
  };
}

function joinMessages(messages: readonly ModelMessage[]): string {
  return messages.map((message) => message.content).join("\n");
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
