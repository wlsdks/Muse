import { describe, expect, it } from "vitest";

import { hashForView, VIEW_IDS, viewFromHash } from "./view-route.js";

describe("viewFromHash", () => {
  it("parses every known view id in '#/id' form", () => {
    for (const id of VIEW_IDS) {
      expect(viewFromHash(`#/${id}`)).toBe(id);
    }
  });

  it("also accepts the id without a leading slash", () => {
    expect(viewFromHash("#tasks")).toBe("tasks");
  });

  it("falls back to chat for an empty hash", () => {
    expect(viewFromHash("")).toBe("chat");
  });

  it("falls back to chat for a bare '#' or '#/'", () => {
    expect(viewFromHash("#")).toBe("chat");
    expect(viewFromHash("#/")).toBe("chat");
  });

  it("falls back to chat for an unrecognized/garbage hash", () => {
    expect(viewFromHash("#/nope")).toBe("chat");
    expect(viewFromHash("#bogus-garbage")).toBe("chat");
  });

  it("is case-sensitive: an id in the wrong case is treated as unknown", () => {
    expect(viewFromHash("#/Tasks")).toBe("chat");
  });
});

describe("hashForView", () => {
  it("formats every known view id as '#/id'", () => {
    for (const id of VIEW_IDS) {
      expect(hashForView(id)).toBe(`#/${id}`);
    }
  });

  it("round-trips through viewFromHash for every known id", () => {
    for (const id of VIEW_IDS) {
      expect(viewFromHash(hashForView(id))).toBe(id);
    }
  });
});
