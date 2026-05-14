/**
 * Per-IP token bucket for the chat endpoints (goal 031).
 *
 * Basic DoS hardening: a scripted abuser pointed at a running
 * muse-api dev server could burn the user's provider quota in
 * seconds. Caps each IP at N requests per minute (default 60).
 *
 * Implementation: in-memory `Map<ip, bucket>` with refill-on-read
 * semantics. No external dependency, no Redis. Buckets are evicted
 * when stale to keep the map bounded — a fresh IP gets a fresh
 * bucket on first request.
 *
 * Limits apply to the three chat entry points only:
 *   POST /chat, /api/chat, /chat/stream, /api/chat/stream,
 *   /api/chat/multipart
 *
 * Other routes (today / history / admin / etc.) stay unlimited —
 * personal-JARVIS use, single-user box, the chat path is the only
 * one that triggers a paid upstream call.
 */

export interface ChatRateLimiterOptions {
  /** Requests allowed per `windowMs`. Default 60. */
  readonly capacity?: number;
  /** Sliding window length in milliseconds. Default 60_000. */
  readonly windowMs?: number;
  /** Injectable clock for deterministic tests. Default `Date.now`. */
  readonly now?: () => number;
  /** When > 0, drop bucket entries older than this many ms. Default 5 min. */
  readonly evictAfterMs?: number;
}

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

export interface RateLimitVerdict {
  readonly allowed: boolean;
  /** Seconds the client should wait before retrying. Set on `allowed: false`. */
  readonly retryAfterSeconds?: number;
}

export class ChatRateLimiter {
  private readonly capacity: number;
  private readonly windowMs: number;
  private readonly evictAfterMs: number;
  private readonly now: () => number;
  private readonly buckets = new Map<string, Bucket>();

  constructor(options: ChatRateLimiterOptions = {}) {
    this.capacity = Math.max(1, options.capacity ?? 60);
    this.windowMs = Math.max(1_000, options.windowMs ?? 60_000);
    this.evictAfterMs = Math.max(this.windowMs, options.evictAfterMs ?? 5 * 60_000);
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Charge one request against the bucket for `ip`. Returns
   * `{ allowed: true }` when there was a token to spend, or
   * `{ allowed: false, retryAfterSeconds }` when the bucket is empty.
   */
  consume(ip: string): RateLimitVerdict {
    const now = this.now();
    this.evictStale(now);
    const existing = this.buckets.get(ip);
    if (!existing) {
      this.buckets.set(ip, { lastRefillMs: now, tokens: this.capacity - 1 });
      return { allowed: true };
    }
    // Refill: tokens regenerate linearly at capacity per windowMs.
    const elapsed = now - existing.lastRefillMs;
    if (elapsed > 0) {
      const refill = (elapsed / this.windowMs) * this.capacity;
      existing.tokens = Math.min(this.capacity, existing.tokens + refill);
      existing.lastRefillMs = now;
    }
    if (existing.tokens >= 1) {
      existing.tokens -= 1;
      return { allowed: true };
    }
    // Out of tokens. Compute the wait for the next whole token.
    const msUntilOne = ((1 - existing.tokens) * this.windowMs) / this.capacity;
    const retryAfterSeconds = Math.max(1, Math.ceil(msUntilOne / 1_000));
    return { allowed: false, retryAfterSeconds };
  }

  /** Test/admin: drop every bucket. */
  reset(): void {
    this.buckets.clear();
  }

  private evictStale(now: number): void {
    for (const [ip, bucket] of this.buckets) {
      if (now - bucket.lastRefillMs > this.evictAfterMs) {
        this.buckets.delete(ip);
      }
    }
  }
}

/**
 * Extract a client identifier from a Fastify request. Prefers
 * `request.ip` (Fastify's built-in, already honours trust-proxy
 * settings); falls back to `unknown` so a malformed request still
 * gets some bucket (rather than bypassing the limit by sending
 * a header that confuses ip extraction).
 */
export function clientKeyFromRequest(request: { ip?: string }): string {
  const ip = typeof request.ip === "string" && request.ip.length > 0 ? request.ip : undefined;
  return ip ?? "unknown";
}
