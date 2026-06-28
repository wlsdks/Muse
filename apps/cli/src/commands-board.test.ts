import type { AgentTask } from "@muse/multi-agent";
import { describe, expect, it } from "vitest";

import { formatBoard, taskNeedsReview } from "./commands-board.js";

const t = (over: Partial<AgentTask> & { id: string; title: string }): AgentTask => ({
  createdAt: "t0", dependsOn: [], runs: [], status: "todo", updatedAt: "t0", ...over
});

describe("muse board — pure surface helpers (S4)", () => {
  describe("taskNeedsReview — outbound work is draft-first (never auto-run)", () => {
    it.each(["send an email to mina", "reply to the thread", "post the update", "DM the team", "book the table", "submit the form"])(
      "outbound title needs review: %s", (title) => expect(taskNeedsReview(title)).toBe(true)
    );
    it.each(["research the topic", "summarize my notes", "draft a plan", "compute the totals"])(
      "non-outbound title runs directly: %s", (title) => expect(taskNeedsReview(title)).toBe(false)
    );
  });

  describe("formatBoard", () => {
    it("empty board prompts the user to add work", () => {
      expect(formatBoard([])).toContain("muse board add");
    });
    it("groups tasks by column and shows dependencies + block reasons", () => {
      const out = formatBoard([
        t({ id: "aaaaaaaa1", title: "first" }),
        t({ dependsOn: ["aaaaaaaa1"], id: "bbbbbbbb2", status: "blocked", blockedReason: "rate limit", title: "second" }),
        t({ id: "cccccccc3", status: "review", title: "send email" })
      ]);
      expect(out).toContain("TODO (1)");
      expect(out).toContain("BLOCKED (1)");
      expect(out).toContain("REVIEW (1)");
      expect(out).toContain("⟵ aaaaaaaa1"); // dependency shown
      expect(out).toContain("rate limit");  // block reason shown
    });
  });
});
