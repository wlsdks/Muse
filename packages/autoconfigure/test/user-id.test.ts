import { describe, expect, it } from "vitest";

import { resolveDefaultUserId } from "../src/user-id.js";

describe("resolveDefaultUserId — the shared default user bucket", () => {
  it("falls back to 'default' when neither MUSE_USER_ID nor USER is set", () => {
    expect(resolveDefaultUserId({})).toBe("default");
  });

  it("honours MUSE_USER_ID first", () => {
    expect(resolveDefaultUserId({ MUSE_USER_ID: "stark", USER: "jinan" })).toBe("stark");
  });

  it("falls through to USER when MUSE_USER_ID is unset", () => {
    expect(resolveDefaultUserId({ USER: "jinan" })).toBe("jinan");
  });

  it("treats empty / whitespace-only as unset (a pre-cleared MUSE_USER_ID= must fall through)", () => {
    expect(resolveDefaultUserId({ MUSE_USER_ID: "", USER: "fallback" })).toBe("fallback");
    expect(resolveDefaultUserId({ MUSE_USER_ID: "   ", USER: "fallback" })).toBe("fallback");
    expect(resolveDefaultUserId({ MUSE_USER_ID: "", USER: "" })).toBe("default");
  });

  it("trims surrounding whitespace", () => {
    expect(resolveDefaultUserId({ MUSE_USER_ID: "  stark  " })).toBe("stark");
  });
});
