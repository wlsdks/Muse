import { describe, expect, it } from "vitest";

import { emphasizeRiskyTokens, identifyRiskyTokens } from "../src/index.js";

function spanTokens(text: string): string[] {
  return identifyRiskyTokens(text).map((s) => s.token);
}

describe("identifyRiskyTokens", () => {
  it("flags rm, its recursive-force flag, and the bare root path with correct offsets", () => {
    const text = "rm -rf /";
    const spans = identifyRiskyTokens(text);
    expect(spans.map((s) => s.token)).toEqual(["rm", "-rf", "/"]);
    for (const span of spans) {
      expect(text.slice(span.start, span.end)).toBe(span.token);
    }
    expect(spans[0]!.start).toBe(0);
    expect(spans[1]!.start).toBe(3);
    expect(spans[2]!.start).toBe(7);
  });

  it("flags chmod combined with a recursive flag, but not a non-sensitive tilde path", () => {
    const text = "chmod -R 777 ~/dir";
    const spans = identifyRiskyTokens(text);
    // ~/dir is not in the sensitive-subdir list (~/.ssh, ~/.aws, ~/.gnupg,
    // ~/.config) and a bare `-R` alone (no force) is not a "destructive
    // flag" per policy — only the verb is flagged, because chmod+recursive
    // is what makes this risky.
    expect(spans.map((s) => s.token)).toEqual(["chmod"]);
    expect(spans[0]!.reason).toContain("recursive");
  });

  it("flags dd and its raw device target as one path token", () => {
    const spans = identifyRiskyTokens("dd of=/dev/disk2");
    expect(spans.map((s) => s.token)).toEqual(["dd", "/dev/disk2"]);
  });

  it("flags a sensitive dotfile path but never the benign verb reading it", () => {
    const spans = identifyRiskyTokens("cat ~/.ssh/id_rsa");
    expect(spans.map((s) => s.token)).toEqual(["~/.ssh/id_rsa"]);
  });

  it("flags rm/-rf/~ even after a sudo prefix", () => {
    const spans = identifyRiskyTokens("sudo rm -rf ~");
    expect(spans.map((s) => s.token)).toEqual(["rm", "-rf", "~"]);
  });

  it("returns [] for safe commands", () => {
    expect(spanTokens("ls -la /tmp")).toEqual([]);
    expect(spanTokens('echo "hi there"')).toEqual([]);
    expect(spanTokens("node build.js")).toEqual([]);
  });

  it("does not flag a destructive word quoted inside an unrelated argument (command-position/quote awareness)", () => {
    expect(spanTokens('git commit -m "remove the old rm helper"')).toEqual([]);
  });

  it("never throws on pathological or empty input", () => {
    expect(() => identifyRiskyTokens("")).not.toThrow();
    expect(identifyRiskyTokens("")).toEqual([]);
    expect(() => identifyRiskyTokens("-".repeat(20000))).not.toThrow();
  });
});

describe("emphasizeRiskyTokens", () => {
  it("wraps a risky token in bold-red ANSI", () => {
    const out = emphasizeRiskyTokens("rm -rf /");
    expect(out).toContain("\x1b[1;31mrm\x1b[0m");
    expect(out).toContain("\x1b[1;31m-rf\x1b[0m");
    expect(out).toContain("\x1b[1;31m/\x1b[0m");
  });

  it("returns the input unchanged (===) when there is nothing risky", () => {
    const input = "ls -la /tmp";
    expect(emphasizeRiskyTokens(input)).toBe(input);
  });

  it("keeps correct offsets across multiple spans — stripping ANSI recovers the original text", () => {
    const input = "sudo rm -rf ~";
    const out = emphasizeRiskyTokens(input);
    const stripped = out.replace(/\x1b\[[0-9;]*m/gu, "");
    expect(stripped).toBe(input);
    expect(out).toBe(
      "sudo \x1b[1;31mrm\x1b[0m \x1b[1;31m-rf\x1b[0m \x1b[1;31m~\x1b[0m"
    );
  });
});
