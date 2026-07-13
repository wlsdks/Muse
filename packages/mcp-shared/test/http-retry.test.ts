import { describe, expect, it } from "vitest";

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
});
