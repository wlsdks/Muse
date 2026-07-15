import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resetCliLanguageCache } from "./cli-i18n.js";
import { reportNoModelConfigured } from "./no-model-message.js";
import type { ProgramIO } from "./program.js";

function captureIo(configDir: string): { readonly io: ProgramIO; readonly stderrLines: string[] } {
  const stderrLines: string[] = [];
  const io: ProgramIO = {
    configDir,
    stderr: (m: string) => stderrLines.push(m),
    stdout: () => {}
  };
  return { io, stderrLines };
}

describe("reportNoModelConfigured", () => {
  afterEach(() => {
    resetCliLanguageCache();
    process.exitCode = undefined;
  });

  it("names the command and points at `muse setup local` / `muse onboard`, not a bare env var (EN default)", async () => {
    const configDir = mkdtempSync(join(tmpdir(), "muse-no-model-"));
    const { io, stderrLines } = captureIo(configDir);
    await reportNoModelConfigured(io, {}, "ask");
    expect(stderrLines.join("")).toContain("muse ask requires a configured model.");
    expect(stderrLines.join("")).toContain("muse setup local");
    expect(stderrLines.join("")).toContain("muse onboard");
    expect(stderrLines.join("")).not.toContain("Set MUSE_MODEL or pass --model.");
    expect(process.exitCode).toBe(2);
  });

  it("renders in Korean when MUSE_LANG=ko", async () => {
    const configDir = mkdtempSync(join(tmpdir(), "muse-no-model-ko-"));
    const { io, stderrLines } = captureIo(configDir);
    await reportNoModelConfigured(io, { MUSE_LANG: "ko" }, "brief");
    expect(stderrLines.join("")).toContain("muse brief");
    expect(stderrLines.join("")).toContain("muse setup local");
    expect(stderrLines.join("")).toContain("모델 설정이 필요해요");
  });

  it("names the exact command passed for every call site", async () => {
    const configDir = mkdtempSync(join(tmpdir(), "muse-no-model-cmd-"));
    for (const command of ["ask", "brief", "notes conflicts", "read --ask", "remember"]) {
      const { io, stderrLines } = captureIo(configDir);
      await reportNoModelConfigured(io, {}, command);
      expect(stderrLines.join("")).toContain(`muse ${command} requires a configured model.`);
    }
  });
});
