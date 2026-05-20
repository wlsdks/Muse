import { describe, expect, it } from "vitest";

import { parseBooleanSetting } from "../src/index.js";

describe("parseBooleanSetting", () => {
  it("returns undefined when the value is unset", () => {
    expect(parseBooleanSetting(undefined)).toBeUndefined();
  });

  it("recognises every standard truthy spelling (true / 1 / yes / on, case-insensitive, trimmed)", () => {
    for (const value of ["true", "True", "TRUE", "  true  ", "1", "yes", "YES", "on", "On"]) {
      expect(parseBooleanSetting(value)).toBe(true);
    }
  });

  it("recognises every standard falsy spelling (false / 0 / no / off, case-insensitive, trimmed)", () => {
    for (const value of ["false", "False", "FALSE", "  false  ", "0", "no", "NO", "off", "Off"]) {
      expect(parseBooleanSetting(value)).toBe(false);
    }
  });

  it("returns undefined for unrecognised spellings so callers can fall back to their own default", () => {
    for (const value of ["", "  ", "enabled", "disabled", "y", "n", "xyz", "truue", "2", "-1"]) {
      expect(parseBooleanSetting(value)).toBeUndefined();
    }
  });
});
