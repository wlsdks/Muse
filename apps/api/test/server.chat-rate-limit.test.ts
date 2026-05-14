import { describe, expect, it } from "vitest";

import { ChatRateLimiter } from "../src/chat-rate-limiter.js";
import { buildServer } from "../src/server.js";

describe("POST /api/chat per-IP rate limit (goal 031)", () => {
  it("allows N requests then returns 429 with Retry-After once the bucket is empty", async () => {
    // 5-req cap inside a 60s window keeps the test small + deterministic.
    let frozenNow = 1_700_000_000_000;
    const limiter = new ChatRateLimiter({ capacity: 5, now: () => frozenNow, windowMs: 60_000 });
    const server = buildServer({ chatRateLimiter: limiter, logger: false });

    // First 5 → 503 because no agent runtime is wired, but they ALL pass
    // the rate-limit gate (the 429 path is what we're testing). 6th hits
    // the limiter and gets 429 + Retry-After.
    const statuses: number[] = [];
    let retryAfter: string | null = null;
    for (let i = 0; i < 6; i += 1) {
      const reply = await server.inject({
        method: "POST",
        url: "/api/chat",
        payload: { message: "hi" }
      });
      statuses.push(reply.statusCode);
      if (reply.statusCode === 429) {
        retryAfter = reply.headers["retry-after"] as string | null;
        const body = reply.json() as { error?: string; retryAfterSeconds?: number };
        expect(body.error).toMatch(/rate limit exceeded/u);
        expect(body.retryAfterSeconds).toBeGreaterThan(0);
      }
    }

    // 5 pass the rate-limit gate (status whatever — 503/200 — but NOT 429),
    // 1 hits the bucket-empty path.
    const blocked = statuses.filter((s) => s === 429).length;
    expect(blocked).toBe(1);
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThan(0);

    // After advancing time enough to refill ≥1 token, the next call
    // again passes the rate-limit gate.
    frozenNow += 60_000; // full refill window elapses
    const sixth = await server.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "hi" }
    });
    expect(sixth.statusCode).not.toBe(429);
  });

  it("applies the limit independently per IP", async () => {
    const limiter = new ChatRateLimiter({ capacity: 2, windowMs: 60_000 });
    const server = buildServer({ chatRateLimiter: limiter, logger: false });

    // Burn IP A's bucket.
    for (let i = 0; i < 3; i += 1) {
      await server.inject({
        method: "POST",
        url: "/api/chat",
        payload: { message: "x" },
        remoteAddress: "10.0.0.1"
      });
    }
    // IP A is now blocked.
    const blockedA = await server.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "x" },
      remoteAddress: "10.0.0.1"
    });
    expect(blockedA.statusCode).toBe(429);

    // IP B still has its own bucket and is not affected.
    const allowedB = await server.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "x" },
      remoteAddress: "10.0.0.2"
    });
    expect(allowedB.statusCode).not.toBe(429);
  });

  it("ChatRateLimiter.consume reports a Retry-After matching the refill rate", () => {
    const now = 0;
    const limiter = new ChatRateLimiter({ capacity: 2, now: () => now, windowMs: 60_000 });
    expect(limiter.consume("a").allowed).toBe(true);
    expect(limiter.consume("a").allowed).toBe(true);
    const denied = limiter.consume("a");
    expect(denied.allowed).toBe(false);
    // 2 tokens / 60s = 1 token every 30s — retry-after rounded up to 30.
    expect(denied.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(denied.retryAfterSeconds).toBeLessThanOrEqual(31);
  });
});
