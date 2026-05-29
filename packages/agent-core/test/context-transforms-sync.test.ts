import type { PromptLayer, PromptLayerContext, PromptLayerRegistry } from "@muse/prompts";
import { describe, expect, it } from "vitest";

import { applyActiveContext, applyPromptLayers } from "../src/context-transforms.js";
import type { ActiveContextSnapshot } from "../src/active-context.js";
import type { AgentRunContext } from "../src/types.js";

const context = (messages: AgentRunContext["input"]["messages"] = [], metadata: Record<string, unknown> = {}): AgentRunContext => ({
  runId: "run-1",
  startedAt: new Date("2026-01-01T09:00:00Z"),
  input: { model: "test-model", messages, metadata },
});

const baseSnapshot: ActiveContextSnapshot = {
  nowIso: "2026-01-01T09:00:00Z",
  weekday: "Thursday",
  timezone: "UTC",
  localHour: 9,
};

describe("applyActiveContext", () => {
  it("returns the input unchanged when there is no snapshot", () => {
    const ctx = context([{ role: "user", content: "hi" }]);
    expect(applyActiveContext(ctx, undefined)).toBe(ctx.input);
  });

  it("prepends an [Active Context] system section and flags it applied", () => {
    const result = applyActiveContext(context([{ role: "user", content: "hi" }]), baseSnapshot);
    expect(result.messages[0]).toMatchObject({ role: "system" });
    expect(result.messages[0]!.content).toContain("<!-- muse:active-context -->");
    expect(result.messages[0]!.content).toContain("[Active Context]");
    expect(result.metadata).toMatchObject({ activeContextApplied: true });
  });

  it("records the working-hours flag only when the snapshot carries it", () => {
    const withFlag = applyActiveContext(context(), { ...baseSnapshot, workingHours: { start: 9, end: 17 }, isWorkingHours: true });
    expect(withFlag.metadata).toMatchObject({ activeContextInWorkingHours: true });
    const without = applyActiveContext(context(), baseSnapshot);
    expect(without.metadata).not.toHaveProperty("activeContextInWorkingHours");
  });

  it("merges into an existing system message instead of adding a second one", () => {
    const result = applyActiveContext(context([{ role: "system", content: "BASE PROMPT" }, { role: "user", content: "hi" }]), baseSnapshot);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]!.content).toContain("BASE PROMPT");
    expect(result.messages[0]!.content).toContain("<!-- muse:active-context -->");
  });
});

describe("applyPromptLayers", () => {
  const registryReturning = (layers: readonly PromptLayer[], capture?: (c: PromptLayerContext) => void): PromptLayerRegistry => ({
    resolve: (resolveContext) => {
      capture?.(resolveContext);
      return layers;
    },
  });

  it("returns the context unchanged when no registry is configured", () => {
    const ctx = context();
    expect(applyPromptLayers(ctx, "openai", "gpt", undefined)).toBe(ctx);
  });

  it("returns the context unchanged when the registry resolves no layers", () => {
    const ctx = context([{ role: "user", content: "hi" }]);
    expect(applyPromptLayers(ctx, "openai", "gpt", registryReturning([]))).toBe(ctx);
  });

  it("passes the provider/model/persona/template selectors to the registry", () => {
    let seen: PromptLayerContext | undefined;
    applyPromptLayers(
      context([{ role: "user", content: "hi" }], { personaId: "P", promptTemplateId: "T" }),
      "openai",
      "gpt-4",
      registryReturning([{ id: "L1", content: "Rule", section: "stable" }], (c) => (seen = c)),
    );
    expect(seen).toEqual({ model: "gpt-4", personaId: "P", promptTemplateId: "T", providerId: "openai" });
  });

  it("appends a prompt-layers system section and records the applied layer ids", () => {
    const result = applyPromptLayers(
      context([{ role: "user", content: "hi" }]),
      "openai",
      "gpt-4",
      registryReturning([
        { id: "L1", content: "Rule one", section: "stable" },
        { id: "L2", content: "Rule two", section: "dynamic" },
      ]),
    );
    expect(result.input.messages[0]).toMatchObject({ role: "system" });
    expect(result.input.messages[0]!.content).toContain("<!-- muse:prompt-layers -->");
    expect(result.input.metadata?.promptLayerIds).toEqual(["L1", "L2"]);
  });
});
