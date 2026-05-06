import type { JsonObject } from "@muse/shared";
import { evaluateInputGuardRules, type GuardRuleStore } from "./guard-rule-store.js";
import { findInjectionPatterns } from "./injection-patterns.js";
import { maskPii } from "./pii-patterns.js";
import { detectTopicDrift, type TopicDriftTopic } from "./topic-drift.js";

export interface InputGuardSimulationOptions {
  readonly allowedOffTopicKeywords?: readonly string[];
  readonly allowedTopics?: readonly TopicDriftTopic[];
  readonly input: string;
  readonly minTopicScore?: number;
  readonly ruleStore?: Pick<GuardRuleStore, "listInputRules">;
}

export interface InputGuardStageSimulation {
  readonly action: "allow" | "block";
  readonly category: string | null;
  readonly durationMs: number;
  readonly order: number;
  readonly passed: boolean;
  readonly reason: string | null;
  readonly ruleId?: string;
  readonly stage: string;
}

export interface InputGuardSimulationResult {
  readonly blockingStage: string | null;
  readonly finalAction: "allow" | "block";
  readonly passed: boolean;
  readonly stageResults: readonly InputGuardStageSimulation[];
  readonly totalDurationMs: number;
}

export async function simulateInputGuardPipeline(options: InputGuardSimulationOptions): Promise<InputGuardSimulationResult> {
  const input = options.input;
  const stages: InputGuardStageSimulation[] = [];

  stages.push(measureStage("InputValidation", 0, () => {
    const passed = input.trim().length > 0;
    return {
      category: passed ? null : "empty_input",
      passed,
      reason: passed ? null : "Input must not be blank"
    };
  }));

  if (stages.at(-1)?.passed !== false) {
    stages.push(measureStage("InjectionDetection", 1, () => {
      const findings = findInjectionPatterns(input);
      const passed = findings.length === 0;
      return {
        category: passed ? null : "prompt_injection",
        passed,
        reason: passed ? null : `Input guard detected injection patterns: ${findings.map((finding) => finding.name).join(", ")}`
      };
    }));
  }

  if (stages.at(-1)?.passed !== false) {
    stages.push(measureStage("InputCredentialMasking", 2, () => {
      const result = maskPii(input);
      const passed = result.findings.length === 0;
      return {
        category: passed ? null : "pii",
        passed,
        reason: passed ? null : `Input guard detected private identifiers: ${result.findings.map((finding) => finding.name).join(", ")}`
      };
    }));
  }

  if (stages.at(-1)?.passed !== false && (options.allowedTopics?.length ?? 0) > 0) {
    stages.push(measureStage("TopicDrift", 3, () => {
      const decision = detectTopicDrift(input, {
        allowedOffTopicKeywords: options.allowedOffTopicKeywords,
        allowedTopics: options.allowedTopics ?? [],
        minScore: options.minTopicScore
      });
      return {
        category: decision.allowed ? null : "topic_drift",
        passed: decision.allowed,
        reason: decision.allowed ? null : decision.reason
      };
    }));
  }

  if (stages.at(-1)?.passed !== false && options.ruleStore) {
    const start = performanceNow();
    const decision = await evaluateInputGuardRules(options.ruleStore, input);
    stages.push({
      action: decision.allowed ? "allow" : "block",
      category: decision.allowed ? null : "dynamic_rule",
      durationMs: elapsedMs(start),
      order: 4,
      passed: decision.allowed,
      reason: decision.allowed ? null : decision.reason,
      ruleId: decision.ruleId,
      stage: "DynamicInputRules"
    });
  }

  const blocking = stages.find((stage) => !stage.passed);

  return {
    blockingStage: blocking?.stage ?? null,
    finalAction: blocking ? "block" : "allow",
    passed: !blocking,
    stageResults: stages,
    totalDurationMs: stages.reduce((sum, stage) => sum + stage.durationMs, 0)
  };
}

function measureStage(
  stage: string,
  order: number,
  evaluate: () => { readonly category: string | null; readonly passed: boolean; readonly reason: string | null }
): InputGuardStageSimulation {
  const start = performanceNow();
  const result = evaluate();

  return {
    action: result.passed ? "allow" : "block",
    category: result.category,
    durationMs: elapsedMs(start),
    order,
    passed: result.passed,
    reason: result.reason,
    stage
  };
}

export function inputGuardSimulationToJson(result: InputGuardSimulationResult): JsonObject {
  return {
    blockingStage: result.blockingStage,
    finalAction: result.finalAction,
    passed: result.passed,
    stageResults: result.stageResults.map((stage) => ({
      action: stage.action,
      category: stage.category,
      durationMs: stage.durationMs,
      order: stage.order,
      passed: stage.passed,
      reason: stage.reason,
      ruleId: stage.ruleId ?? null,
      stage: stage.stage
    })),
    totalDurationMs: result.totalDurationMs
  };
}

function performanceNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function elapsedMs(start: number): number {
  return Math.max(0, Math.round((performanceNow() - start) * 1000) / 1000);
}
