import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolvePersona } from "./program-helpers.js";

describe("resolvePersona", () => {
  const originalEnv = process.env.MUSE_PERSONA;

  beforeEach(() => {
    delete process.env.MUSE_PERSONA;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.MUSE_PERSONA;
    } else {
      process.env.MUSE_PERSONA = originalEnv;
    }
  });

  it("prefers the explicit option over the env var (--persona always wins)", () => {
    process.env.MUSE_PERSONA = "home";
    expect(resolvePersona("work")).toBe("work");
  });

  it("falls back to MUSE_PERSONA when the option is undefined", () => {
    process.env.MUSE_PERSONA = "work";
    expect(resolvePersona(undefined)).toBe("work");
  });

  it("falls back to MUSE_PERSONA when the option is an empty / whitespace string", () => {
    process.env.MUSE_PERSONA = "work";
    expect(resolvePersona("")).toBe("work");
    expect(resolvePersona("   ")).toBe("work");
  });

  it("returns undefined when neither option nor env is set", () => {
    expect(resolvePersona(undefined)).toBeUndefined();
  });

  it("returns undefined when env is whitespace-only (treat as unset)", () => {
    process.env.MUSE_PERSONA = "   ";
    expect(resolvePersona(undefined)).toBeUndefined();
  });

  it("trims surrounding whitespace on the option value", () => {
    expect(resolvePersona("  work  ")).toBe("work");
  });

  it("trims surrounding whitespace on the env value", () => {
    process.env.MUSE_PERSONA = "  work  ";
    expect(resolvePersona(undefined)).toBe("work");
  });
});
