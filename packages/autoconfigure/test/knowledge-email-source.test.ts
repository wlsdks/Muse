import { describe, expect, it } from "vitest";

import {
  assembleKnowledgeCorpus,
  createNotesKnowledgeSearchTool,
  type EmailMessageLike,
  type EmailMessageSource
} from "../src/knowledge-corpus.js";

const VOCAB = ["jane", "project", "deadline", "friday", "invoice", "acme"];
const embed = async (text: string): Promise<readonly number[]> => {
  const lower = text.toLowerCase();
  return VOCAB.map((term) => (lower.includes(term) ? 1 : 0));
};

function emailSource(messages: EmailMessageLike[]): EmailMessageSource {
  return { listRecent: () => messages };
}

const SAMPLE: EmailMessageLike[] = [
  { date: "2026-05-20", from: "Jane Doe <jane@acme.com>", id: "m1", snippet: "The project deadline moved to Friday — can you confirm?", subject: "Project deadline" },
  { date: "2026-05-19", from: "billing@vendor.com", id: "m2", snippet: "Your invoice for April is attached.", subject: "Invoice April" }
];

describe("assembleKnowledgeCorpus — recent email as a corpus source", () => {
  it("emits each email as an email/<id> chunk carrying from + subject + snippet", async () => {
    const corpus = await assembleKnowledgeCorpus({ emailSource: emailSource(SAMPLE) });
    const chunk = corpus.find((c) => c.source === "email/Project deadline");
    expect(chunk).toBeDefined();
    expect(chunk!.text).toContain("Jane Doe");
    expect(chunk!.text).toContain("Project deadline");
    expect(chunk!.text).toContain("moved to Friday");
  });

  it("honours maxEmails (caps how many recent messages are ingested)", async () => {
    let requested = -1;
    const source: EmailMessageSource = { listRecent: (limit) => { requested = limit; return SAMPLE.slice(0, limit); } };
    const corpus = await assembleKnowledgeCorpus({ emailSource: source, maxEmails: 1 });
    expect(requested).toBe(1);
    expect(corpus.filter((c) => c.source.startsWith("email/"))).toHaveLength(1);
  });

  it("a throwing email source degrades to no email chunks (never crashes the corpus)", async () => {
    const source: EmailMessageSource = { listRecent: () => { throw new Error("gmail 503"); } };
    const corpus = await assembleKnowledgeCorpus({ emailSource: source });
    expect(corpus.filter((c) => c.source.startsWith("email/"))).toHaveLength(0);
  });

  it("cites by a HUMAN label (subject), not the opaque message id", async () => {
    const corpus = await assembleKnowledgeCorpus({ emailSource: emailSource(SAMPLE) });
    const sources = corpus.filter((c) => c.source.startsWith("email/")).map((c) => c.source);
    expect(sources).toContain("email/Project deadline");
    expect(sources.some((s) => s.includes("m1"))).toBe(false); // the opaque id is gone
  });

  it("falls back to the sender when an email has no subject (never a bare prefix)", async () => {
    const corpus = await assembleKnowledgeCorpus({
      emailSource: emailSource([{ from: "noreply@bank.com", id: "m9", snippet: "Statement ready", subject: "" }])
    });
    const source = corpus.find((c) => c.source.startsWith("email/"))!.source;
    expect(source).toBe("email/noreply@bank.com");
  });

  it("falls back to the id when an email has neither subject nor sender (never a bare prefix)", async () => {
    const corpus = await assembleKnowledgeCorpus({
      emailSource: emailSource([{ from: "", id: "m9", snippet: "x", subject: "" }])
    });
    expect(corpus.find((c) => c.source.startsWith("email/"))!.source).toBe("email/m9");
  });
});

describe("knowledge_search spans recent email — answers + cites a message", () => {
  it("answers 'what did Jane email about the project' from the inbox and cites the subject", async () => {
    const tool = createNotesKnowledgeSearchTool({ embed, emailSource: emailSource(SAMPLE) });
    const result = String(await tool.execute({ query: "what did jane email about the project deadline?" }, { runId: "r1" }));
    expect(result).toContain("[email/Project deadline]");
    expect(result).toContain("Friday");
  });
});
