import type { SpanHandle } from "@muse/observability";
import { describe, expect, it } from "vitest";

import { projectTelemetryMetadata, recordPromptBudgetSpanAttributes } from "../src/runtime-helpers.js";

describe("projectTelemetryMetadata", () => {
  it("returns empty flags and counters for undefined metadata", () => {
    expect(projectTelemetryMetadata(undefined)).toEqual({ flags: {}, counters: {} });
  });

  it("keeps recognised boolean flags including explicit false", () => {
    expect(projectTelemetryMetadata({ activeContextApplied: true, episodicRecallFailed: false })).toEqual({
      flags: { activeContextApplied: true, episodicRecallFailed: false },
      counters: {},
    });
  });

  it("keeps recognised finite-number counters including zero and floats", () => {
    expect(projectTelemetryMetadata({ inboxContextMessageCount: 0, episodicRecallMatchCount: 2.5 })).toEqual({
      flags: {},
      counters: { inboxContextMessageCount: 0, episodicRecallMatchCount: 2.5 },
    });
  });

  it("ignores wrong-typed values, non-finite counters, and unknown keys", () => {
    expect(
      projectTelemetryMetadata({
        activeContextApplied: "yes", // wrong type for a flag
        inboxContextMessageCount: Number.NaN, // non-finite counter
        attachmentContextCount: "3", // wrong type for a counter
        unknownFlag: true, // not in the allow-list
        unknownCounter: 5, // not in the allow-list
      }),
    ).toEqual({ flags: {}, counters: {} });
  });
});

describe("recordPromptBudgetSpanAttributes", () => {
  const spyingSpan = () => {
    const calls: Array<[string, string | number | boolean]> = [];
    const span: SpanHandle = { setAttribute: (key, value) => calls.push([key, value]) };
    return { span, calls };
  };

  it("records nothing when attributes are undefined", () => {
    const { span, calls } = spyingSpan();
    recordPromptBudgetSpanAttributes(span, undefined);
    expect(calls).toEqual([]);
  });

  it("records every finite attribute and skips non-finite ones", () => {
    const { span, calls } = spyingSpan();
    recordPromptBudgetSpanAttributes(span, {
      promptTokens: 1200,
      ratio: 0.75,
      overflow: Number.NaN,
      unbounded: Number.POSITIVE_INFINITY,
    });
    expect(calls).toEqual([
      ["promptTokens", 1200],
      ["ratio", 0.75],
    ]);
  });

  it("records nothing for an empty attribute map", () => {
    const { span, calls } = spyingSpan();
    recordPromptBudgetSpanAttributes(span, {});
    expect(calls).toEqual([]);
  });
});
