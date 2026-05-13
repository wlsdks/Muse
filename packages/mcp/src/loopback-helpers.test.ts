import { describe, expect, it } from "vitest";

import {
  buildJsonToolSchema,
  errorMessage,
  readBoolean,
  readJsonObject,
  readString,
  readStringArray
} from "./loopback-helpers.js";

describe("readString", () => {
  it("returns the string for any string value (including empty)", () => {
    expect(readString({ foo: "hello" }, "foo")).toBe("hello");
    expect(readString({ foo: "" }, "foo")).toBe("");
  });
  it("returns undefined for non-string values", () => {
    expect(readString({ foo: 42 }, "foo")).toBeUndefined();
    expect(readString({ foo: null }, "foo")).toBeUndefined();
    expect(readString({}, "foo")).toBeUndefined();
  });
});

describe("readStringArray", () => {
  it("returns only string entries from an array, filtering out non-strings", () => {
    expect(readStringArray({ tags: ["a", 1, "b", null, "c"] }, "tags")).toEqual(["a", "b", "c"]);
  });
  it("returns an empty array when all entries are non-strings", () => {
    expect(readStringArray({ tags: [1, 2, 3] }, "tags")).toEqual([]);
  });
  it("returns undefined when the value is not an array", () => {
    expect(readStringArray({ tags: "a,b" }, "tags")).toBeUndefined();
    expect(readStringArray({}, "tags")).toBeUndefined();
  });
});

describe("readBoolean", () => {
  it("returns true/false for boolean values", () => {
    expect(readBoolean({ ok: true }, "ok")).toBe(true);
    expect(readBoolean({ ok: false }, "ok")).toBe(false);
  });
  it("returns undefined for non-boolean values (including truthy strings)", () => {
    expect(readBoolean({ ok: "true" }, "ok")).toBeUndefined();
    expect(readBoolean({ ok: 1 }, "ok")).toBeUndefined();
    expect(readBoolean({}, "ok")).toBeUndefined();
  });
});

describe("readJsonObject", () => {
  it("returns plain objects as Record<string, unknown>", () => {
    expect(readJsonObject({ env: { foo: "bar", baz: 1 } }, "env")).toEqual({ foo: "bar", baz: 1 });
  });
  it("returns undefined for arrays, null, and non-objects", () => {
    expect(readJsonObject({ env: [1, 2] }, "env")).toBeUndefined();
    expect(readJsonObject({ env: null }, "env")).toBeUndefined();
    expect(readJsonObject({ env: "not-obj" }, "env")).toBeUndefined();
    expect(readJsonObject({}, "env")).toBeUndefined();
  });
});

describe("errorMessage", () => {
  it("returns the Error.message for Error instances", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });
  it("coerces non-Error values to string", () => {
    expect(errorMessage("plain string")).toBe("plain string");
    expect(errorMessage(42)).toBe("42");
    expect(errorMessage(null)).toBe("null");
    expect(errorMessage(undefined)).toBe("undefined");
  });
});

describe("buildJsonToolSchema", () => {
  it("emits the canonical { type, additionalProperties:false, properties } shape", () => {
    expect(buildJsonToolSchema({ query: { type: "string" } })).toEqual({
      additionalProperties: false,
      properties: { query: { type: "string" } },
      type: "object"
    });
  });
  it("includes `required` only when the list is non-empty", () => {
    const withReq = buildJsonToolSchema({ q: { type: "string" } }, ["q"]);
    expect(withReq).toMatchObject({ required: ["q"] });
    const noReq = buildJsonToolSchema({ q: { type: "string" } }, []);
    expect("required" in noReq).toBe(false);
    const noReqArg = buildJsonToolSchema({ q: { type: "string" } });
    expect("required" in noReqArg).toBe(false);
  });
  it("returns a fresh required array, not a reference to the input", () => {
    const required = ["a", "b"];
    const out = buildJsonToolSchema({ a: { type: "string" }, b: { type: "string" } }, required);
    expect(out.required).toEqual(["a", "b"]);
    expect(out.required).not.toBe(required);
  });
});
