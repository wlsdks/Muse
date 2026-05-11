import { describe, expect, it } from "vitest";

import {
  isJsonObject as isJsonObjectFromInputUtils,
  isJsonValue as isJsonValueFromInputUtils,
  isRecord as isRecordFromInputUtils,
  parseRuntimeSettingType as parseStrict
} from "../src/server-input-utils.js";
import {
  isJsonObject as isJsonObjectFromMcp,
  isJsonValue as isJsonValueFromMcp,
  isRecord as isRecordFromMcp
} from "../src/mcp-routes-parsers.js";
import { parseRuntimeSettingType as parseCompat } from "../src/compat-routes.js";

describe("JSON guards — single shared implementation across api/src", () => {
  it("isRecord / isJsonObject / isJsonValue are the same function across re-export sites", () => {
    expect(isRecordFromInputUtils).toBe(isRecordFromMcp);
    expect(isJsonObjectFromInputUtils).toBe(isJsonObjectFromMcp);
    expect(isJsonValueFromInputUtils).toBe(isJsonValueFromMcp);
  });
});

describe("parseRuntimeSettingType — single shared implementation", () => {
  it("server-input-utils and compat-routes are the same function reference", () => {
    expect(parseStrict).toBe(parseCompat);
  });

  for (const valid of ["string", "number", "boolean", "json"] as const) {
    it(`accepts canonical ${valid}`, () => {
      expect(parseStrict(valid)).toBe(valid);
    });
  }

  it("trims whitespace before matching", () => {
    expect(parseStrict("  boolean  ")).toBe("boolean");
  });

  it("normalises case before matching", () => {
    expect(parseStrict("Boolean")).toBe("boolean");
    expect(parseStrict("JSON")).toBe("json");
  });

  it("returns undefined for unknown values", () => {
    expect(parseStrict("date")).toBeUndefined();
    expect(parseStrict("")).toBeUndefined();
    expect(parseStrict(123)).toBeUndefined();
    expect(parseStrict(undefined)).toBeUndefined();
    expect(parseStrict(null)).toBeUndefined();
  });
});
