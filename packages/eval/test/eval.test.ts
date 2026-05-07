import { describe, expect, it } from "vitest";
import type { MuseDatabase } from "@muse/db";
import type { ModelProvider, ModelRequest, ModelResponse } from "@muse/model";
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler
} from "kysely";
import {
  createResponseCompletenessEvaluator,
  EvalRunner,
  ExactMatchJudge,
  InMemoryAgentEvalStore,
  KeywordJudge,
  WeightedRubricJudge,
  createAgentEvalCaseInsert,
  createAgentEvalResultInsert,
  createAgentRunLogInsert,
  createDebugReplayCaptureInsert,
  createEvalCase,
  summarizeAgentEvalSuite,
  mapAgentEvalCaseRow,
  mapAgentEvalResultRow,
  mapAgentRunLogRow,
  mapDebugReplayCaptureRow,
  summarizeEvalResults
} from "../src/index.js";

describe("EvalRunner", () => {
  it("runs eval cases and summarizes results", async () => {
    const runner = new EvalRunner({
      idFactory: () => "result-1",
      judge: new KeywordJudge(),
      model: "model-1",
      now: () => new Date("2026-05-05T00:00:00.000Z"),
      provider: provider(async () => ({ id: "response-1", model: "model-1", output: "alpha beta" }))
    });
    const testCase = createEvalCase({
      input: [{ content: "say alpha", role: "user" }],
      metadata: { keywords: ["alpha", "beta"] },
      name: "Keyword case"
    });

    const results = await runner.runSuite([testCase]);

    expect(results[0]).toMatchObject({ id: "result-1", status: "passed" });
    expect(summarizeEvalResults(results)).toMatchObject({ averageScore: 1, passed: 1, total: 1 });
  });

  it("supports exact match and weighted rubric judges", async () => {
    const exact = new ExactMatchJudge().judge(
      createEvalCase({ expected: "answer", input: [], name: "Exact" }),
      { id: "response-1", model: "model-1", output: "answer" }
    );
    const rubric = new WeightedRubricJudge(() => 0.5).judge(
      createEvalCase({
        input: [],
        name: "Rubric",
        rubric: { criteria: [{ name: "grounded", weight: 2 }], passThreshold: 0.5 }
      }),
      { id: "response-1", model: "model-1", output: "answer" }
    );

    expect(exact.passed).toBe(true);
    expect(rubric).toMatchObject({ passed: true, score: 0.5 });
  });

  it("captures provider failures as eval errors", async () => {
    const runner = new EvalRunner({
      judge: new ExactMatchJudge(),
      model: "model-1",
      provider: provider(async () => {
        throw new Error("provider down");
      })
    });

    await expect(runner.run(createEvalCase({ input: [], name: "Error" }))).resolves.toMatchObject({
      error: "provider down",
      status: "error"
    });
  });
});

describe("AgentEvalStore", () => {
  it("stores eval cases, run logs, results, and debug replay captures in memory and maps DB rows", async () => {
    const store = new InMemoryAgentEvalStore();
    const evalCase = await store.saveCase({
      createdAt: "2026-05-06T00:00:00.000Z",
      expectedAnswerContains: ["approved"],
      expectedToolNames: ["read_policy"],
      id: "case-1",
      name: "Policy answer",
      sourceRunId: "run-1",
      tags: ["policy"],
      userInput: "Use synthetic policy context."
    });
    const runLog = await store.saveRunLog({
      agentType: "react",
      endedAt: "2026-05-06T00:01:00.000Z",
      finalAnswer: "approved",
      model: "model-1",
      runId: "run-1",
      startedAt: "2026-05-06T00:00:00.000Z",
      toolCalls: [{ success: true, toolName: "read_policy" }],
      toolExposure: { count: 1, names: ["read_policy"] },
      userInput: "Use synthetic policy context."
    });
    const result = await store.saveResult({
      caseId: "case-1",
      evaluatedAt: "2026-05-06T00:02:00.000Z",
      id: "result-1",
      passed: true,
      reasons: ["all assertions passed"],
      runId: "run-1",
      score: 1,
      tier: "deterministic"
    });
    const capture = await store.saveDebugReplayCapture({
      capturedAt: "2026-05-06T00:03:00.000Z",
      errorCode: "RUN_FAILED",
      expiresAt: "2026-06-05T00:03:00.000Z",
      id: "capture-1",
      tenantId: "example-tenant",
      userPrompt: "Synthetic replay prompt."
    });
    const sql = createPostgresBuilder()
      .insertInto("agent_eval_results")
      .values(createAgentEvalResultInsert(result))
      .returningAll()
      .compile();

    expect(sql.sql).toContain('insert into "agent_eval_results"');
    expect(await store.getCase("case-1")).toMatchObject({ name: "Policy answer" });
    expect(await store.listCases({ tags: ["policy"] })).toHaveLength(1);
    expect(await store.listRunLogs(10)).toHaveLength(1);
    expect(await store.listResults({ caseId: "case-1" })).toHaveLength(1);
    expect(await store.getDebugReplayCapture("capture-1")).toMatchObject({ tenantId: "example-tenant" });
    expect(mapAgentEvalCaseRow(createAgentEvalCaseInsert(evalCase))).toMatchObject({ id: "case-1" });
    expect(mapAgentRunLogRow(createAgentRunLogInsert(runLog))).toMatchObject({ runId: "run-1" });
    expect(mapAgentEvalResultRow(createAgentEvalResultInsert(result))).toMatchObject({ id: "result-1" });
    expect(mapDebugReplayCaptureRow(createDebugReplayCaptureInsert(capture))).toMatchObject({ id: "capture-1" });
  });

  it("purges expired run logs and debug replay captures by retention window", async () => {
    const store = new InMemoryAgentEvalStore();
    await store.saveRunLog({
      expiresAt: "2026-05-05T00:00:00.000Z",
      runId: "old-run",
      userInput: "old"
    });
    await store.saveRunLog({
      expiresAt: "2026-05-07T00:00:00.000Z",
      runId: "fresh-run",
      userInput: "fresh"
    });
    await store.saveDebugReplayCapture({
      expiresAt: "2026-05-05T00:00:00.000Z",
      id: "old-capture",
      tenantId: "example-tenant",
      userPrompt: "old"
    });
    await store.saveDebugReplayCapture({
      expiresAt: "2026-05-07T00:00:00.000Z",
      id: "fresh-capture",
      tenantId: "example-tenant",
      userPrompt: "fresh"
    });

    await expect(store.purgeExpired(new Date("2026-05-06T00:00:00.000Z"))).resolves.toEqual({
      debugReplayCaptures: 1,
      runLogs: 1
    });
    await expect(store.listRunLogs(10)).resolves.toMatchObject([{ runId: "fresh-run" }]);
    await expect(store.listDebugReplayCaptures(10)).resolves.toMatchObject([{ id: "fresh-capture" }]);
  });

  it("summarizes suite-level behavior assertion coverage", () => {
    const summary = summarizeAgentEvalSuite([
      {
        expectedAnswerContains: ["approved"],
        expectedToolNames: ["read_policy"],
        id: "case-1",
        name: "Behavior case"
      },
      {
        id: "case-2",
        metadata: { owner: "example-user" },
        name: "Metadata only"
      }
    ]);

    expect(summary).toEqual({
      behaviorAssertionCount: 2,
      casesWithoutBehaviorAssertions: ["case-2"],
      totalCases: 2
    });
  });
});

function provider(generate: (request: ModelRequest) => Promise<ModelResponse>): ModelProvider {
  return {
    generate,
    id: "provider-1",
    listModels: async () => [],
    stream: async function* () {}
  };
}

function createPostgresBuilder(): Kysely<MuseDatabase> {
  return new Kysely<MuseDatabase>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler()
    }
  });
}

describe("createResponseCompletenessEvaluator", () => {
  function fakeProvider(output: string, onCall?: (request: ModelRequest) => void): ModelProvider {
    return {
      generate: async (request: ModelRequest): Promise<ModelResponse> => {
        onCall?.(request);
        return { id: "r", model: request.model, output };
      },
      id: "completeness-fake",
      listModels: async () => [],
      stream: async function* () {
        yield { response: { id: "r", model: "completeness-fake", output: "" }, type: "done" } as const;
      }
    };
  }

  it("scores within 0..100 when sampled and the model returns a parseable integer", async () => {
    const evaluator = createResponseCompletenessEvaluator({
      model: "fake/judge",
      now: () => new Date("2026-05-15T00:00:00.000Z"),
      provider: fakeProvider("87"),
      randomSource: () => 0,
      sampleRate: 1
    });
    const result = await evaluator.scoreIfSampled("How do I install muse?", "Run pnpm install.");
    expect(result?.overall).toBe(87);
    expect(result?.sampledAt.toISOString()).toBe("2026-05-15T00:00:00.000Z");
  });

  it("clamps the parsed score into the 0..100 range", async () => {
    const evaluator = createResponseCompletenessEvaluator({
      model: "fake/judge",
      provider: fakeProvider("250"),
      randomSource: () => 0,
      sampleRate: 1
    });
    expect((await evaluator.scoreIfSampled("q", "a"))?.overall).toBe(100);
  });

  it("returns undefined when randomSource exceeds sampleRate", async () => {
    const evaluator = createResponseCompletenessEvaluator({
      model: "fake/judge",
      provider: fakeProvider("80"),
      randomSource: () => 0.9,
      sampleRate: 0.1
    });
    expect(await evaluator.scoreIfSampled("q", "a")).toBeUndefined();
  });

  it("returns undefined for blank prompt or content", async () => {
    const evaluator = createResponseCompletenessEvaluator({
      model: "fake/judge",
      provider: fakeProvider("80"),
      randomSource: () => 0,
      sampleRate: 1
    });
    expect(await evaluator.scoreIfSampled("", "a")).toBeUndefined();
    expect(await evaluator.scoreIfSampled("q", "   ")).toBeUndefined();
  });

  it("returns undefined when the model emits no parseable digits", async () => {
    const evaluator = createResponseCompletenessEvaluator({
      model: "fake/judge",
      provider: fakeProvider("not a score"),
      randomSource: () => 0,
      sampleRate: 1
    });
    expect(await evaluator.scoreIfSampled("q", "a")).toBeUndefined();
  });

  it("falls back to undefined and reports through logger when the provider throws", async () => {
    const errors: unknown[] = [];
    const evaluator = createResponseCompletenessEvaluator({
      logger: (_message, error) => errors.push(error),
      model: "fake/judge",
      provider: {
        generate: async () => {
          throw new Error("judge unreachable");
        },
        id: "fake",
        listModels: async () => [],
        stream: async function* () {
          yield { response: { id: "r", model: "fake", output: "" }, type: "done" } as const;
        }
      },
      randomSource: () => 0,
      sampleRate: 1
    });
    expect(await evaluator.scoreIfSampled("q", "a")).toBeUndefined();
    expect(errors).toHaveLength(1);
  });

  it("scoreNow bypasses sampling and always evaluates", async () => {
    const evaluator = createResponseCompletenessEvaluator({
      model: "fake/judge",
      provider: fakeProvider("42"),
      randomSource: () => 1,
      sampleRate: 0
    });
    const result = await evaluator.scoreNow("q", "a");
    expect(result?.overall).toBe(42);
  });

  it("truncates prompt and content to the configured caps before sending to the judge", async () => {
    let captured = "";
    const evaluator = createResponseCompletenessEvaluator({
      maxContentChars: 5,
      maxPromptChars: 5,
      model: "fake/judge",
      provider: fakeProvider("70", (request) => {
        captured = request.messages.find((message) => message.role === "user")?.content ?? "";
      }),
      randomSource: () => 0,
      sampleRate: 1
    });
    await evaluator.scoreIfSampled("LONG PROMPT TEXT", "LONG CONTENT TEXT");
    expect(captured).toContain("LONG ");
    expect(captured).not.toContain("LONG PROMPT TEXT");
  });

  it("uses temperature=0 by default to keep judge output stable", async () => {
    let observedTemperature: number | undefined;
    const evaluator = createResponseCompletenessEvaluator({
      model: "fake/judge",
      provider: fakeProvider("60", (request) => {
        observedTemperature = request.temperature;
      }),
      randomSource: () => 0,
      sampleRate: 1
    });
    await evaluator.scoreIfSampled("q", "a");
    expect(observedTemperature).toBe(0);
  });
});
