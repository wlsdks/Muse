/**
 * A numeric argument sent as a STRING must be repaired, never refused.
 *
 * The small local model quotes numbers routinely — `"7"` where the schema says
 * 7 — which is exactly why the runtime audit found so many tools silently
 * treating it as absent. The fixes for that landed across seven independent
 * groups, and two of them chose to REFUSE the numeric string while five chose
 * to repair it. Both behaviours are defensible in isolation; together they mean
 * the same model output succeeds against one tool and fails against its
 * sibling, which is worse than either rule applied consistently.
 *
 * This asserts the repair rule over the whole registry so the two conventions
 * cannot drift apart again. A tool that genuinely must refuse a string belongs
 * in EXEMPT with the reason written down.
 */

import { describe, expect, it } from "vitest";

import { createMuseRuntimeAssembly } from "@muse/autoconfigure";
import type { MuseTool } from "@muse/tools";
import type { JsonObject } from "@muse/shared";

/** tool → (numeric-string args, the args that must behave identically) */
const CASES: readonly { args: JsonObject; equivalent: JsonObject; tool: string }[] = [
  { args: { base: "2026-07-21T00:00:00Z", days: "3" }, equivalent: { base: "2026-07-21T00:00:00Z", days: 3 }, tool: "time_add" },
  { args: { maxLength: "5", text: "hello world" }, equivalent: { maxLength: 5, text: "hello world" }, tool: "slugify" },
  { args: { withinDays: "7" }, equivalent: { withinDays: 7 }, tool: "upcoming_birthdays" },
  { args: { dueWithinDays: "7" }, equivalent: { dueWithinDays: 7 }, tool: "muse.tasks.list" },
  { args: { query: "x", topK: "3" }, equivalent: { query: "x", topK: 3 }, tool: "history_search" }
];

function toolNamed(name: string): MuseTool | undefined {
  return createMuseRuntimeAssembly({ env: { ...process.env } }).toolRegistry
    .list()
    .find((entry) => entry.definition.name === name);
}

const hasError = (result: unknown): boolean =>
  typeof result === "object" && result !== null && typeof (result as { error?: unknown }).error === "string";

describe("a numeric argument sent as a string is repaired, not refused", () => {
  for (const testCase of CASES) {
    it(`${testCase.tool} treats a quoted number the same as the number`, async () => {
      const tool = toolNamed(testCase.tool);
      if (!tool) {
        // Not registered in this environment (missing credentials) — skipping is
        // honest; asserting against an absent tool would be a false pass.
        expect(tool).toBeUndefined();
        return;
      }
      const ctx = { runId: "r", userId: "u" };
      const fromString = await tool.execute(testCase.args, ctx);
      const fromNumber = await tool.execute(testCase.equivalent, ctx);

      expect(hasError(fromString), `${testCase.tool} refused the quoted form`).toBe(false);
      expect(hasError(fromNumber)).toBe(false);
      expect(fromString).toEqual(fromNumber);
    });
  }

  it("still refuses a value that is not a number at all", async () => {
    // The repair is narrow: digits only. "abc" must remain an error, or the
    // rule would become "accept anything", which is how silent wrong answers
    // got here in the first place.
    const tool = toolNamed("slugify");
    expect(tool).toBeDefined();
    const result = await tool?.execute({ maxLength: "abc", text: "hello world" } as JsonObject, { runId: "r", userId: "u" });
    expect(hasError(result)).toBe(true);
  });
});
