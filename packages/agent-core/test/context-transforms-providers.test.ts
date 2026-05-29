import type { ExemplarRetriever } from "@muse/prompts";
import { describe, expect, it } from "vitest";

import type { ActiveContextProvider, ActiveContextSnapshot } from "../src/active-context.js";
import {
  applyEpisodicRecall,
  applyInboxContext,
  applyPromptExemplars,
  resolveActiveContextSnapshot,
} from "../src/context-transforms.js";
import type { EpisodicRecallProvider, EpisodicRecallSnapshot } from "../src/episodic-recall.js";
import type { InboxContextProvider, InboxSnapshot } from "../src/inbox-context.js";
import type { AgentRunContext } from "../src/types.js";

const context = (metadata: Record<string, unknown> = { userId: "u1" }, messages = [{ role: "user" as const, content: "q" }]): AgentRunContext => ({
  runId: "run-1",
  startedAt: new Date("2026-01-01T09:00:00Z"),
  input: { model: "m", messages, metadata },
});
const throwing = () => {
  throw new Error("provider down");
};

describe("resolveActiveContextSnapshot", () => {
  const snapshot: ActiveContextSnapshot = { nowIso: "2026-01-01T09:00:00Z", weekday: "Thursday", timezone: "UTC", localHour: 9 };

  it("returns undefined when no provider is configured", async () => {
    expect(await resolveActiveContextSnapshot(context(), undefined)).toBeUndefined();
  });

  it("returns the resolved snapshot", async () => {
    const provider: ActiveContextProvider = { resolve: async () => snapshot };
    expect(await resolveActiveContextSnapshot(context(), provider)).toEqual(snapshot);
  });

  it("normalises a null resolution to undefined and fails open on a throw", async () => {
    expect(await resolveActiveContextSnapshot(context(), { resolve: async () => null })).toBeUndefined();
    expect(await resolveActiveContextSnapshot(context(), { resolve: throwing } as ActiveContextProvider)).toBeUndefined();
  });
});

describe("applyInboxContext", () => {
  const snapshot: InboxSnapshot = {
    messages: [{ providerId: "slack", source: "C1", sender: "bob", receivedAtIso: "2026-01-01T08:00:00Z", text: "hi there" }],
  };

  it("returns the input untouched when no provider is configured", async () => {
    const ctx = context();
    expect(await applyInboxContext(ctx, undefined)).toBe(ctx.input);
  });

  it("injects a [Recent Messages] section and records the applied flag + count", async () => {
    const result = await applyInboxContext(context(), { resolve: async () => snapshot });
    expect(result.messages[0]).toMatchObject({ role: "system" });
    expect(result.messages[0]!.content).toContain("Recent Messages");
    expect(result.metadata).toMatchObject({ inboxContextApplied: true, inboxContextMessageCount: 1 });
  });

  it("leaves the input unchanged when the snapshot has no messages", async () => {
    expect((await applyInboxContext(context(), { resolve: async () => ({ messages: [] }) })).messages).toHaveLength(1);
  });

  it("fails open and flags the failure when the provider throws", async () => {
    const result = await applyInboxContext(context(), { resolve: throwing } as InboxContextProvider);
    expect(result.metadata).toMatchObject({ inboxContextFailed: true });
    expect(result.messages).toHaveLength(1);
  });
});

describe("applyEpisodicRecall", () => {
  const snapshot: EpisodicRecallSnapshot = {
    matches: [{ sessionId: "s1", narrative: "prior session fact", createdAtIso: "2025-12-01T00:00:00Z", similarity: 0.9 }],
  };

  it("returns the input untouched with no provider", async () => {
    const ctx = context();
    expect(await applyEpisodicRecall(ctx, undefined)).toBe(ctx.input);
  });

  it("skips (without calling the provider) when the latest user prompt is empty", async () => {
    const ctx = context({ userId: "u1" }, []);
    const provider: EpisodicRecallProvider = { resolve: throwing };
    expect(await applyEpisodicRecall(ctx, provider)).toBe(ctx.input);
  });

  it("injects an [Episodic Memory] section and records the applied flag + match count", async () => {
    const result = await applyEpisodicRecall(context(), { resolve: async () => snapshot });
    expect(result.messages[0]).toMatchObject({ role: "system" });
    expect(result.metadata).toMatchObject({ episodicRecallApplied: true, episodicRecallMatchCount: 1 });
  });

  it("leaves the input unchanged when there are no matches", async () => {
    expect((await applyEpisodicRecall(context(), { resolve: async () => ({ matches: [] }) })).messages).toHaveLength(1);
  });

  it("fails open and flags the failure when the provider throws", async () => {
    const result = await applyEpisodicRecall(context(), { resolve: throwing } as EpisodicRecallProvider);
    expect(result.metadata).toMatchObject({ episodicRecallFailed: true });
  });
});

describe("applyPromptExemplars", () => {
  it("returns the context untouched with no retriever or an empty user prompt", async () => {
    const ctx = context();
    expect(await applyPromptExemplars(ctx, undefined, 3)).toBe(ctx);
    const blank = context({ userId: "u1" }, []);
    expect(await applyPromptExemplars(blank, { retrieveTopK: throwing } as ExemplarRetriever, 3)).toBe(blank);
  });

  it("appends a prompt-exemplars section and flags it applied", async () => {
    const result = await applyPromptExemplars(context(), { retrieveTopK: async () => "Q: example\nA: answer" }, 3);
    expect(result.input.messages[0]).toMatchObject({ role: "system" });
    expect(result.input.metadata).toMatchObject({ promptExemplarApplied: true });
  });

  it("leaves the context unchanged when the retriever returns an empty string", async () => {
    const result = await applyPromptExemplars(context(), { retrieveTopK: async () => "" }, 3);
    expect(result.input.messages).toHaveLength(1);
  });

  it("fails open and flags retrieval failure when the retriever throws", async () => {
    const result = await applyPromptExemplars(context(), { retrieveTopK: throwing } as ExemplarRetriever, 3);
    expect(result.input.metadata).toMatchObject({ promptExemplarRetrievalFailed: true });
  });
});
