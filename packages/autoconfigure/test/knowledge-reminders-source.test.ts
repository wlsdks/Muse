import { describe, expect, it } from "vitest";

import {
  assembleKnowledgeCorpus,
  createNotesKnowledgeSearchTool,
  type ReminderLike,
  type RemindersSource
} from "../src/knowledge-corpus.js";

const VOCAB = ["dentist", "passport", "renew", "friday", "milk"];
const embed = async (text: string): Promise<readonly number[]> => {
  const lower = text.toLowerCase();
  return VOCAB.map((term) => (lower.includes(term) ? 1 : 0));
};

function remindersSource(reminders: ReminderLike[]): RemindersSource {
  return { list: () => reminders };
}

const SAMPLE: ReminderLike[] = [
  { dueAt: "2026-05-29", id: "r1", text: "Renew passport before the trip" },
  { id: "r2", text: "Call the dentist" }
];

describe("assembleKnowledgeCorpus — pending reminders as a corpus source", () => {
  it("emits each reminder as a reminder/<text> chunk carrying its text + dueAt", async () => {
    const corpus = await assembleKnowledgeCorpus({ remindersSource: remindersSource(SAMPLE) });
    const passport = corpus.find((c) => c.source.startsWith("reminder/") && c.text.includes("passport"));
    expect(passport).toBeDefined();
    expect(passport!.source).toContain("reminder/Renew passport");
    expect(passport!.text).toContain("due 2026-05-29");
    expect(corpus.some((c) => c.source.startsWith("reminder/") && c.text.includes("dentist"))).toBe(true);
  });

  it("a throwing reminders source degrades to no reminder chunks (never crashes the corpus)", async () => {
    const source: RemindersSource = { list: () => { throw new Error("reminders unreadable"); } };
    const corpus = await assembleKnowledgeCorpus({ remindersSource: source });
    expect(corpus.filter((c) => c.source.startsWith("reminder/"))).toHaveLength(0);
  });
});

describe("knowledge_search spans pending reminders — answers + cites a reminder", () => {
  it("answers 'anything about the dentist?' from the reminder and cites it", async () => {
    const tool = createNotesKnowledgeSearchTool({ embed, remindersSource: remindersSource(SAMPLE) });
    const result = String(await tool.execute({ query: "anything about the dentist?" }, { runId: "r1" }));
    expect(result).toContain("[reminder/Call the dentist]");
  });
});
