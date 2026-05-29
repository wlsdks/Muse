import { describe, expect, it } from "vitest";

import { type CreateSessionTagInput, createSessionTagRecord } from "../src/session-tags.js";

const options = () => {
  let n = 0;
  return { now: () => new Date("2026-02-02T00:00:00Z"), idFactory: () => `tag-${n++}` };
};
const input = (overrides: Partial<CreateSessionTagInput> = {}): CreateSessionTagInput => ({
  label: "important",
  sessionId: "s1",
  createdBy: "u1",
  ...overrides,
});

describe("createSessionTagRecord", () => {
  it("applies defaults (now/idFactory), trims the label, and omits an absent comment", () => {
    expect(createSessionTagRecord(input({ label: "  important  " }), options())).toEqual({
      createdAt: new Date("2026-02-02T00:00:00Z"),
      createdBy: "u1",
      id: "tag-0",
      label: "important", // trimmed
      sessionId: "s1",
    });
  });

  it("honours an explicit id, createdAt, and comment", () => {
    expect(
      createSessionTagRecord(
        input({ id: "fixed", createdAt: new Date("2025-01-01T00:00:00Z"), comment: "a note" }),
        options(),
      ),
    ).toMatchObject({ id: "fixed", createdAt: new Date("2025-01-01T00:00:00Z"), comment: "a note" });
  });

  it("omits an empty-string comment", () => {
    expect(createSessionTagRecord(input({ comment: "" }), options())).not.toHaveProperty("comment");
  });
});
