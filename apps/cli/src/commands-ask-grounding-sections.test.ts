import { describe, expect, it } from "vitest";

import { groundingSectionLines } from "./commands-ask.js";

describe("groundingSectionLines — omit empty grounding sections from the prompt", () => {
  it("includes a present section (header, body, footer, blank) and omits an absent one", () => {
    const out = groundingSectionLines([
      { header: "=== TASKS ===", body: "pay rent", footer: "=== END TASKS ===", present: true },
      { header: "=== REMINDERS ===", body: "(no pending reminders)", footer: "=== END REMINDERS ===", present: false }
    ]);
    expect(out).toEqual(["=== TASKS ===", "pay rent", "=== END TASKS ===", ""]);
    expect(out.join("\n")).not.toContain("REMINDERS"); // the empty section is gone entirely
  });

  it("returns [] when every section is empty (nothing but notes will remain in the prompt)", () => {
    expect(groundingSectionLines([
      { header: "=== A ===", body: "(none)", footer: "=== END A ===", present: false },
      { header: "=== B ===", body: "(none)", footer: "=== END B ===", present: false }
    ])).toEqual([]);
  });

  it("preserves order across multiple present sections", () => {
    const out = groundingSectionLines([
      { header: "=== A ===", body: "a", footer: "=== END A ===", present: true },
      { header: "=== B ===", body: "b", footer: "=== END B ===", present: false },
      { header: "=== C ===", body: "c", footer: "=== END C ===", present: true }
    ]);
    expect(out.filter((l) => l.startsWith("==="))).toEqual(["=== A ===", "=== END A ===", "=== C ===", "=== END C ==="]);
  });
});
