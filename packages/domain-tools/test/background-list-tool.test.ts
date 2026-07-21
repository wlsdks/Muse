import { describe, expect, it } from "vitest";

import type { BackgroundProcessRecord } from "@muse/stores";

import { createBackgroundListTool } from "../src/background-list-tool.js";

const rec = (over: Partial<BackgroundProcessRecord>): BackgroundProcessRecord => ({
  id: "p", pid: 4242, command: "npm run dev", startedAt: "2026-06-24T00:00:00.000Z", status: "running", ...over
});

describe("background_list tool (X-3)", () => {
  it("is a read-only system tool with an unambiguous name", () => {
    const tool = createBackgroundListTool({ processes: () => [] });
    expect(tool.definition.name).toBe("background_list");
    expect(tool.definition.risk).toBe("read");
  });

  it("lists processes (id/command/status, exitCode when present)", async () => {
    const tool = createBackgroundListTool({
      processes: () => [rec({ id: "a" }), rec({ id: "b", status: "exited", exitCode: 0 })]
    });
    const out = await tool.execute({}) as { count: number; processes: { id: string; status: string; exitCode?: number }[] };
    expect(out.count).toBe(2);
    expect(out.processes.map((p) => p.id)).toEqual(["a", "b"]);
    expect(out.processes[1]!.exitCode).toBe(0);
    expect(out.processes[0]!.exitCode).toBeUndefined();
  });

  it("filters by status", async () => {
    const tool = createBackgroundListTool({
      processes: () => [rec({ id: "a", status: "running" }), rec({ id: "b", status: "failed", exitCode: 1 })]
    });
    const out = await tool.execute({ status: "running" }) as { count: number; processes: { id: string }[] };
    expect(out.count).toBe(1);
    expect(out.processes[0]!.id).toBe("a");
  });

  // An out-of-enum / mis-cased status used to silently fall through to a real,
  // matching-nothing filter — "alive" (not a real status) and "Running" (mis-cased)
  // both returned count:0 as if that were a true fact about the process list.
  it("an unknown status filter returns a named error, not a silent count:0", async () => {
    const tool = createBackgroundListTool({ processes: () => [rec({ id: "a", status: "running" })] });
    const out = await tool.execute({ status: "alive" }) as { count: number; processes: unknown[]; error?: string };
    expect(out.count).toBe(0);
    expect(out.processes).toEqual([]);
    expect(out.error).toContain("alive");
    expect(out.error).toContain("running");
  });

  it("accepts a mis-cased status filter case-insensitively", async () => {
    const tool = createBackgroundListTool({ processes: () => [rec({ id: "a", status: "running" })] });
    const out = await tool.execute({ status: "Running" }) as { count: number; error?: string };
    expect(out.error).toBeUndefined();
    expect(out.count).toBe(1);
  });
});
