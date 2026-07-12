import { describe, expect, it } from "vitest";

import { OneShotRecoveryState } from "../src/one-shot-recovery-state.js";

describe("OneShotRecoveryState — guaranteed-once recovery branches", () => {
  it("claim returns true on the FIRST claim and false on every claim after (double-fire structurally impossible)", () => {
    const state = new OneShotRecoveryState();
    expect(state.claim("false-done-reprompt")).toBe(true);
    expect(state.claim("false-done-reprompt")).toBe(false);
    expect(state.claim("false-done-reprompt")).toBe(false);
  });

  it("a guarded recovery body runs exactly once across repeated claims", () => {
    const state = new OneShotRecoveryState();
    let runs = 0;
    for (let i = 0; i < 5; i += 1) {
      if (state.claim("repair")) {
        runs += 1;
      }
    }
    expect(runs).toBe(1);
  });

  it("tracks distinct branches independently — each still guaranteed-once", () => {
    const state = new OneShotRecoveryState();
    expect(state.claim("repair")).toBe(true);
    expect(state.claim("reverify")).toBe(true);
    expect(state.claim("repair")).toBe(false);
    expect(state.claim("reverify")).toBe(false);
    expect(state.hasClaimed("repair")).toBe(true);
    expect(state.hasClaimed("reverify")).toBe(true);
  });

  it("reports an unclaimed branch as not claimed and does not consume it", () => {
    const state = new OneShotRecoveryState();
    expect(state.hasClaimed("never")).toBe(false);
    // hasClaimed must be a pure query — it must NOT claim the branch
    expect(state.claim("never")).toBe(true);
  });
});
