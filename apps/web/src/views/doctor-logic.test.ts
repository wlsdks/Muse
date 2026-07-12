import { describe, expect, it } from "vitest";

import { severityTone, sortChecks, worstSeverity } from "./doctor-logic.js";

import type { DoctorCheck } from "../api/types.js";

const check = (id: string, severity: DoctorCheck["severity"]): DoctorCheck => ({
  detail: "",
  id,
  severity,
  title: id
});

describe("severityTone", () => {
  it("maps ok/warn/error onto badge tones", () => {
    expect(severityTone("ok")).toBe("ok");
    expect(severityTone("warn")).toBe("warn");
    expect(severityTone("error")).toBe("err");
  });
});

describe("worstSeverity", () => {
  it("error dominates, then warn, then ok", () => {
    expect(worstSeverity([check("a", "ok"), check("b", "error"), check("c", "warn")])).toBe("error");
    expect(worstSeverity([check("a", "ok"), check("b", "warn")])).toBe("warn");
    expect(worstSeverity([check("a", "ok")])).toBe("ok");
    expect(worstSeverity([])).toBe("ok");
  });
});

describe("sortChecks", () => {
  it("orders errors → warnings → ok, keeping relative order within a tier", () => {
    const sorted = sortChecks([check("ok1", "ok"), check("w1", "warn"), check("e1", "error"), check("w2", "warn")]);
    expect(sorted.map((c) => c.id)).toEqual(["e1", "w1", "w2", "ok1"]);
  });
});
