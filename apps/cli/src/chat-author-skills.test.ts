import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ModelProvider } from "@muse/model";
import { describe, expect, it } from "vitest";

import { authorSkillsFromSession } from "./chat-author-skills.js";

const stub = (output: string): ModelProvider => ({
  id: "stub",
  async generate() {
    return { id: "r", model: "m", output };
  },
  async listModels() {
    return [];
  },
  async *stream() {}
});

const draftOutput =
  "name: export-then-attach\ndescription: Use when sending a document; convert to PDF before attaching.\nbody:\n1. Convert to PDF.\n2. Attach the PDF.";

const boundaries = [{ tsIso: "2026-05-29T00:00:00.000Z", userId: "stark" }];

const correctedSession = [
  { content: "send the report to my manager", role: "user" as const },
  { content: "I attached the .docx.", role: "assistant" as const },
  { content: "no, that's wrong — always convert to PDF first then attach", role: "user" as const }
];

describe("authorSkillsFromSession", () => {
  it("authors a skill from a procedural correction", async () => {
    const dir = mkdtempSync(join(tmpdir(), "muse-auth-cli-"));
    const res = await authorSkillsFromSession({
      model: "m",
      modelProvider: stub(draftOutput),
      authoredDir: dir,
      readBoundaries: async () => boundaries,
      readLines: async () => correctedSession
    });
    expect(res.status).toBe("authored");
    if (res.status === "authored") {
      expect(res.skills[0]).toContain("export-then-attach");
    }
  });

  it("skips when there is no correction", async () => {
    const dir = mkdtempSync(join(tmpdir(), "muse-auth-cli-"));
    const res = await authorSkillsFromSession({
      model: "m",
      modelProvider: stub(draftOutput),
      authoredDir: dir,
      readBoundaries: async () => boundaries,
      readLines: async () => [
        { content: "send the report", role: "user" },
        { content: "done", role: "assistant" },
        { content: "thanks!", role: "user" }
      ]
    });
    expect(res.status).toBe("skipped");
  });

  it("skips (fail-soft) when history read throws", async () => {
    const dir = mkdtempSync(join(tmpdir(), "muse-auth-cli-"));
    const res = await authorSkillsFromSession({
      model: "m",
      modelProvider: stub(draftOutput),
      authoredDir: dir,
      readBoundaries: async () => boundaries,
      readLines: async () => {
        throw new Error("disk gone");
      }
    });
    expect(res.status).toBe("skipped");
  });
});
