import { describe, expect, it } from "vitest";

import {
  createAgentRunRecord,
  createConversationMessageRecord,
  createToolCallRecord,
} from "../src/run-history.js";

const NOW = new Date("2026-02-02T00:00:00Z");
const options = () => {
  let n = 0;
  return { now: () => NOW, idFactory: (prefix: string) => `${prefix}-${n++}` };
};

describe("createAgentRunRecord", () => {
  it("applies defaults for every optional field from minimal input", () => {
    const record = createAgentRunRecord({ input: "hi", model: "m", provider: "openai" }, options());
    expect(record).toEqual({
      completedAt: undefined,
      costUsd: "0",
      createdAt: NOW,
      error: undefined,
      id: "run-0",
      input: "hi",
      mode: "react",
      model: "m",
      output: undefined,
      provider: "openai",
      startedAt: undefined,
      status: "queued",
      tokenUsage: {},
      updatedAt: NOW, // defaults to createdAt
      userId: undefined,
    });
  });

  it("honours explicitly supplied fields over the defaults", () => {
    const record = createAgentRunRecord(
      {
        id: "r9",
        input: "x",
        model: "m",
        provider: "p",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-03T00:00:00Z"),
        costUsd: "1.5",
        mode: "plan_execute",
        status: "running",
        tokenUsage: { in: 5 },
        userId: "u1",
      },
      options(),
    );
    expect(record).toMatchObject({
      id: "r9",
      costUsd: "1.5",
      mode: "plan_execute",
      status: "running",
      tokenUsage: { in: 5 },
      userId: "u1",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-03T00:00:00Z"),
    });
  });
});

describe("createConversationMessageRecord", () => {
  it("defaults id / createdAt / metadata and passes through the rest", () => {
    expect(createConversationMessageRecord({ content: "hi", role: "user", runId: "r1" }, options())).toEqual({
      content: "hi",
      createdAt: NOW,
      id: "message-0",
      metadata: {},
      name: undefined,
      role: "user",
      runId: "r1",
      toolCallId: undefined,
    });
  });

  it("keeps explicit id / metadata / name / toolCallId", () => {
    expect(
      createConversationMessageRecord(
        { id: "m5", content: "c", role: "tool", runId: "r1", name: "search", toolCallId: "tc1", metadata: { k: 1 } },
        options(),
      ),
    ).toMatchObject({ id: "m5", name: "search", toolCallId: "tc1", metadata: { k: 1 } });
  });
});

describe("createToolCallRecord", () => {
  it("defaults arguments / createdAt / id / status and passes through the rest", () => {
    expect(createToolCallRecord({ name: "search", risk: "read", runId: "r1" }, options())).toEqual({
      arguments: {},
      completedAt: undefined,
      createdAt: NOW,
      error: undefined,
      id: "tool_call-0",
      name: "search",
      result: undefined,
      risk: "read",
      runId: "r1",
      startedAt: undefined,
      status: "queued",
    });
  });

  it("keeps explicit id / arguments / status / result and timing", () => {
    const started = new Date("2026-02-02T00:01:00Z");
    expect(
      createToolCallRecord(
        { id: "tc9", name: "write_file", risk: "write", runId: "r1", arguments: { path: "/x" }, status: "completed", result: "ok", startedAt: started },
        options(),
      ),
    ).toMatchObject({ id: "tc9", arguments: { path: "/x" }, status: "completed", result: "ok", risk: "write", startedAt: started });
  });
});
