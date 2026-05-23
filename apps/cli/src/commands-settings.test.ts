import { Command } from "commander";
import { describe, expect, it } from "vitest";

import { inferSettingType, registerSettingsCommands, type SettingsCommandHelpers } from "./commands-settings.js";

function harness(): { run: (args: string[]) => Promise<unknown>; requests: { path: string; body?: Record<string, unknown>; method?: string }[] } {
  const requests: { path: string; body?: Record<string, unknown>; method?: string }[] = [];
  const io = { stderr: () => { /* no-op */ }, stdout: () => { /* no-op */ } };
  const helpers: SettingsCommandHelpers = {
    apiRequest: async (_io, _command, path, body, method) => {
      requests.push({ body, method, path });
      return { ok: true };
    },
    writeOutput: () => { /* no-op */ }
  };
  const program = new Command();
  program.exitOverride();
  registerSettingsCommands(program, io as never, helpers);
  return { requests, run: (args) => program.parseAsync(["node", "muse", "settings", ...args]) };
}

describe("inferSettingType", () => {
  it("recognises boolean literals", () => {
    expect(inferSettingType("true")).toBe("boolean");
    expect(inferSettingType("false")).toBe("boolean");
    expect(inferSettingType("  true  ")).toBe("boolean");
  });

  it("recognises integer + decimal numeric literals", () => {
    expect(inferSettingType("42")).toBe("number");
    expect(inferSettingType("-1")).toBe("number");
    expect(inferSettingType("3.14")).toBe("number");
  });

  it("recognises JSON object/array literals", () => {
    expect(inferSettingType('{"a":1}')).toBe("json");
    expect(inferSettingType("[1,2,3]")).toBe("json");
  });

  it("falls back to string for unparseable literals", () => {
    expect(inferSettingType("hello world")).toBe("string");
    expect(inferSettingType("{not-json}")).toBe("string");
    expect(inferSettingType("True")).toBe("string");
    expect(inferSettingType("")).toBe("string");
  });
});

describe("muse settings set — validates an explicit --type override", () => {
  it("rejects an invalid --type WITHOUT issuing the PUT, with a `did you mean` hint for a near-miss", async () => {
    const h = harness();
    await expect(h.run(["set", "webSearch.enabled", "true", "--type", "boolen"]))
      .rejects.toThrow(/--type must be one of string \| number \| boolean \| json.*did you mean 'boolean'/u);
    expect(h.requests).toHaveLength(0);
  });

  it("rejects a wholly-unknown --type WITHOUT a guess (no random suggestion)", async () => {
    const h = harness();
    await expect(h.run(["set", "k", "v", "--type", "totallydifferent"]))
      .rejects.toThrow(/--type must be one of string \| number \| boolean \| json \(got 'totallydifferent'\)$/u);
    expect(h.requests).toHaveLength(0);
  });

  it("accepts a valid --type (case-insensitive) and sends it in the PUT body", async () => {
    const h = harness();
    await h.run(["set", "webSearch.maxResults", "5", "--type", "NUMBER"]);
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0]!.method).toBe("PUT");
    expect(h.requests[0]!.body).toMatchObject({ type: "number", value: "5" });
  });

  it("auto-infers the type when --type is omitted", async () => {
    const h = harness();
    await h.run(["set", "webSearch.enabled", "true"]);
    expect(h.requests[0]!.body).toMatchObject({ type: "boolean", value: "true" });
  });
});
