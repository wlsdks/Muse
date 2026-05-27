import type { UserMemory, UserMemoryStore } from "@muse/memory";
import { describe, expect, it } from "vitest";

import { createUserMemoryKnowledgeSource } from "../src/user-memory-knowledge-source.js";

const memory = (userId: string, facts: Record<string, string>, preferences: Record<string, string>): UserMemory => ({
  facts,
  preferences,
  recentTopics: [],
  updatedAt: new Date("2026-05-22T00:00:00Z"),
  userId
});

// The adapter only reads findByUserId; a minimal fake store exercises the
// real mapping/scoping/fail-open contract without a DB or file.
const storeReturning = (fn: (userId: string) => Promise<UserMemory | undefined>): UserMemoryStore =>
  ({ findByUserId: fn } as unknown as UserMemoryStore);

describe("createUserMemoryKnowledgeSource — remembered facts as a recall source", () => {
  it("flattens the user's facts + preferences with kind labels", async () => {
    const store = storeReturning(async (userId) =>
      userId === "alice" ? memory("alice", { blood_type: "O-negative" }, { tone: "concise" }) : undefined
    );
    const facts = await createUserMemoryKnowledgeSource(store, "alice").facts();
    expect(facts).toEqual([
      { key: "blood_type", kind: "fact", value: "O-negative" },
      { key: "tone", kind: "preference", value: "concise" }
    ]);
  });

  it("returns [] for a user with no stored memory (correct, not crash)", async () => {
    const store = storeReturning(async () => undefined);
    expect(await createUserMemoryKnowledgeSource(store, "nobody").facts()).toEqual([]);
  });

  it("is fail-open: a throwing store yields [] (never breaks recall)", async () => {
    const store = storeReturning(async () => { throw new Error("memory store unreadable"); });
    expect(await createUserMemoryKnowledgeSource(store, "alice").facts()).toEqual([]);
  });
});
