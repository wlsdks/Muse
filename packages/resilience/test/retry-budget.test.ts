import { describe, expect, it, vi } from "vitest";

import {
  createRetryBudget,
  normalizeRetryBudgetPolicy,
  retry,
  RetryBudgetExhaustedError
} from "../src/index.js";

describe("RetryBudget", () => {
  it("allows exact equality and rejects the next retry without changing the snapshot", () => {
    const budget = createRetryBudget({ maxBackoffMs: 10, maxRetries: 2 });
    budget.reserve({ backoffMs: 4, cause: new Error("first") }).commit();
    budget.reserve({ backoffMs: 6, cause: new Error("second") }).commit();
    expect(budget.snapshot()).toMatchObject({ usedBackoffMs: 10, usedRetries: 2 });
    expect(() => budget.reserve({ backoffMs: 0, cause: new Error("payload-canary") }))
      .toThrowError(RetryBudgetExhaustedError);
    expect(budget.snapshot()).toMatchObject({ usedBackoffMs: 10, usedRetries: 2 });
  });

  it("refunds a provisional reservation exactly once", () => {
    const budget = createRetryBudget({ maxBackoffMs: 10, maxRetries: 2 });
    const reservation = budget.reserve({ backoffMs: 7, cause: new Error("temporary") });
    reservation.cancel();
    reservation.cancel();
    reservation.commit();
    expect(budget.snapshot()).toMatchObject({ usedBackoffMs: 0, usedRetries: 0 });
  });

  it("normalizes every invalid or oversized direct policy field to the safe default", () => {
    for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 1_000_000]) {
      expect(normalizeRetryBudgetPolicy({ maxBackoffMs: value, maxRetries: value }))
        .toEqual({ maxBackoffMs: 30_000, maxRetries: 6 });
    }
  });

  it("refunds an abort during backoff and starts no retry", async () => {
    const controller = new AbortController();
    const budget = createRetryBudget({ maxBackoffMs: 10, maxRetries: 1 });
    let attempts = 0;
    const sleeping = vi.fn(async () => new Promise<void>(() => {}));
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const promise = retry(() => {
      attempts += 1;
      throw new Error("payload-canary");
    }, { budget, initialDelayMs: 5, maxAttempts: 2, retryable: () => true, signal: controller.signal, sleep: sleeping });
    await vi.waitFor(() => expect(sleeping).toHaveBeenCalledOnce());
    controller.abort(new Error("owner cancelled"));
    await expect(promise).rejects.toThrow("owner cancelled");
    expect(attempts).toBe(1);
    expect(budget.snapshot()).toMatchObject({ usedBackoffMs: 0, usedRetries: 0 });
    expect(add).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("preserves a pre-aborted custom reason without starting or charging an attempt", async () => {
    const controller = new AbortController();
    controller.abort("custom-stop");
    const budget = createRetryBudget({ maxBackoffMs: 10, maxRetries: 1 });
    let attempts = 0;
    await expect(retry(() => { attempts += 1; return "no"; }, { budget, signal: controller.signal }))
      .rejects.toBe("custom-stop");
    expect(attempts).toBe(0);
    expect(budget.snapshot()).toMatchObject({ usedBackoffMs: 0, usedRetries: 0 });
  });

  it("serializes no raw cause payload on exhaustion", () => {
    const budget = createRetryBudget({ maxBackoffMs: 1, maxRetries: 1 });
    budget.reserve({ backoffMs: 1, cause: new Error("first") }).commit();
    let caught: unknown;
    try {
      budget.reserve({ backoffMs: 0, cause: new Error("secret-payload-canary") });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RetryBudgetExhaustedError);
    expect(JSON.stringify(caught)).not.toContain("secret-payload-canary");
    expect(Object.keys(caught as object).sort()).toEqual([
      "maxBackoffMs", "maxRetries", "reason", "requestedBackoffMs", "usedBackoffMs", "usedRetries"
    ]);
    expect((caught as Error).message).toBe("Run retry budget exhausted");
  });
});
