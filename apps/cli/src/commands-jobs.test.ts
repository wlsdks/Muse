import { describe, expect, it } from "vitest";

import { JOB_STATUS_FILTER_VALUES, resolveJobStatusFilter } from "./commands-jobs.js";

describe("resolveJobStatusFilter (goal 151)", () => {
  it("returns 'all' when input is undefined or empty/whitespace", () => {
    expect(resolveJobStatusFilter(undefined)).toBe("all");
    expect(resolveJobStatusFilter("")).toBe("all");
    expect(resolveJobStatusFilter("   ")).toBe("all");
  });

  it("normalises case so RUNNING / Done / Error all resolve", () => {
    expect(resolveJobStatusFilter("RUNNING")).toBe("running");
    expect(resolveJobStatusFilter("Done")).toBe("done");
    expect(resolveJobStatusFilter("ERROR")).toBe("error");
  });

  it("returns each known filter value verbatim (lowercased)", () => {
    for (const value of JOB_STATUS_FILTER_VALUES) {
      expect(resolveJobStatusFilter(value)).toBe(value);
    }
  });

  it("returns 'invalid' for unknown values so the caller can render a typo hint", () => {
    expect(resolveJobStatusFilter("runing")).toBe("invalid");
    expect(resolveJobStatusFilter("pending")).toBe("invalid");
    expect(resolveJobStatusFilter("nonsense")).toBe("invalid");
  });

  it("treats surrounding whitespace as a non-issue", () => {
    expect(resolveJobStatusFilter("  done  ")).toBe("done");
  });
});
