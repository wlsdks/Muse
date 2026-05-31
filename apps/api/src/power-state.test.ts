import { describe, expect, it } from "vitest";

import { isOnAcPower, isPowerOkForLlm, parseOnAcPower } from "./power-state.js";

describe("parseOnAcPower — read power source from `pmset -g batt`", () => {
  it("true on AC, false on battery", () => {
    expect(parseOnAcPower("Now drawing from 'AC Power'\n -InternalBattery-0 100%; charged")).toBe(true);
    expect(parseOnAcPower("Now drawing from 'Battery Power'\n -InternalBattery-0 85%; discharging")).toBe(false);
  });

  it("undefined (fail-closed) when the source line is absent/unparseable", () => {
    expect(parseOnAcPower("no power line here")).toBeUndefined();
    expect(parseOnAcPower("")).toBeUndefined();
  });
});

describe("isOnAcPower — fail-closed probe", () => {
  it("reads AC from injected pmset on macOS; undefined off macOS", () => {
    const acOut = "Now drawing from 'AC Power'";
    if (process.platform === "darwin") {
      expect(isOnAcPower(() => acOut)).toBe(true);
    } else {
      expect(isOnAcPower(() => acOut)).toBeUndefined();
    }
  });

  it("undefined when pmset throws (fail-closed)", () => {
    expect(isOnAcPower(() => { throw new Error("pmset missing"); })).toBeUndefined();
  });
});

describe("isPowerOkForLlm — AC only (battery/unknown ⇒ skip)", () => {
  it("only confirmed AC is OK; battery and unknown are not", () => {
    expect(isPowerOkForLlm(true)).toBe(true);
    expect(isPowerOkForLlm(false)).toBe(false);
    expect(isPowerOkForLlm(undefined)).toBe(false);
  });
});
