import { describe, expect, it } from "vitest";

import { OpenMeteoWeatherProvider, fetchWithRetry, isRetriableStatus } from "../src/weather.js";

function geocodeOk(): Response {
  return new Response(JSON.stringify({ results: [{ country: "KR", latitude: 37.57, longitude: 126.98, name: "Seoul" }] }), { status: 200 });
}
function forecastOk(): Response {
  return new Response(JSON.stringify({ current: { temperature_2m: 21, weather_code: 0 } }), { status: 200 });
}
function status(code: number): Response {
  return new Response("", { status: code });
}

function sequenceFetch(factories: Array<() => Response>) {
  let index = 0;
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    const factory = factories[Math.min(index, factories.length - 1)]!;
    index += 1;
    return factory();
  }) as unknown as typeof globalThis.fetch;
  return { calls: () => calls, fetchImpl };
}

const noWait = { baseDelayMs: 0, sleep: async () => {} };

describe("isRetriableStatus", () => {
  it("treats 429 and 5xx as transient, everything else as permanent", () => {
    for (const s of [429, 500, 502, 503, 599]) {
      expect(isRetriableStatus(s), `${s}`).toBe(true);
    }
    for (const s of [200, 301, 400, 404, 418, 600]) {
      expect(isRetriableStatus(s), `${s}`).toBe(false);
    }
  });
});

describe("fetchWithRetry", () => {
  it("recovers from transient 503s and returns the eventual 200", async () => {
    const { calls, fetchImpl } = sequenceFetch([() => status(503), () => status(503), geocodeOk]);
    const response = await fetchWithRetry(fetchImpl, "https://x.test", noWait);
    expect(response.status).toBe(200);
    expect(calls()).toBe(3);
  });

  it("retries 429 (rate-limit) too", async () => {
    const { calls, fetchImpl } = sequenceFetch([() => status(429), geocodeOk]);
    const response = await fetchWithRetry(fetchImpl, "https://x.test", noWait);
    expect(response.status).toBe(200);
    expect(calls()).toBe(2);
  });

  it("fails fast on a permanent 404 — no retry", async () => {
    const { calls, fetchImpl } = sequenceFetch([() => status(404)]);
    const response = await fetchWithRetry(fetchImpl, "https://x.test", noWait);
    expect(response.status).toBe(404);
    expect(calls()).toBe(1);
  });

  it("retries a network reject, then rethrows when retries are exhausted", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      throw new Error("ECONNRESET");
    }) as unknown as typeof globalThis.fetch;
    await expect(fetchWithRetry(fetchImpl, "https://x.test", noWait)).rejects.toThrow("ECONNRESET");
    expect(calls).toBe(3); // first + 2 retries
  });

  it("aborts a hung attempt after timeoutMs and retries (host accepts but never responds)", async () => {
    let calls = 0;
    const fetchImpl = ((_url: string, init?: RequestInit) => {
      calls += 1;
      if (calls === 1) {
        // Hang: settle ONLY when the per-attempt timeout aborts us.
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason ?? new Error("aborted")), { once: true });
        });
      }
      return Promise.resolve(geocodeOk());
    }) as unknown as typeof globalThis.fetch;
    const response = await fetchWithRetry(fetchImpl, "https://x.test", { baseDelayMs: 0, sleep: async () => {}, timeoutMs: 5 });
    expect(response.status).toBe(200);
    expect(calls).toBe(2); // hung attempt aborted + retried; the retry succeeds
  });

  it("rethrows the timeout error when every attempt hangs (bounded, never infinite)", async () => {
    const fetchImpl = ((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal!.reason ?? new Error("aborted")), { once: true });
    })) as unknown as typeof globalThis.fetch;
    await expect(
      fetchWithRetry(fetchImpl, "https://x.test", { retries: 1, baseDelayMs: 0, sleep: async () => {}, timeoutMs: 5 })
    ).rejects.toThrow(/timed out after 5ms/u);
  });
});

describe("OpenMeteoWeatherProvider — transient-failure hardening (P19)", () => {
  it("geocode recovers from a transient 503 instead of crashing the lookup", async () => {
    const { calls, fetchImpl } = sequenceFetch([() => status(503), geocodeOk]);
    const provider = new OpenMeteoWeatherProvider(fetchImpl, noWait);
    const location = await provider.geocode("Seoul");
    expect(location?.name).toBe("Seoul");
    expect(calls()).toBe(2);
  });

  it("geocode still throws a clear error once transient retries are exhausted", async () => {
    const { calls, fetchImpl } = sequenceFetch([() => status(503)]);
    const provider = new OpenMeteoWeatherProvider(fetchImpl, noWait);
    await expect(provider.geocode("Seoul")).rejects.toThrow("geocoding failed (503)");
    expect(calls()).toBe(3);
  });

  it("currentWeather recovers from a transient 502", async () => {
    const { calls, fetchImpl } = sequenceFetch([() => status(502), forecastOk]);
    const provider = new OpenMeteoWeatherProvider(fetchImpl, noWait);
    const current = await provider.currentWeather({ latitude: 37.57, longitude: 126.98, name: "Seoul" });
    expect(current.temperatureC).toBe(21);
    expect(calls()).toBe(2);
  });
});
