import { describe, expect, it } from "vitest";

import {
  assembleKnowledgeCorpus,
  createNotesKnowledgeSearchTool,
  type ObjectiveLike,
  type ObjectivesSource
} from "../src/knowledge-corpus.js";

const VOCAB = ["q3", "memo", "signoff", "build", "green"];
const embed = async (text: string): Promise<readonly number[]> => {
  const lower = text.toLowerCase();
  return VOCAB.map((term) => (lower.includes(term) ? 1 : 0));
};

function objectivesSource(objectives: ObjectiveLike[]): ObjectivesSource {
  return { list: () => objectives };
}

const SAMPLE: ObjectiveLike[] = [
  { id: "obj_a", spec: "Ship the Q3 memo once we have signoff" },
  { id: "obj_b", spec: "Watch the build until it is green" }
];

describe("assembleKnowledgeCorpus — standing objectives as a corpus source", () => {
  it("emits each objective as an objective/<spec> chunk", async () => {
    const corpus = await assembleKnowledgeCorpus({ objectivesSource: objectivesSource(SAMPLE) });
    const memo = corpus.find((c) => c.source.startsWith("objective/") && c.text.includes("Q3 memo"));
    expect(memo).toBeDefined();
    expect(memo!.source).toContain("objective/Ship the Q3 memo once we have signoff");
    expect(corpus.some((c) => c.source.startsWith("objective/") && c.text.includes("build until it is green"))).toBe(true);
  });

  it("skips a blank spec and degrades to no objective chunks on a throwing source", async () => {
    const blank = await assembleKnowledgeCorpus({ objectivesSource: objectivesSource([{ id: "x", spec: "   " }]) });
    expect(blank.filter((c) => c.source.startsWith("objective/"))).toHaveLength(0);
    const throwing: ObjectivesSource = { list: () => { throw new Error("objectives unreadable"); } };
    const corpus = await assembleKnowledgeCorpus({ objectivesSource: throwing });
    expect(corpus.filter((c) => c.source.startsWith("objective/"))).toHaveLength(0);
  });
});

describe("knowledge_search spans standing objectives — answers + cites an objective", () => {
  it("answers 'what am I working toward on the Q3 memo?' from the objective and cites it", async () => {
    const tool = createNotesKnowledgeSearchTool({ embed, objectivesSource: objectivesSource(SAMPLE) });
    const result = String(await tool.execute({ query: "what am I working toward on the Q3 memo signoff?" }, { runId: "r1" }));
    expect(result).toContain("[objective/Ship the Q3 memo once we have signoff]");
  });
});
