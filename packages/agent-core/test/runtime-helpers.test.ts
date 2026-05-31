import { describe, expect, it } from "vitest";

import {
  appendSystemSection,
  applyAgentSpecSystemPrompt,
  failMissingProvider,
  isModelMessage,
  isRetryableProviderError,
  latestUserPrompt,
  metadataString,
  numberMetadata,
  stringListMetadata,
  toAgentRunMode,
  toAgentSpecRunReport,
  toolCallsMetadata
} from "../src/runtime-helpers.js";
import { ModelRoutingError } from "../src/errors.js";
import type { AgentSpec, AgentSpecResolution } from "@muse/agent-specs";
import { ModelProviderError } from "@muse/model";

const sampleSpec: AgentSpec = {
  createdAt: new Date(),
  description: "sample",
  enabled: true,
  id: "spec-1",
  independentExecution: true,
  keywords: ["alpha", "beta"],
  mode: "react",
  name: "Sample",
  systemPrompt: "You are sample.",
  toolNames: ["search"],
  updatedAt: new Date()
};

describe("toAgentSpecRunReport", () => {
  it("snapshots a resolution into the public report shape", () => {
    const resolution: AgentSpecResolution = {
      confidence: 0.5,
      matchedKeywords: ["alpha"],
      spec: sampleSpec
    };
    expect(toAgentSpecRunReport(resolution)).toEqual({
      confidence: 0.5,
      matchedKeywords: ["alpha"],
      name: "Sample",
      toolNames: ["search"]
    });
  });

  it("defensively copies the keyword and toolName arrays", () => {
    const resolution: AgentSpecResolution = {
      confidence: 1,
      matchedKeywords: ["alpha", "beta"],
      spec: sampleSpec
    };
    const report = toAgentSpecRunReport(resolution);
    expect(report.matchedKeywords).not.toBe(resolution.matchedKeywords);
    expect(report.toolNames).not.toBe(sampleSpec.toolNames);
  });
});

describe("applyAgentSpecSystemPrompt", () => {
  it("returns the original messages unchanged when the spec has no systemPrompt", () => {
    const noPromptSpec = { ...sampleSpec, systemPrompt: undefined };
    const messages = [{ content: "hello", role: "user" } as const];
    const result = applyAgentSpecSystemPrompt(messages, {
      confidence: 1,
      matchedKeywords: [],
      spec: noPromptSpec
    });
    expect(result).toBe(messages);
  });

  it("prepends a synthetic system message when no system message exists", () => {
    const result = applyAgentSpecSystemPrompt(
      [{ content: "hello", role: "user" }],
      { confidence: 1, matchedKeywords: [], spec: sampleSpec }
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ content: "You are sample.", role: "system" });
  });

  it("merges the spec prompt into the existing first system message", () => {
    const result = applyAgentSpecSystemPrompt(
      [
        { content: "Be friendly.", role: "system" },
        { content: "task", role: "user" }
      ],
      { confidence: 1, matchedKeywords: [], spec: sampleSpec }
    );
    expect(result[0]).toEqual({ content: "You are sample.\n\nBe friendly.", role: "system" });
    expect(result[1]).toEqual({ content: "task", role: "user" });
  });
});

describe("metadataString", () => {
  it("returns the string value for the requested key", () => {
    expect(metadataString({ k: "v" }, "k")).toBe("v");
  });

  it("returns undefined when key is missing or value is non-string", () => {
    expect(metadataString({}, "missing")).toBeUndefined();
    expect(metadataString({ k: 42 }, "k")).toBeUndefined();
    expect(metadataString(undefined, "k")).toBeUndefined();
  });
});

describe("latestUserPrompt", () => {
  it("returns the content of the last user message", () => {
    expect(
      latestUserPrompt([
        { content: "system", role: "system" },
        { content: "old", role: "user" },
        { content: "assistant reply", role: "assistant" },
        { content: "newest", role: "user" }
      ])
    ).toBe("newest");
  });

  it("returns empty string when no user message is present", () => {
    expect(latestUserPrompt([{ content: "x", role: "system" }])).toBe("");
    expect(latestUserPrompt([])).toBe("");
  });
});

describe("appendSystemSection — injects a marked section into the system message", () => {
  const u = (content: string) => ({ content, role: "user" as const });
  const s = (content: string) => ({ content, role: "system" as const });

  it("prepends a new system message carrying the marker when none exists", () => {
    const out = appendSystemSection([u("hi")], "BODY", "pb");
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ role: "system" });
    expect(out[0]!.content).toContain("<!-- muse:pb -->");
    expect(out[0]!.content).toContain("BODY");
  });

  it("modifies ONLY the system message, leaving every other message identical", () => {
    const out = appendSystemSection([u("a"), s("SYS"), u("b")], "BODY", "pb");
    expect(out[0]!.content).toBe("a");
    expect(out[2]!.content).toBe("b");
    expect(out[1]!.content).toContain("SYS");
    expect(out[1]!.content).toContain("BODY");
  });

  it("re-applying the SAME sectionId REPLACES the prior block (no duplicate marker)", () => {
    let out = appendSystemSection([s("SYS")], "V1", "pb");
    out = appendSystemSection(out, "V2", "pb");
    const content = out[0]!.content;
    expect(content).not.toContain("V1"); // old block stripped
    expect(content).toContain("V2");
    expect(content.match(/muse:pb/gu)?.length).toBe(1); // exactly one marker
  });

  it("re-applying one section PRESERVES a different section (strips only this marker's block)", () => {
    let out = appendSystemSection([s("SYS")], "PLAYBOOK_BODY", "playbook");
    out = appendSystemSection(out, "VETO_BODY", "veto");
    out = appendSystemSection(out, "PLAYBOOK_V2", "playbook"); // re-apply playbook only
    const content = out[0]!.content;
    expect(content).toContain("VETO_BODY"); // the other section survives
    expect(content).toContain("PLAYBOOK_V2");
    expect(content).not.toContain("PLAYBOOK_BODY"); // old playbook block replaced
  });
});

describe("stringListMetadata", () => {
  it("filters non-string and blank entries", () => {
    expect(stringListMetadata(["a", "  ", "b", 42, "c", ""])).toEqual(["a", "b", "c"]);
  });

  it("returns undefined when input is not an array", () => {
    expect(stringListMetadata(undefined)).toBeUndefined();
    expect(stringListMetadata("a,b,c")).toBeUndefined();
    expect(stringListMetadata(null)).toBeUndefined();
  });
});

describe("numberMetadata", () => {
  it("accepts finite numbers and rejects everything else", () => {
    expect(numberMetadata(42)).toBe(42);
    expect(numberMetadata(0)).toBe(0);
    expect(numberMetadata(-3.14)).toBe(-3.14);
    expect(numberMetadata(Number.NaN)).toBeUndefined();
    expect(numberMetadata(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(numberMetadata("42")).toBeUndefined();
    expect(numberMetadata(undefined)).toBeUndefined();
  });
});

describe("isModelMessage", () => {
  it("accepts the four canonical roles when content is a string", () => {
    for (const role of ["system", "user", "assistant", "tool"] as const) {
      expect(isModelMessage({ content: "x", role })).toBe(true);
    }
  });

  it("rejects non-records, missing content, and unknown roles", () => {
    expect(isModelMessage(undefined)).toBe(false);
    expect(isModelMessage(null)).toBe(false);
    expect(isModelMessage("string")).toBe(false);
    expect(isModelMessage({ role: "user" })).toBe(false);
    expect(isModelMessage({ content: "x", role: "robot" })).toBe(false);
    expect(isModelMessage({ content: 42, role: "user" })).toBe(false);
  });
});

describe("toolCallsMetadata", () => {
  it("summarises tool call ids and names plus their count", () => {
    expect(
      toolCallsMetadata([
        { args: {}, id: "a", name: "alpha" },
        { args: {}, id: "b", name: "beta" }
      ])
    ).toEqual({
      toolCallCount: 2,
      toolCallIds: ["a", "b"],
      toolCallNames: ["alpha", "beta"]
    });
  });

  it("returns zero counts for an empty input", () => {
    expect(toolCallsMetadata([])).toEqual({
      toolCallCount: 0,
      toolCallIds: [],
      toolCallNames: []
    });
  });
});

describe("toAgentRunMode", () => {
  it("falls back to 'react' when no mode is supplied", () => {
    expect(toAgentRunMode(undefined)).toBe("react");
  });

  it("returns the supplied mode unchanged", () => {
    expect(toAgentRunMode("standard")).toBe("standard");
    expect(toAgentRunMode("plan_execute")).toBe("plan_execute");
  });
});

describe("failMissingProvider", () => {
  it("throws ModelRoutingError with a stable message", () => {
    expect(() => failMissingProvider()).toThrow(ModelRoutingError);
    expect(() => failMissingProvider()).toThrow(/model provider is unavailable/u);
  });
});

describe("isRetryableProviderError", () => {
  it("respects the ModelProviderError.retryable flag", () => {
    expect(isRetryableProviderError(new ModelProviderError("p", "transient", true))).toBe(true);
    expect(isRetryableProviderError(new ModelProviderError("p", "model not found", false))).toBe(false);
  });

  it("treats unknown errors as retryable so transient transport hiccups still get retries", () => {
    expect(isRetryableProviderError(new Error("connect ETIMEDOUT"))).toBe(true);
    expect(isRetryableProviderError("string error")).toBe(true);
    expect(isRetryableProviderError(undefined)).toBe(true);
  });
});
