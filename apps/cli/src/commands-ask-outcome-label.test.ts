import { describe, expect, it, vi } from "vitest";

import { askOutcomeLabel, askWeaknessAxis, recordAskWeakness } from "./commands-ask.js";

describe("askOutcomeLabel (cli.local trace outcome label)", () => {
  it("labels a refusal as abstain regardless of the verdict", () => {
    expect(askOutcomeLabel({ refusal: true, verdict: null })).toBe("abstain");
    expect(askOutcomeLabel({ refusal: true, verdict: "grounded" })).toBe("abstain");
    expect(askOutcomeLabel({ refusal: true, verdict: "ungrounded" })).toBe("abstain");
  });

  it("passes the rubric verdict through on a non-refusal answer", () => {
    expect(askOutcomeLabel({ refusal: false, verdict: "grounded" })).toBe("grounded");
    expect(askOutcomeLabel({ refusal: false, verdict: "ungrounded" })).toBe("ungrounded");
  });

  it("stays null when the verdict never ran (json mode / vision skip)", () => {
    expect(askOutcomeLabel({ refusal: false, verdict: null })).toBeNull();
  });
});

describe("askOutcomeLabel coverage for the --json verdict field", () => {
  it("every payload value the json consumer can receive is produced by the label fn", () => {
    expect(askOutcomeLabel({ refusal: false, verdict: "grounded" })).toBe("grounded");
    expect(askOutcomeLabel({ refusal: false, verdict: "ungrounded" })).toBe("ungrounded");
    expect(askOutcomeLabel({ refusal: true, verdict: null })).toBe("abstain");
    expect(askOutcomeLabel({ refusal: false, verdict: null })).toBeNull();
  });
});

describe("askWeaknessAxis (ask-path failure → weakness fuel)", () => {
  it("maps a grounding miss (abstain / ungrounded) to grounding-gap", () => {
    expect(askWeaknessAxis("abstain")).toBe("grounding-gap");
    expect(askWeaknessAxis("ungrounded")).toBe("grounding-gap");
  });
  it("is null for a success or a skipped verdict (not a failure)", () => {
    expect(askWeaknessAxis("grounded")).toBeNull();
    expect(askWeaknessAxis(null)).toBeNull();
  });
});

describe("recordAskWeakness (feeds the weakness ledger, best-effort)", () => {
  const deps = (record = vi.fn().mockResolvedValue(undefined)) => ({ recordWeakness: record, weaknessesFile: "/tmp/w.json" });

  it("records a grounding-gap with the query for a failing outcome", async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    await recordAskWeakness("what is my office VPN MTU?", "ungrounded", deps(record));
    expect(record).toHaveBeenCalledWith("/tmp/w.json", { axis: "grounding-gap", message: "what is my office VPN MTU?" });
  });

  it("records nothing on a success / skipped outcome or an empty query", async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    await recordAskWeakness("q", "grounded", deps(record));
    await recordAskWeakness("q", null, deps(record));
    await recordAskWeakness("   ", "ungrounded", deps(record));
    expect(record).not.toHaveBeenCalled();
  });

  it("swallows a throwing ledger write — never breaks the ask command", async () => {
    const record = vi.fn().mockRejectedValue(new Error("ledger unwritable"));
    await expect(recordAskWeakness("q", "abstain", deps(record))).resolves.toBeUndefined();
    expect(record).toHaveBeenCalledTimes(1);
  });
});

describe("createStageTimer", () => {
  it("accumulates per-stage deltas and a running total", async () => {
    const { createStageTimer } = await import("./commands-ask.js");
    let t = 1000;
    const timer = createStageTimer(() => t);
    t = 1500; timer.mark("retrievalMs");
    t = 4000; timer.mark("generationMs");
    t = 4200; timer.mark("verdictMs");
    expect(timer.timings()).toEqual({ generationMs: 2500, retrievalMs: 500, totalMs: 3200, verdictMs: 200 });
  });
});
