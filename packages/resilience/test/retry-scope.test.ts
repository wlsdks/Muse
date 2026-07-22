import { describe, expect, it } from "vitest";

import {
  createRetryBudget,
  currentRetryBudget,
  retry,
  RetryScopeEndedError,
  runWithRetryBudget,
  type RetryBudget
} from "../src/index.js";

function deferred(): { readonly promise: Promise<void>; resolve(): void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("runWithRetryBudget", () => {
  it("exposes one scoped facade through awaits and charges the underlying ledger", async () => {
    const raw = createRetryBudget({ maxBackoffMs: 10, maxRetries: 2 });
    let first: RetryBudget | undefined;
    let second: RetryBudget | undefined;

    await runWithRetryBudget(raw, async () => {
      first = currentRetryBudget();
      await Promise.resolve();
      second = currentRetryBudget();
      second?.reserve({ backoffMs: 3, cause: new Error("test") }).commit();
    });

    expect(first).toBe(second);
    expect(first).not.toBe(raw);
    expect(currentRetryBudget()).toBeUndefined();
    expect(raw.snapshot()).toMatchObject({ usedBackoffMs: 3, usedRetries: 1 });
    expect(first?.snapshot()).toEqual(raw.snapshot());
  });

  it("isolates concurrent scopes and restores a parent after a nested scope", async () => {
    const outerRaw = createRetryBudget({ maxBackoffMs: 10, maxRetries: 2 });
    const innerRaw = createRetryBudget({ maxBackoffMs: 10, maxRetries: 2 });
    const otherRaw = createRetryBudget({ maxBackoffMs: 10, maxRetries: 2 });
    const entered = deferred();
    const release = deferred();

    const outer = runWithRetryBudget(outerRaw, async () => {
      const outerScope = currentRetryBudget();
      await runWithRetryBudget(innerRaw, async () => {
        expect(currentRetryBudget()).not.toBe(outerScope);
        currentRetryBudget()?.reserve({ backoffMs: 2, cause: "inner" }).commit();
      });
      expect(currentRetryBudget()).toBe(outerScope);
      entered.resolve();
      await release.promise;
      currentRetryBudget()?.reserve({ backoffMs: 1, cause: "outer" }).commit();
    });

    await entered.promise;
    await runWithRetryBudget(otherRaw, async () => {
      currentRetryBudget()?.reserve({ backoffMs: 4, cause: "other" }).commit();
    });
    release.resolve();
    await outer;

    expect(outerRaw.snapshot()).toMatchObject({ usedBackoffMs: 1, usedRetries: 1 });
    expect(innerRaw.snapshot()).toMatchObject({ usedBackoffMs: 2, usedRetries: 1 });
    expect(otherRaw.snapshot()).toMatchObject({ usedBackoffMs: 4, usedRetries: 1 });
  });

  it.each(["return", "throw"] as const)("revokes a detached pending retry after owner %s", async (mode) => {
    const raw = createRetryBudget({ maxBackoffMs: 10, maxRetries: 1 });
    const sleeping = deferred();
    const releaseSleep = deferred();
    let calls = 0;
    let detached!: Promise<string>;
    let facade!: RetryBudget;

    const owner = runWithRetryBudget(raw, async () => {
      facade = currentRetryBudget()!;
      detached = retry(
        async () => {
          calls += 1;
          if (calls === 1) throw new Error("transient");
          return "unexpected";
        },
        {
          initialDelayMs: 1,
          maxAttempts: 2,
          maxDelayMs: 1,
          sleep: async () => {
            sleeping.resolve();
            await releaseSleep.promise;
          }
        }
      );
      await sleeping.promise;
      if (mode === "throw") throw new Error("owner failed");
    });

    if (mode === "throw") {
      await expect(owner).rejects.toThrow("owner failed");
    } else {
      await owner;
    }

    expect(facade.snapshot()).toEqual(raw.snapshot());
    expect(raw.snapshot()).toMatchObject({ usedBackoffMs: 0, usedRetries: 0 });
    expect(() => facade.reserve({ backoffMs: 0, cause: "late" })).toThrow(RetryScopeEndedError);

    releaseSleep.resolve();
    await expect(detached).rejects.toBeInstanceOf(RetryScopeEndedError);
    expect(calls).toBe(1);
    expect(facade.snapshot()).toEqual(raw.snapshot());
  });
});
