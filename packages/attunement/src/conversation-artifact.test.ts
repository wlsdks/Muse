import { describe, expect, it } from "vitest";

import {
  createConversationArtifactValidator,
  createConversationExactArtifactResolver,
  type ConversationSourceRecord
} from "./index.js";

const CONVERSATION: ConversationSourceRecord = {
  createdAt: "2026-07-22T01:00:00.000Z",
  id: "conv_0a1b2c3d",
  origin: "cli",
  title: "Exact planning conversation",
  turns: [
    { at: "2026-07-22T01:00:00.000Z", content: "Earlier", role: "user" },
    { at: "2026-07-22T01:01:00.000Z", content: "Private assistant detail", role: "assistant" },
    { at: "2026-07-22T01:02:00.000Z", content: "  Latest\u001b[31m owner\n prompt  ", role: "user" }
  ],
  updatedAt: "2026-07-22T01:02:00.000Z"
};

const LINK = {
  artifactId: CONVERSATION.id,
  artifactType: "conversation" as const,
  linkedAt: "2026-07-22T01:05:00.000Z",
  linkedBy: "user" as const,
  providerId: "local",
  role: "context" as const,
  threadId: "thread_work"
};

describe("exact conversation artifact adapter", () => {
  it("validates a canonical owner-authored cli/web conversation by exact id", async () => {
    const validate = createConversationArtifactValidator({
      readExactConversation: async (id) => id === CONVERSATION.id ? CONVERSATION : undefined
    });
    await expect(validate({ artifactId: CONVERSATION.id, artifactType: "conversation", providerId: "local" }))
      .resolves.toEqual({ artifactId: CONVERSATION.id, artifactType: "conversation", providerId: "local" });
  });

  it("rejects prefixes, surrounding whitespace, messaging origins, and conversations without owner prompts", async () => {
    const candidates: readonly [string, ConversationSourceRecord][] = [
      ["conv_0a1b2c3", CONVERSATION],
      [`${CONVERSATION.id}\n`, CONVERSATION],
      [CONVERSATION.id, { ...CONVERSATION, origin: "telegram" }],
      [CONVERSATION.id, { ...CONVERSATION, turns: [{ content: "answer", role: "assistant" }] }]
    ];
    for (const [artifactId, record] of candidates) {
      const validate = createConversationArtifactValidator({ readExactConversation: async () => record });
      await expect(validate({ artifactId, artifactType: "conversation", providerId: "local" })).rejects.toThrow();
    }
  });

  it("projects only bounded display fields and the latest normalized owner prompt", async () => {
    const resolve = createConversationExactArtifactResolver({ readExactConversation: async () => CONVERSATION });
    await expect(resolve(LINK)).resolves.toEqual({
      artifactId: CONVERSATION.id,
      artifactType: "conversation",
      conversationLastOwnerPrompt: "Latest[31m owner prompt",
      conversationOrigin: "cli",
      conversationUpdatedAt: "2026-07-22T01:02:00.000Z",
      providerId: "local",
      role: "context",
      title: "Exact planning conversation"
    });
  });

  it("never resolves a conversation as a next-step", async () => {
    const resolve = createConversationExactArtifactResolver({ readExactConversation: async () => CONVERSATION });
    await expect(resolve({ ...LINK, role: "next-step" })).resolves.toBeUndefined();
  });

  it("returns unavailable when the exact source was removed", async () => {
    const resolve = createConversationExactArtifactResolver({ readExactConversation: async () => undefined });
    await expect(resolve(LINK)).resolves.toBeUndefined();
  });
});
