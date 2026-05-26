import { describe, expect, it } from "vitest";

import {
  createConversationSummaryInsert,
  InMemoryConversationSummaryStore,
  mapConversationSummaryRow
} from "../src/index.js";

const baseSummary = {
  sessionId: "s-1",
  narrative: "Locked the Q3 budget",
  summarizedUpToIndex: 0
};

describe("ConversationSummary importance round-trip", () => {
  it("round-trips importance through the in-memory store", () => {
    const store = new InMemoryConversationSummaryStore();
    store.save({ ...baseSummary, importance: 8 });
    expect(store.get("s-1")?.importance).toBe(8);
    expect(store.listAll()[0]?.importance).toBe(8);
  });

  it("clamps out-of-range importance to 1..10 and truncates fractions", () => {
    const store = new InMemoryConversationSummaryStore();
    store.save({ ...baseSummary, sessionId: "hi", importance: 42 });
    store.save({ ...baseSummary, sessionId: "lo", importance: 0 });
    store.save({ ...baseSummary, sessionId: "frac", importance: 5.9 });
    expect(store.get("hi")?.importance).toBe(10);
    expect(store.get("lo")?.importance).toBe(1);
    expect(store.get("frac")?.importance).toBe(5);
  });

  it("leaves importance undefined when unset or non-finite (legacy summary)", () => {
    const store = new InMemoryConversationSummaryStore();
    store.save(baseSummary);
    store.save({ ...baseSummary, sessionId: "nan", importance: Number.NaN });
    expect(store.get("s-1")?.importance).toBeUndefined();
    expect(store.get("nan")?.importance).toBeUndefined();
  });

  it("maps importance to a Kysely insert column and back from a row", () => {
    const insert = createConversationSummaryInsert(
      { ...baseSummary, importance: 7 },
      { now: () => new Date("2026-05-27T00:00:00.000Z") }
    );
    expect(insert.importance).toBe(7);

    const fromRow = mapConversationSummaryRow({
      session_id: "s-1",
      narrative: "Locked the Q3 budget",
      facts_json: [],
      summarized_up_to: 0,
      created_at: new Date("2026-05-27T00:00:00.000Z"),
      updated_at: new Date("2026-05-27T00:00:00.000Z"),
      user_id: null,
      importance: 7
    });
    expect(fromRow.importance).toBe(7);

    const legacyRow = mapConversationSummaryRow({
      session_id: "s-2",
      narrative: "Older session",
      facts_json: [],
      summarized_up_to: 0,
      created_at: new Date("2026-05-27T00:00:00.000Z"),
      updated_at: new Date("2026-05-27T00:00:00.000Z"),
      user_id: null,
      importance: null
    });
    expect(legacyRow.importance).toBeUndefined();
  });
});
