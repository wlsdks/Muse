import type { MacCommandResult } from "./macos-exec.js";
import { describe, expect, it } from "vitest";

import { brightnessShortcutSetupMessage, createMacSystemSetTool } from "./macos-system-set-tool.js";

const ctx = { runId: "r", userId: "u1" };
const ok = (stdout: string): MacCommandResult => ({ exitCode: 0, stderr: "", stdout, timedOut: false });
const fail = (stderr: string): MacCommandResult => ({ exitCode: 1, stderr, stdout: "", timedOut: false });
/** The REAL macOS `shortcuts run <missing>` error captured on this box (KO locale). */
const REAL_MISSING = "Error: 작업을 완료할 수 없습니다. 단축어를 찾을 수 없음";

describe("createMacSystemSetTool — brightness", () => {
  it("exposes brightness in the setting enum", () => {
    const tool = createMacSystemSetTool();
    const en = (tool.definition.inputSchema as { properties: { setting: { enum: string[] } } }).properties.setting.enum;
    expect(en).toContain("brightness");
  });

  it("passes the value to the shortcut as stdin input via --input-path -", async () => {
    let argv: readonly string[] = [];
    let input: string | undefined;
    const tool = createMacSystemSetTool({
      shortcuts: async (a, i) => { argv = a; input = i; return ok(""); }
    });
    const result = await tool.execute({ setting: "brightness", value: 60 }, ctx);
    expect(argv).toEqual(["run", "Muse Set Brightness", "--input-path", "-", "--output-path", "-"]);
    expect(input).toBe("60");
    expect(result).toEqual({ set: true, setting: "brightness", shortcut: "Muse Set Brightness", value: 60 });
  });

  it("clamps above 100 down to 100", async () => {
    let input: string | undefined;
    const tool = createMacSystemSetTool({ shortcuts: async (_a, i) => { input = i; return ok(""); } });
    await tool.execute({ setting: "brightness", value: 150 }, ctx);
    expect(input).toBe("100");
  });

  it("clamps below 0 up to 0", async () => {
    let input: string | undefined;
    const tool = createMacSystemSetTool({ shortcuts: async (_a, i) => { input = i; return ok(""); } });
    await tool.execute({ setting: "brightness", value: -5 }, ctx);
    expect(input).toBe("0");
  });

  it("rounds a fractional value", async () => {
    let input: string | undefined;
    const tool = createMacSystemSetTool({ shortcuts: async (_a, i) => { input = i; return ok(""); } });
    await tool.execute({ setting: "brightness", value: 33.6 }, ctx);
    expect(input).toBe("34");
  });

  it("requires a numeric value WITHOUT spawning the shortcuts runner", async () => {
    let called = false;
    const tool = createMacSystemSetTool({ shortcuts: async () => { called = true; return ok(""); } });
    expect(await tool.execute({ setting: "brightness" }, ctx)).toEqual({ set: false, reason: "setting 'brightness' requires a numeric 'value' between 0 and 100" });
    expect(called).toBe(false);
  });

  it("a missing Brightness shortcut (REAL error) returns the actionable setup message", async () => {
    const tool = createMacSystemSetTool({ shortcuts: async () => fail(REAL_MISSING) });
    const result = await tool.execute({ setting: "brightness", value: 60 }, ctx) as { set: boolean; reason: string };
    expect(result.set).toBe(false);
    expect(result.reason).toBe(brightnessShortcutSetupMessage("Muse Set Brightness"));
  });

  it("env/dep override wins over the default shortcut name", async () => {
    let argv: readonly string[] = [];
    const tool = createMacSystemSetTool({
      brightnessShortcut: "My Bright",
      shortcuts: async (a) => { argv = a; return ok(""); }
    });
    await tool.execute({ setting: "brightness", value: 60 }, ctx);
    expect(argv[1]).toBe("My Bright");
  });

  it("fails soft when the shortcuts runner throws (no crash)", async () => {
    const tool = createMacSystemSetTool({ shortcuts: async () => { throw new Error("spawn ENOENT"); } });
    expect(await tool.execute({ setting: "brightness", value: 60 }, ctx)).toMatchObject({ reason: expect.stringContaining("spawn failed"), set: false });
  });

  it("fails soft when the shortcuts runner times out", async () => {
    const tool = createMacSystemSetTool({ shortcuts: async () => ({ exitCode: null, stderr: "", stdout: "", timedOut: true }) });
    expect(await tool.execute({ setting: "brightness", value: 60 }, ctx)).toMatchObject({ reason: expect.stringContaining("timed out"), set: false });
  });
});
