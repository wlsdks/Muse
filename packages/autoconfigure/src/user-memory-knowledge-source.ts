import type { UserMemoryStore } from "@muse/memory";

import type { UserMemoryKnowledgeSource } from "./knowledge-corpus.js";

/**
 * Adapt the runtime's user-memory store into a knowledge-corpus source so
 * the facts/preferences Muse has remembered about the user (auto-extracted
 * or `remember`-ed) become answerable via `knowledge_search` (SB-1 unified
 * recall) — "what do you know about my X?". Scoped to the same userId the
 * runtime writes under, so reads hit the bucket the writes filled.
 *
 * Fail-open: an unreadable store / unknown user yields `[]` — never throws
 * into the search path.
 */
export function createUserMemoryKnowledgeSource(store: UserMemoryStore, userId: string): UserMemoryKnowledgeSource {
  return {
    facts: async () => {
      let memory;
      try {
        memory = await store.findByUserId(userId);
      } catch {
        return [];
      }
      if (!memory) {
        return [];
      }
      return [
        ...Object.entries(memory.facts).map(([key, value]) => ({ key, kind: "fact", value })),
        ...Object.entries(memory.preferences).map(([key, value]) => ({ key, kind: "preference", value }))
      ];
    }
  };
}
