import { describe, expect, it } from "vitest";

import {
  hasOwn as hasOwnFromInputUtils,
  isJsonObject as isJsonObjectFromInputUtils,
  isJsonValue as isJsonValueFromInputUtils,
  isRecord as isRecordFromInputUtils,
  parseRuntimeSettingType as parseStrict,
  readBoolean as readBooleanFromInputUtils,
  readNumber as readNumberFromInputUtils,
  readStringArray as readStringArrayFromInputUtils
} from "../src/server-input-utils.js";
import {
  hasOwn as hasOwnFromMcp,
  isJsonObject as isJsonObjectFromMcp,
  isJsonValue as isJsonValueFromMcp,
  isRecord as isRecordFromMcp,
  readBoolean as readBooleanFromMcp,
  readNumber as readNumberFromMcp,
  readStringArray as readStringArrayFromMcp
} from "../src/mcp-routes-parsers.js";
import { parseRuntimeSettingType as parseCompat } from "../src/compat-routes.js";

describe("api shape-inspection helpers — single shared implementation", () => {
  it("isRecord / isJsonObject / isJsonValue / hasOwn / readBoolean / readNumber match across re-export sites", () => {
    expect(isRecordFromInputUtils).toBe(isRecordFromMcp);
    expect(isJsonObjectFromInputUtils).toBe(isJsonObjectFromMcp);
    expect(isJsonValueFromInputUtils).toBe(isJsonValueFromMcp);
    expect(hasOwnFromInputUtils).toBe(hasOwnFromMcp);
    expect(readBooleanFromInputUtils).toBe(readBooleanFromMcp);
    expect(readNumberFromInputUtils).toBe(readNumberFromMcp);
    expect(readStringArrayFromInputUtils).toBe(readStringArrayFromMcp);
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
