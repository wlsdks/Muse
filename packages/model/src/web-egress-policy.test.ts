import { describe, expect, it } from "vitest";

import { evaluateWebEgressPosture, isWebEgressAllowed } from "./web-egress-policy.js";

describe("isWebEgressAllowed", () => {
  it("defaults to ON when unset (web tools stay available)", () => {
    expect(isWebEgressAllowed({})).toBe(true);
  });

  it.each(["false", "0", "no", "off", "OFF", " Off ", "No"])("treats %j as OFF", (value) => {
    expect(isWebEgressAllowed({ MUSE_WEB_EGRESS: value })).toBe(false);
  });

  it.each(["true", "1", "yes", "on", "anything-else", ""])("treats %j as ON", (value) => {
    expect(isWebEgressAllowed({ MUSE_WEB_EGRESS: value })).toBe(true);
  });

  it("is independent of MUSE_LOCAL_ONLY (orthogonal egress classes)", () => {
    expect(isWebEgressAllowed({ MUSE_LOCAL_ONLY: "true" })).toBe(true);
    expect(isWebEgressAllowed({ MUSE_LOCAL_ONLY: "true", MUSE_WEB_EGRESS: "false" })).toBe(false);
    expect(isWebEgressAllowed({ MUSE_LOCAL_ONLY: "false", MUSE_WEB_EGRESS: "true" })).toBe(true);
  });
});

describe("evaluateWebEgressPosture", () => {
  it("reports default-on without an explicit disable", () => {
    expect(evaluateWebEgressPosture({})).toEqual({ enabled: true, explicitlyDisabled: false });
  });

  it("flags an explicit disable", () => {
    expect(evaluateWebEgressPosture({ MUSE_WEB_EGRESS: "off" })).toEqual({ enabled: false, explicitlyDisabled: true });
  });
});
