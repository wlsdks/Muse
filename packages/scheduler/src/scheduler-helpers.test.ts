import { describe, expect, it } from "vitest";

import { SchedulerValidationError } from "./scheduler-errors.js";
import {
  defaultRetryCount,
  defaultTimezone,
  requireText,
  validateCronExpression,
  validateExecutionTimeout,
  validateJobName,
  validateRetryConfig,
  validateTimezone
} from "./scheduler-helpers.js";

describe("validateTimezone", () => {
  it("accepts a valid IANA zone", () => {
    expect(() => validateTimezone("Asia/Seoul")).not.toThrow();
    expect(() => validateTimezone("UTC")).not.toThrow();
  });
  it("throws SchedulerValidationError for an invalid zone", () => {
    expect(() => validateTimezone("Atlantis/Mu")).toThrow(SchedulerValidationError);
  });
});

describe("validateCronExpression", () => {
  it("accepts a standard 5-field cron", () => {
    expect(() => validateCronExpression("0 8 * * 1")).not.toThrow();
  });
  it("accepts a 6-field cron (with seconds)", () => {
    expect(() => validateCronExpression("0 0 8 * * 1")).not.toThrow();
  });
  it("throws for the wrong field count", () => {
    expect(() => validateCronExpression("0 8 * *")).toThrow(SchedulerValidationError);
    expect(() => validateCronExpression("0 8 * * * * *")).toThrow(SchedulerValidationError);
  });
  it("throws when cron-parser rejects the value", () => {
    expect(() => validateCronExpression("not a cron")).toThrow(SchedulerValidationError);
  });
});

describe("validateJobName", () => {
  it("accepts a non-blank name", () => {
    expect(() => validateJobName("morning-brief")).not.toThrow();
  });
  it("throws for blank / whitespace-only names", () => {
    expect(() => validateJobName("")).toThrow(SchedulerValidationError);
    expect(() => validateJobName("   ")).toThrow(SchedulerValidationError);
  });
});

describe("validateExecutionTimeout", () => {
  it("accepts undefined and 0 (disable)", () => {
    expect(() => validateExecutionTimeout(undefined)).not.toThrow();
    expect(() => validateExecutionTimeout(0)).not.toThrow();
  });
  it("accepts in-range timeouts", () => {
    expect(() => validateExecutionTimeout(1_000)).not.toThrow();
    expect(() => validateExecutionTimeout(3_600_000)).not.toThrow();
  });
  it("throws for out-of-range timeouts", () => {
    expect(() => validateExecutionTimeout(999)).toThrow(SchedulerValidationError);
    expect(() => validateExecutionTimeout(3_600_001)).toThrow(SchedulerValidationError);
  });
});

describe("validateRetryConfig", () => {
  it("accepts retryOnFailure=false regardless of maxRetryCount", () => {
    expect(() => validateRetryConfig(false, 0)).not.toThrow();
  });
  it("requires maxRetryCount >= 1 when retryOnFailure=true", () => {
    expect(() => validateRetryConfig(true, 1)).not.toThrow();
    expect(() => validateRetryConfig(true, 0)).toThrow(SchedulerValidationError);
  });
});

describe("requireText", () => {
  it("returns the trimmed text when non-blank", () => {
    expect(requireText("  hello  ", "x")).toBe("hello");
  });
  it("throws for blank / undefined / null", () => {
    expect(() => requireText(undefined, "missing")).toThrow(SchedulerValidationError);
    expect(() => requireText(null, "missing")).toThrow(SchedulerValidationError);
    expect(() => requireText("   ", "missing")).toThrow(SchedulerValidationError);
  });
});

describe("scheduler defaults", () => {
  it("defaultTimezone is UTC", () => {
    expect(defaultTimezone).toBe("UTC");
  });
  it("defaultRetryCount is 3", () => {
    expect(defaultRetryCount).toBe(3);
  });
});
