import { type ModelProvider, type ModelRequest } from "@muse/model";
import { describe, expect, it } from "vitest";

import { createAgentRuntime, type AmbientSnapshot, type UserMemoryProvider } from "../src/index.js";

/**
 * P3 target audit (the P→P seam check): P3 has one bullet, so the
 * seam to prove is not bullet-vs-bullet but ambient-vs-the-rest —
 * does the gated ambient block actually compose with the other live
 * context transforms in a REAL runtime.run, survive a failing
 * provider without breaking the run, and stay off by default even
 * when other context is active? The two isolated P3 tests exercise
 * ambient alone; this drives the real `createAgentRuntime` pipeline.
 */
function captureProvider(sink: { request?: ModelRequest }): ModelProvider {
  return {
    id: "capture",
    async generate(request) {
      sink.request = request;
      return { id: "r", model: request.model, output: "ok" };
    },
    async listModels() {
      return [];
    },
    async *stream() {}
  };
}

const memory: UserMemoryProvider = {
  findByUserId: async () => ({
    facts: { favourite_food: "sushi" },
    preferences: {},
    userId: "u1"
  })
};

function systemText(request: ModelRequest | undefined): string {
  return (request?.messages ?? [])
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n");
}

describe("P3 audit — ambient context composes with the live pipeline, fails open, stays off by default", () => {
  it("when enabled, BOTH the ambient block and the user-memory block reach the model (no clobber)", async () => {
    const sink: { request?: ModelRequest } = {};
    const snapshot: AmbientSnapshot = { app: "Code", window: "p3-seam.ts — Muse" };
    const runtime = createAgentRuntime({
      ambientSnapshotProvider: { snapshot: () => snapshot },
      modelProvider: captureProvider(sink),
      userMemoryProvider: memory
    });

    await runtime.run({
      messages: [{ content: "what am I doing?", role: "user" }],
      metadata: { userId: "u1" },
      model: "capture/model",
      runId: "p3-seam-1"
    });

    const sys = systemText(sink.request);
    expect(sys).toContain("[Ambient Context]");
    expect(sys).toContain("window: p3-seam.ts — Muse");
    expect(sys).toContain("[User Memory]");
    expect(sys).toContain("sushi");
  });

  it("fail-open: a throwing ambient provider degrades the run (no ambient block) but never breaks it", async () => {
    const sink: { request?: ModelRequest } = {};
    const runtime = createAgentRuntime({
      ambientSnapshotProvider: {
        snapshot: () => {
          throw new Error("accessibility permission denied");
        }
      },
      modelProvider: captureProvider(sink),
      userMemoryProvider: memory
    });

    const result = await runtime.run({
      messages: [{ content: "what am I doing?", role: "user" }],
      metadata: { userId: "u1" },
      model: "capture/model",
      runId: "p3-seam-2"
    });

    expect(result.response.output).toBe("ok");
    const sys = systemText(sink.request);
    expect(sys).not.toContain("[Ambient Context]");
    expect(sys).toContain("[User Memory]");
  });

  it("off by default under composition: no ambient provider means no ambient block even with other context active", async () => {
    const sink: { request?: ModelRequest } = {};
    const runtime = createAgentRuntime({
      modelProvider: captureProvider(sink),
      userMemoryProvider: memory
    });

    await runtime.run({
      messages: [{ content: "what am I doing?", role: "user" }],
      metadata: { userId: "u1" },
      model: "capture/model",
      runId: "p3-seam-3"
    });

    const sys = systemText(sink.request);
    expect(sys).not.toContain("[Ambient Context]");
    expect(sys).toContain("[User Memory]");
  });
});
