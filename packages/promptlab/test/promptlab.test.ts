import { describe, expect, it } from "vitest";
import type { ModelProvider, ModelRequest, ModelResponse } from "@muse/model";
import { createEvalCase } from "@muse/eval";
import {
  InMemoryFeedbackStore,
  InMemoryPromptLabCatalogStore,
  InMemoryPromptLabExperimentStore,
  PromptExperimentRunner,
  applySystemPrompt,
  createFeedbackInsert,
  createExperimentInsert,
  createExperimentReportInsert,
  createIntentDefinitionInsert,
  createPersonaInsert,
  createPromptTemplateInsert,
  createPromptVersionInsert,
  createPromptExperiment,
  createPromptVariant,
  createTrialInsert,
  mapIntentDefinitionRow,
  mapPersonaRow,
  mapPromptTemplateRow,
  mapPromptVersionRow,
  mapExperimentReportRow,
  mapExperimentRow,
  mapFeedbackRow,
  mapTrialRow,
  rankPromptVariants
} from "../src/index.js";

describe("PromptExperimentRunner", () => {
  it("runs every variant against every case and ranks variants", async () => {
    const seen: string[] = [];
    const runner = new PromptExperimentRunner({
      judge: async (_testCase, response) => ({
        criterionScores: { length: response.output.includes("A") ? 1 : 0 },
        passed: response.output.includes("A"),
        reasons: [],
        score: response.output.includes("A") ? 1 : 0
      }),
      provider: provider(async (request) => {
        seen.push(request.messages[0]?.content ?? "");
        return {
          id: `response-${seen.length}`,
          model: request.model,
          output: request.messages[0]?.content.includes("Variant A") ? "A" : "B"
        };
      })
    });
    const experiment = createPromptExperiment({
      cases: [createEvalCase({ input: [{ content: "Hello", role: "user" }], name: "Case" })],
      id: "experiment-1",
      model: "model-1",
      name: "Prompt test",
      variants: [
        createPromptVariant({ id: "variant-a", name: "A", systemPrompt: "Variant A" }),
        createPromptVariant({ id: "variant-b", name: "B", systemPrompt: "Variant B" })
      ]
    });

    const results = await runner.run(experiment);

    expect(results).toHaveLength(2);
    expect(rankPromptVariants(results)[0]).toMatchObject({ averageScore: 1, variantId: "variant-a" });
    expect(seen).toEqual(["Variant A", "Variant B"]);
  });

  it("prepends system prompt without dropping existing messages", () => {
    expect(applySystemPrompt([{ content: "Hi", role: "user" }], "System")[0]).toEqual({
      content: "System",
      role: "system"
    });
  });
});

describe("FeedbackStore", () => {
  it("stores feedback in memory and maps DB rows", async () => {
    const store = new InMemoryFeedbackStore();
    const saved = await store.save({
      comment: "Too vague",
      id: "feedback-1",
      query: "How should I decide?",
      rating: "thumbs_down",
      response: "Pick one",
      reviewStatus: "inbox",
      tags: ["decision"],
      templateId: "template-1",
      timestamp: "2026-05-06T00:00:00.000Z",
      toolsUsed: [],
      version: 1
    });
    const row = createFeedbackInsert(saved);

    expect(await store.get("feedback-1")).toMatchObject({ id: "feedback-1", query: "How should I decide?" });
    expect(await store.list()).toHaveLength(1);
    expect(mapFeedbackRow(row)).toMatchObject({
      comment: "Too vague",
      id: "feedback-1",
      rating: "thumbs_down",
      reviewStatus: "inbox",
      templateId: "template-1"
    });
    expect(await store.delete("feedback-1")).toBe(true);
  });
});

describe("PromptLabExperimentStore", () => {
  it("stores experiments, trials, and reports in memory and maps DB rows", async () => {
    const store = new InMemoryPromptLabExperimentStore();
    const experiment = await store.saveExperiment({
      baselineVersionId: "version-baseline",
      candidateVersionIds: ["version-candidate"],
      createdAt: "2026-05-06T00:00:00.000Z",
      createdBy: "admin",
      evaluationConfig: { rulesEnabled: true },
      id: "experiment-1",
      name: "Decision prompt test",
      repetitions: 1,
      status: "PENDING",
      templateId: "template-1",
      testQueries: [{ query: "Which option is better?" }]
    });
    const trial = {
      durationMs: 12,
      evaluations: [{ passed: true, score: 1, tier: "STRUCTURAL" }],
      executedAt: "2026-05-06T00:01:00.000Z",
      id: "trial-1",
      promptVersionId: "version-baseline",
      promptVersionNumber: 1,
      query: "Which option is better?",
      response: "Compare tradeoffs.",
      success: true,
      toolsUsed: []
    };
    await store.saveTrials("experiment-1", [trial]);
    const report = await store.saveReport("experiment-1", {
      experimentName: "Decision prompt test",
      generatedAt: "2026-05-06T00:02:00.000Z",
      recommendation: { bestVersionId: "version-baseline" },
      totalTrials: 1
    });

    expect(await store.getExperiment("experiment-1")).toMatchObject({ id: "experiment-1", templateId: "template-1" });
    expect(await store.listExperiments()).toHaveLength(1);
    expect(await store.listTrials("experiment-1")).toHaveLength(1);
    expect(await store.getReport("experiment-1")).toMatchObject({ experimentId: "experiment-1", totalTrials: 1 });
    expect(mapExperimentRow(createExperimentInsert(experiment))).toMatchObject({
      id: "experiment-1",
      status: "PENDING",
      templateId: "template-1"
    });
    expect(mapTrialRow(createTrialInsert("experiment-1", trial))).toMatchObject({
      experimentId: "experiment-1",
      id: "trial-1",
      success: true
    });
    expect(mapExperimentReportRow(createExperimentReportInsert("experiment-1", report))).toMatchObject({
      experimentId: "experiment-1",
      totalTrials: 1
    });
    expect(await store.deleteExperiment("experiment-1")).toBe(true);
    expect(await store.getReport("experiment-1")).toBeUndefined();
  });
});

describe("PromptLabCatalogStore", () => {
  it("stores personas, prompt templates, versions, and intents in memory and maps DB rows", async () => {
    const store = new InMemoryPromptLabCatalogStore();
    const persona = await store.savePersona({
      createdAt: "2026-05-06T00:00:00.000Z",
      id: "persona-1",
      isDefault: true,
      name: "Planner",
      promptTemplateId: "template-1",
      systemPrompt: "Help compare options."
    });
    const template = await store.saveTemplate({
      createdAt: "2026-05-06T00:00:00.000Z",
      description: "Decision prompt",
      id: "template-1",
      name: "Decision",
      versions: [{
        changeLog: "Initial",
        content: "Compare tradeoffs.",
        createdAt: "2026-05-06T00:01:00.000Z",
        id: "version-1",
        status: "ACTIVE",
        templateId: "template-1",
        version: 1
      }]
    });
    const intent = await store.saveIntent({
      createdAt: "2026-05-06T00:00:00.000Z",
      description: "Compare choices",
      enabled: true,
      examples: ["A or B?"],
      keywords: ["compare"],
      name: "compare_options",
      profile: { kind: "decision" }
    });
    const version = Array.isArray(template.versions) ? template.versions[0] : {};

    expect(await store.getPersona("persona-1")).toMatchObject({ name: "Planner" });
    expect(await store.getTemplate("template-1")).toMatchObject({ name: "Decision" });
    expect(await store.getIntent("compare_options")).toMatchObject({ enabled: true });
    expect(mapPersonaRow(createPersonaInsert(persona))).toMatchObject({ id: "persona-1", isDefault: true });
    expect(mapPromptTemplateRow(createPromptTemplateInsert(template))).toMatchObject({ id: "template-1" });
    expect(mapPromptVersionRow(createPromptVersionInsert("template-1", version))).toMatchObject({ id: "version-1" });
    expect(mapIntentDefinitionRow(createIntentDefinitionInsert(intent))).toMatchObject({ name: "compare_options" });
    expect(await store.deleteTemplate("template-1")).toBe(true);
    expect(await store.deletePersona("persona-1")).toBe(true);
    expect(await store.deleteIntent("compare_options")).toBe(true);
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
