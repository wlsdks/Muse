import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { clampPositive, readCredentialsSync, stringField } from "./provider-utils.js";

describe("readCredentialsSync", () => {
  it("returns the providers map from a well-formed file", () => {
    const dir = mkdtempSync(join(tmpdir(), "muse-cred-"));
    const f = join(dir, "creds.json");
    writeFileSync(f, JSON.stringify({ providers: { telegram: { token: "abc" } } }), "utf8");
    expect(readCredentialsSync(f)).toEqual({ telegram: { token: "abc" } });
  });
  it("returns {} when the file is missing", () => {
    expect(readCredentialsSync("/nonexistent/path/creds.json")).toEqual({});
  });
  it("returns {} when the file has invalid JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "muse-cred-"));
    const f = join(dir, "creds.json");
    writeFileSync(f, "{not json", "utf8");
    expect(readCredentialsSync(f)).toEqual({});
  });
  it("returns {} when providers field is missing or wrong shape", () => {
    const dir = mkdtempSync(join(tmpdir(), "muse-cred-"));
    const f = join(dir, "creds.json");
    writeFileSync(f, JSON.stringify({ not_providers: {} }), "utf8");
    expect(readCredentialsSync(f)).toEqual({});
    writeFileSync(f, JSON.stringify({ providers: "wrong-type" }), "utf8");
    expect(readCredentialsSync(f)).toEqual({});
  });
});

describe("stringField", () => {
  it("returns the string when the field is non-empty", () => {
    expect(stringField({ token: "abc" }, "token")).toBe("abc");
  });
  it("returns undefined for missing keys / empty strings / non-strings / undefined record", () => {
    expect(stringField({ token: "" }, "token")).toBeUndefined();
    expect(stringField({ token: 42 }, "token")).toBeUndefined();
    expect(stringField({}, "token")).toBeUndefined();
    expect(stringField(undefined, "token")).toBeUndefined();
  });
});

describe("clampPositive", () => {
  it("returns the parsed integer when value is a positive integer string", () => {
    expect(clampPositive("42", 10)).toBe(42);
    expect(clampPositive("  7  ", 10)).toBe(7);
  });
  it("falls back when value is undefined / non-numeric / non-positive", () => {
    expect(clampPositive(undefined, 10)).toBe(10);
    expect(clampPositive("not a number", 10)).toBe(10);
    expect(clampPositive("0", 10)).toBe(10);
    expect(clampPositive("-5", 10)).toBe(10);
  });
});
