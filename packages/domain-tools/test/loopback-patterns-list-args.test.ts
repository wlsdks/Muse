/**
 * `muse.pattern.list` used to silently substitute a default whenever
 * `minConfidence` or `limit` couldn't be used as given (90 / "0.9" / "high"
 * all fell through to the unfiltered default) and never echoed which
 * value was actually applied — so a filtered request and an unfiltered one
 * were byte-identical in the response. `minConfidence`/`limit` are now
 * validated up front (error naming the parameter + expected form + a
 * concrete example) and, on success, the APPLIED values are echoed.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createPatternsMcpServer } from "../src/index.js";

function listTool() {
  const dir = mkdtempSync(join(tmpdir(), "muse-patterns-"));
  const server = createPatternsMcpServer({
    file: join(dir, "patterns-fired.json"),
    homeDir: dir,
    notesDir: join(dir, "notes"),
    tasksFile: join(dir, "tasks.json")
  });
  return server.tools.find((t) => t.name === "list")!;
}

describe("muse.pattern.list — argument validation + disclosure", () => {
  it("errors on an out-of-range minConfidence (a percent, not a fraction) instead of silently using 0", async () => {
    const out = await listTool().execute({ minConfidence: 90 }, { runId: "r-1" }) as { error?: string; patterns?: unknown };
    expect(out.error).toBeDefined();
    expect(out.error).toContain("0 and 1");
    expect(out.patterns).toBeUndefined();
  });

  it("errors on a non-numeric minConfidence", async () => {
    const out = await listTool().execute({ minConfidence: "high" }, { runId: "r-1" }) as { error?: string };
    expect(out.error).toBeDefined();
  });

  it("errors on a non-numeric limit", async () => {
    const out = await listTool().execute({ limit: "lots" }, { runId: "r-1" }) as { error?: string };
    expect(out.error).toBeDefined();
    expect(out.error).toContain("limit");
  });

  it("echoes the applied minConfidence/limit on success", async () => {
    const out = await listTool().execute({ limit: 5, minConfidence: 0.6 }, { runId: "r-1" }) as { limit?: number; minConfidence?: number; patterns?: unknown[] };
    expect(out.minConfidence).toBe(0.6);
    expect(out.limit).toBe(5);
    expect(out.patterns).toEqual([]);
  });

  it("defaults silently (minConfidence 0) when both are omitted", async () => {
    const out = await listTool().execute({}, { runId: "r-1" }) as { error?: string; minConfidence?: number };
    expect(out.error).toBeUndefined();
    expect(out.minConfidence).toBe(0);
  });
});
