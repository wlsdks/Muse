/**
 * Gap #5 regression test — after `userId` started flowing into
 * `ConversationSummary.save`, a summary written during compaction
 * is now visible to `StoreBackedEpisodicRecallProvider` for the
 * same user on the very next request (no waiting for a brand-new
 * session). Verifies cross-user isolation at the same time.
 */

import { describe, expect, it } from "vitest";

import { COMPACTION_SUMMARY_PREFIX, InMemoryConversationSummaryStore } from "@muse/memory";

import { persistConversationSummaryFromRequest } from "../src/context-transforms.js";
import { StoreBackedEpisodicRecallProvider } from "../src/episodic-recall.js";

describe("same-session episodic recall (Gap #5)", () => {
  it("persists the summary with userId so listAll picks it up for the same user", async () => {
    const store = new InMemoryConversationSummaryStore();
    const context = {
      input: {
        messages: [],
        metadata: { sessionId: "session-x", userId: "stark" },
        model: "diagnostic/smoke"
      },
      runId: "run-1",
      startedAt: new Date()
    };
    const request = {
      messages: [
        {
          content: `${COMPACTION_SUMMARY_PREFIX}: 3 messages compacted]\nRecent topic: Kysely DB build decision`,
          role: "system" as const
        }
      ]
    };

    await persistConversationSummaryFromRequest(context, request, 12, store);

    const stark = store.listAll({ userId: "stark" });
    expect(stark).toHaveLength(1);
    expect(stark[0]?.userId).toBe("stark");
    expect(stark[0]?.sessionId).toBe("session-x");

    // Cross-user isolation: another user's listAll sees nothing.
    expect(store.listAll({ userId: "someone-else" })).toHaveLength(0);

    // And the recall provider now surfaces it for the same user.
    const provider = new StoreBackedEpisodicRecallProvider({ minScore: 0.05, store });
    const snapshot = await provider.resolve("Kysely DB build decision recap", "stark");
    expect(snapshot?.matches[0]?.sessionId).toBe("session-x");
  });
});
