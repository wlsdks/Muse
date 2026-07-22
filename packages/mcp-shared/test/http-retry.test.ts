import { describe, expect, it } from "vitest";
import {
  createRetryBudget,
  RetryBudgetExhaustedError,
  RetryScopeEndedError,
  runWithRetryBudget,
  type RetryBudget
} from "@muse/resilience";

import { fetchWithRetry } from "../src/http-retry.js";

describe("fetchWithRetry beforeAttempt boundary", () => {
  it("keeps the default no-hook path compatible", async () => {
    let calls = 0;
    const response = await fetchWithRetry(
      (async () => { calls += 1; return new Response("ok", { status: 200 }); }) as typeof globalThis.fetch,
      "https://example.test/default",
      { retries: 2 }
    );
    expect(response.status).toBe(200);
    expect(calls).toBe(1);
  });

  it("runs the optional guard exactly once before each physical retry", async () => {
    const events: string[] = [];
    let calls = 0;
    const response = await fetchWithRetry(
      (async () => {
        calls += 1;
        events.push(`fetch:${calls.toString()}`);
        return new Response(calls === 1 ? "busy" : "ok", { status: calls === 1 ? 503 : 200 });
      }) as typeof globalThis.fetch,
      "https://example.test/retry",
      {
        baseDelayMs: 0,
        beforeAttempt: ({ attempt, url }) => { events.push(`guard:${attempt.toString()}:${url}`); },
        retries: 1,
        sleep: async () => {}
      }
    );

    expect(response.status).toBe(200);
    expect(events).toEqual([
      "guard:0:https://example.test/retry",
      "fetch:1",
      "guard:1:https://example.test/retry",
      "fetch:2"
    ]);
  });

  it("does not retry a network rejection when retryOnNetworkError is false", async () => {
    const networkFailure = new Error("network down");
    let calls = 0;
    await expect(fetchWithRetry(
      (async () => {
        calls += 1;
        throw networkFailure;
      }) as typeof globalThis.fetch,
      "https://example.test/no-network-retry",
      { baseDelayMs: 0, retries: 2, retryOnNetworkError: false, sleep: async () => {} }
    )).rejects.toBe(networkFailure);
    expect(calls).toBe(1);
  });

  it("normalizes adapter AbortError rejections caused by its timeout signal", async () => {
    const fetchImpl = ((_url: string, init?: RequestInit) => {
      const pending = Promise.withResolvers<Response>();
      init?.signal?.addEventListener("abort", () => {
        pending.reject(new DOMException("aborted", "AbortError"));
      }, { once: true });
      return pending.promise;
    }) as typeof globalThis.fetch;

    await expect(fetchWithRetry(fetchImpl, "https://example.test/hung", {
      retries: 0,
      timeoutMs: 5
    })).rejects.toThrow(/request https:\/\/example\.test\/hung timed out after 5ms/u);
  });

  it("propagates a beforeAttempt failure without a later fetch, retry, or wrapper", async () => {
    const guardFailure = new Error("blocked by test guard");
    let fetches = 0;
    let sleeps = 0;
    await expect(fetchWithRetry(
      (async () => {
        fetches += 1;
        return new Response("unexpected");
      }) as typeof globalThis.fetch,
      "https://example.test/blocked",
      {
        beforeAttempt: () => { throw guardFailure; },
        retries: 2,
        sleep: async () => { sleeps += 1; }
      }
    )).rejects.toBe(guardFailure);
    expect(fetches).toBe(0);
    expect(sleeps).toBe(0);
  });

  it("never issues a request for a pre-cancelled caller", async () => {
    const controller = new AbortController();
    const cancellation = new Error("cancelled by caller");
    controller.abort(cancellation);
    let calls = 0;

    await expect(fetchWithRetry(
      (async () => {
        calls += 1;
        return new Response("unexpected");
      }) as typeof globalThis.fetch,
      "https://example.test/cancelled-before-request",
      { init: { signal: controller.signal }, retries: 2 }
    )).rejects.toBe(cancellation);

    expect(calls).toBe(0);
  });

  it("stops during retry backoff when the caller cancels", async () => {
    const controller = new AbortController();
    const cancellation = new Error("cancelled during backoff");
    let calls = 0;

    await expect(fetchWithRetry(
      (async () => {
        calls += 1;
        return new Response("busy", { status: 503 });
      }) as typeof globalThis.fetch,
      "https://example.test/cancelled-during-backoff",
      {
        init: { signal: controller.signal },
        retries: 2,
        sleep: async () => {
          controller.abort(cancellation);
          await new Promise<void>(() => {});
        }
      }
    )).rejects.toBe(cancellation);

    expect(calls).toBe(1);
  });

  it("caps an excessive retry count at the documented request budget", async () => {
    let calls = 0;
    const response = await fetchWithRetry(
      (async () => {
        calls += 1;
        return new Response("busy", { status: 503 });
      }) as typeof globalThis.fetch,
      "https://example.test/retry-budget",
      { retries: 1_000, sleep: async () => {} }
    );

    expect(response.status).toBe(503);
    expect(calls).toBe(11);
  });
});

describe("fetchWithRetry run retry admission", () => {
  it("charges only an admitted extra physical attempt", async () => {
    const budget = createRetryBudget({ maxBackoffMs: 10, maxRetries: 1 });
    let calls = 0;
    const response = await fetchWithRetry(
      (async () => {
        calls += 1;
        return new Response(calls === 1 ? "busy" : "ok", { status: calls === 1 ? 503 : 200 });
      }) as typeof globalThis.fetch,
      "https://private.example.test/not-in-budget-cause",
      { baseDelayMs: 3, budget, retries: 1, sleep: async () => {} }
    );

    expect(response.status).toBe(200);
    expect(calls).toBe(2);
    expect(budget.snapshot()).toMatchObject({ usedBackoffMs: 3, usedRetries: 1 });
  });

  it("charges a 429 retry with the server-clamped wait", async () => {
    const budget = createRetryBudget({ maxBackoffMs: 2_000, maxRetries: 1 });
    let calls = 0;
    const response = await fetchWithRetry(
      (async () => {
        calls += 1;
        return calls === 1
          ? new Response("rate limited", { headers: { "retry-after": "9" }, status: 429 })
          : new Response("ok", { status: 200 });
      }) as typeof globalThis.fetch,
      "https://example.test/rate-limited",
      { budget, maxRetryAfterMs: 1_500, retries: 1, sleep: async () => {} }
    );

    expect(response.status).toBe(200);
    expect(calls).toBe(2);
    expect(budget.snapshot()).toMatchObject({ usedBackoffMs: 1_500, usedRetries: 1 });
  });

  it("charges a retryable network rejection exactly once", async () => {
    const budget = createRetryBudget({ maxBackoffMs: 10, maxRetries: 1 });
    let calls = 0;
    const response = await fetchWithRetry(
      (async () => {
        calls += 1;
        if (calls === 1) throw new TypeError("socket reset");
        return new Response("ok", { status: 200 });
      }) as typeof globalThis.fetch,
      "https://example.test/network-retry",
      { baseDelayMs: 4, budget, retries: 1, sleep: async () => {} }
    );

    expect(response.status).toBe(200);
    expect(calls).toBe(2);
    expect(budget.snapshot()).toMatchObject({ usedBackoffMs: 4, usedRetries: 1 });
  });

  it.each([
    ["success", new Response("ok", { status: 200 })],
    ["permanent", new Response("bad", { status: 400 })]
  ] as const)("does not charge a %s first attempt", async (_name, response) => {
    const budget = createRetryBudget({ maxBackoffMs: 10, maxRetries: 1 });
    await fetchWithRetry((async () => response) as typeof globalThis.fetch, "https://example.test/once", {
      budget,
      retries: 1
    });
    expect(budget.snapshot()).toMatchObject({ usedBackoffMs: 0, usedRetries: 0 });
  });

  it("fails before sleep and another fetch when the ledger is exhausted", async () => {
    const budget = createRetryBudget({ maxBackoffMs: 10, maxRetries: 1 });
    budget.reserve({ backoffMs: 0, cause: "already-used" }).commit();
    let calls = 0;
    let sleeps = 0;

    await expect(fetchWithRetry(
      (async () => {
        calls += 1;
        return new Response("busy", { status: 503 });
      }) as typeof globalThis.fetch,
      "https://example.test/exhausted",
      { budget, retries: 2, sleep: async () => { sleeps += 1; } }
    )).rejects.toBeInstanceOf(RetryBudgetExhaustedError);

    expect(calls).toBe(1);
    expect(sleeps).toBe(0);
  });

  it.each(["guard", "abort"] as const)("rolls a pending reservation back on post-wait %s", async (mode) => {
    const budget = createRetryBudget({ maxBackoffMs: 10, maxRetries: 1 });
    const controller = new AbortController();
    const terminal = new Error(`terminal-${mode}`);
    let calls = 0;

    await expect(fetchWithRetry(
      (async () => {
        calls += 1;
        return new Response("busy", { status: 503 });
      }) as typeof globalThis.fetch,
      "https://example.test/post-wait",
      {
        baseDelayMs: 1,
        beforeAttempt: ({ attempt }) => {
          if (attempt !== 1) return;
          if (mode === "abort") {
            controller.abort(terminal);
            return;
          }
          throw terminal;
        },
        budget,
        init: { signal: controller.signal },
        retries: 1,
        sleep: async () => {}
      }
    )).rejects.toBe(terminal);

    expect(calls).toBe(1);
    expect(budget.snapshot()).toMatchObject({ usedBackoffMs: 0, usedRetries: 0 });
  });

  it("uses fixed categorical reserve causes and never request/error content", async () => {
    const raw = createRetryBudget({ maxBackoffMs: 10, maxRetries: 2 });
    const causes: unknown[] = [];
    const budget: RetryBudget = {
      reserve(input) {
        causes.push(input.cause);
        return raw.reserve(input);
      },
      snapshot: () => raw.snapshot()
    };
    let calls = 0;
    const secretError = new Error("adapter leaked https://secret.test/token");

    await fetchWithRetry(
      (async () => {
        calls += 1;
        if (calls === 1) throw secretError;
        return new Response("ok");
      }) as typeof globalThis.fetch,
      "https://secret.test/token",
      { baseDelayMs: 0, budget, retries: 1, sleep: async () => {} }
    );

    expect(causes).toEqual(["transient_http_network"]);
  });

  it("prefers an explicit budget over an ambient scope", async () => {
    const ambient = createRetryBudget({ maxBackoffMs: 10, maxRetries: 1 });
    ambient.reserve({ backoffMs: 0, cause: "occupied" }).commit();
    const explicit = createRetryBudget({ maxBackoffMs: 10, maxRetries: 1 });
    let calls = 0;

    await runWithRetryBudget(ambient, () => fetchWithRetry(
      (async () => {
        calls += 1;
        return new Response(calls === 1 ? "busy" : "ok", { status: calls === 1 ? 503 : 200 });
      }) as typeof globalThis.fetch,
      "https://example.test/override",
      { baseDelayMs: 1, budget: explicit, retries: 1, sleep: async () => {} }
    ));

    expect(ambient.snapshot()).toMatchObject({ usedRetries: 1 });
    expect(explicit.snapshot()).toMatchObject({ usedBackoffMs: 1, usedRetries: 1 });
  });

  it("revokes an already-sleeping detached HTTP retry when its owner settles", async () => {
    const budget = createRetryBudget({ maxBackoffMs: 10, maxRetries: 1 });
    const sleeping = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let calls = 0;
    let detached!: Promise<Response>;

    await runWithRetryBudget(budget, async () => {
      detached = fetchWithRetry(
        (async () => {
          calls += 1;
          return new Response("busy", { status: 503 });
        }) as typeof globalThis.fetch,
        "https://example.test/detached",
        {
          baseDelayMs: 1,
          retries: 1,
          sleep: async () => {
            sleeping.resolve();
            await release.promise;
          }
        }
      );
      await sleeping.promise;
    });

    expect(budget.snapshot()).toMatchObject({ usedBackoffMs: 0, usedRetries: 0 });
    release.resolve();
    await expect(detached).rejects.toBeInstanceOf(RetryScopeEndedError);
    expect(calls).toBe(1);
  });
});
