import { describe, expect, it } from "vitest";
import type { ModelProvider, ModelRequest, ModelResponse } from "@muse/model";
import {
  CircuitBreakerOpenError,
  CircuitBreakerRegistry,
  DefaultCircuitBreaker,
  ModelFallbackStrategy,
  NoOpFallbackStrategy,
  RetryExhaustedError,
  TimeoutError,
  computeRetryDelay,
  retry,
  withTimeout
} from "../src/index.js";

describe("DefaultCircuitBreaker", () => {
  it("opens after consecutive failures and rejects calls until reset timeout", async () => {
    let now = 1_000;
    const breaker = new DefaultCircuitBreaker({
      failureThreshold: 2,
      name: "llm",
      now: () => now,
      resetTimeoutMs: 5_000
    });

    await expect(breaker.execute(() => Promise.reject(new Error("first")))).rejects.toThrow("first");
    expect(breaker.state()).toBe("closed");

    await expect(breaker.execute(() => Promise.reject(new Error("second")))).rejects.toThrow("second");
    expect(breaker.state()).toBe("open");
    await expect(breaker.execute(() => "not called")).rejects.toBeInstanceOf(CircuitBreakerOpenError);

    now += 5_000;
    expect(breaker.state()).toBe("half_open");
  });

  it("closes after a successful half-open trial and resets failure count on success", async () => {
    let now = 0;
    const breaker = new DefaultCircuitBreaker({
      failureThreshold: 2,
      now: () => now,
      resetTimeoutMs: 100
    });

    await breaker.execute(() => "ok");
    await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    await breaker.execute(() => "recovered before threshold");
    await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    expect(breaker.state()).toBe("closed");

    await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow("fail");
    expect(breaker.state()).toBe("open");

    now += 100;
    await expect(breaker.execute(() => "trial")).resolves.toBe("trial");
    expect(breaker.state()).toBe("closed");
    expect(breaker.metrics().failureCount).toBe(0);
  });

  it("does not count abort-like errors as circuit failures", async () => {
    const breaker = new DefaultCircuitBreaker({ failureThreshold: 1 });
    const abort = new Error("cancelled");
    abort.name = "AbortError";

    await expect(breaker.execute(() => Promise.reject(abort))).rejects.toThrow("cancelled");

    expect(breaker.state()).toBe("closed");
    expect(breaker.metrics().failureCount).toBe(0);
  });

  it("records state transitions through the metrics recorder", async () => {
    const transitions: string[] = [];
    let now = 0;
    const breaker = new DefaultCircuitBreaker({
      failureThreshold: 1,
      metricsRecorder: {
        recordCircuitBreakerStateChange: (name, from, to) => transitions.push(`${name}:${from}->${to}`)
      },
      name: "mcp:search",
      now: () => now,
      resetTimeoutMs: 1
    });

    await expect(breaker.execute(() => Promise.reject(new Error("down")))).rejects.toThrow("down");
    now += 1;
    expect(breaker.state()).toBe("half_open");

    expect(transitions).toEqual(["mcp:search:closed->open", "mcp:search:open->half_open"]);
  });
});

describe("CircuitBreakerRegistry", () => {
  it("creates isolated named breakers and evicts by least recent access", () => {
    const registry = new CircuitBreakerRegistry({ maxBreakers: 2 });

    const first = registry.get("llm");
    registry.get("mcp");
    registry.get("llm");
    registry.get("rag");

    expect(registry.getIfExists("llm")).toBe(first);
    expect(registry.getIfExists("mcp")).toBeUndefined();
    expect(registry.names()).toEqual(["llm", "rag"]);
  });
});

describe("retry and timeout", () => {
  it("retries retryable failures with deterministic backoff", async () => {
    const sleeps: number[] = [];
    let attempts = 0;

    const value = await retry(
      () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error("temporary");
        }
        return "ok";
      },
      {
        initialDelayMs: 10,
        maxAttempts: 3,
        multiplier: 3,
        sleep: async (ms) => {
          sleeps.push(ms);
        }
      }
    );

    expect(value).toBe("ok");
    expect(sleeps).toEqual([10, 30]);
  });

  it("throws RetryExhaustedError when attempts are exhausted", async () => {
    await expect(retry(() => Promise.reject(new Error("down")), { maxAttempts: 2, sleep: async () => {} }))
      .rejects.toBeInstanceOf(RetryExhaustedError);
  });

  it("aborts operations that exceed the timeout", async () => {
    await expect(withTimeout(() => new Promise((resolve) => setTimeout(resolve, 20)), 1))
      .rejects.toBeInstanceOf(TimeoutError);
  });

  it("computes bounded retry delays", () => {
    expect(computeRetryDelay(3, { initialDelayMs: 100, maxDelayMs: 250, multiplier: 2 })).toBe(250);
  });
});

describe("fallback strategies", () => {
  it("returns undefined for no-op fallback", async () => {
    await expect(new NoOpFallbackStrategy().execute({ messages: [] }, new Error("down"))).resolves.toBeUndefined();
  });

  it("tries fallback models in order until one returns non-blank output", async () => {
    const attempts: string[] = [];
    const provider = createProvider("openai", async (request) => {
      attempts.push(request.model);
      return {
        id: `response-${request.model}`,
        model: request.model,
        output: request.model === "backup" ? "fallback answer" : ""
      };
    });
    const strategy = new ModelFallbackStrategy({
      fallbackModels: ["openai/empty", "openai/backup"],
      providers: [provider]
    });

    const response = await strategy.execute({ messages: [{ content: "hello", role: "user" }] }, new Error("down"));

    expect(response?.output).toBe("fallback answer");
    expect(attempts).toEqual(["empty", "backup"]);
  });
});

function createProvider(
  id: string,
  generate: (request: ModelRequest) => Promise<ModelResponse>
): ModelProvider {
  return {
    generate,
    id,
    listModels: async () => [],
    stream: async function* () {}
  };
}
