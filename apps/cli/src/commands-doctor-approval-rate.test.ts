import { describe, expect, it } from "vitest";

import { analyzeApprovalRates, RUBBER_STAMP_MIN_SAMPLE_SIZE } from "@muse/proactivity";
import type { ActionLogEntry } from "@muse/stores";

import { formatApprovalRateDoctor } from "./commands-doctor-approval-rate.js";

/**
 * Contract-faithful fixture: the exact shape `appendActionLog` writes (every
 * required `ActionLogEntry` field), not a shortcut object that bypasses the
 * real log format.
 */
function entry(gateClass: string, result: ActionLogEntry["result"], id: string): ActionLogEntry {
  return {
    detail: "",
    gateClass,
    id,
    result,
    userId: "local",
    what: `${gateClass} action`,
    when: new Date("2026-07-13T00:00:00.000Z").toISOString(),
    why: "test"
  };
}

describe("formatApprovalRateDoctor", () => {
  it("reports the no-entries case", () => {
    const out = formatApprovalRateDoctor(analyzeApprovalRates([]));
    expect(out).toContain("no gate-classed action-log entries recorded yet");
  });

  it("renders a real action-log-shaped rubber-stamp finding end to end", () => {
    const entries: ActionLogEntry[] = Array.from({ length: RUBBER_STAMP_MIN_SAMPLE_SIZE }, (_unused, i) =>
      entry("web_action", "performed", `act_${i.toString()}`));
    const out = formatApprovalRateDoctor(analyzeApprovalRates(entries));
    expect(out).toContain("web_action");
    expect(out).toContain(`${RUBBER_STAMP_MIN_SAMPLE_SIZE.toString()} prompts`);
    expect(out).toContain(`${RUBBER_STAMP_MIN_SAMPLE_SIZE.toString()} approved (100%)`);
    expect(out).toContain("rubber stamp");
    expect(out).toContain("pre-approved safe boundary");
    expect(out).toContain("1 of 1 gate class");
  });

  it("does not flag a healthy, actually-exercised gate", () => {
    // 18/20 approved = 90%, below the 93% threshold — a genuinely exercised gate.
    const entries: ActionLogEntry[] = [
      entry("email_send", "refused", "a1"),
      entry("email_send", "refused", "a2"),
      ...Array.from({ length: RUBBER_STAMP_MIN_SAMPLE_SIZE - 2 }, (_unused, i) => entry("email_send", "performed", `a${(i + 3).toString()}`))
    ];
    const out = formatApprovalRateDoctor(analyzeApprovalRates(entries));
    expect(out).toContain("email_send");
    expect(out).not.toContain("rubber stamp");
    expect(out).toContain("none reflexively approved yet");
  });

  it("surfaces an execution-failure count separately from denials", () => {
    const entries: ActionLogEntry[] = [
      ...Array.from({ length: 18 }, (_unused, i) => entry("proposed_action", "performed", `p${i.toString()}`)),
      entry("proposed_action", "failed", "pfail1"),
      entry("proposed_action", "failed", "pfail2")
    ];
    const out = formatApprovalRateDoctor(analyzeApprovalRates(entries));
    expect(out).toContain("2 execution failures");
    expect(out).toContain("rubber stamp");
  });
});
