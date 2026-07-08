import type { JsonObject } from "@muse/shared";
import type { MuseToolContext } from "@muse/tools";

import { describe, expect, it } from "vitest";

import { createWeatherTool } from "./weather-tool.js";
import { OpenMeteoWeatherProvider, type WeatherProvider } from "./weather.js";

const CTX: MuseToolContext = { runId: "test-run" };

async function run(tool: ReturnType<typeof createWeatherTool>, args: JsonObject): Promise<JsonObject> {
  return (await tool.execute(args, CTX)) as JsonObject;
}

const SEOUL_GEOCODE = { results: [{ country: "South Korea", latitude: 37.566, longitude: 126.978, name: "Seoul", timezone: "Asia/Seoul" }] };

function fakeFetch(handlers: {
  geocode?: unknown;
  forecast?: unknown;
  daily?: unknown;
  geocodeStatus?: number;
  forecastStatus?: number;
  dailyStatus?: number;
}): typeof globalThis.fetch {
  return (async (input: string | URL) => {
    const url = String(input);
    if (url.includes("geocoding-api.open-meteo.com")) {
      return new Response(JSON.stringify(handlers.geocode ?? { results: [] }), { status: handlers.geocodeStatus ?? 200 });
    }
    if (url.includes("api.open-meteo.com/v1/forecast") && url.includes("daily=")) {
      return new Response(JSON.stringify(handlers.daily ?? { daily: {} }), { status: handlers.dailyStatus ?? 200 });
    }
    if (url.includes("api.open-meteo.com/v1/forecast")) {
      return new Response(JSON.stringify(handlers.forecast ?? {}), { status: handlers.forecastStatus ?? 200 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as unknown as typeof globalThis.fetch;
}

describe("createWeatherTool definition", () => {
  it("requires `location` in the schema when no default is configured", () => {
    const tool = createWeatherTool();
    expect(tool.definition.inputSchema.required).toEqual(["location"]);
    expect(tool.definition.name).toBe("weather");
    expect(tool.definition.risk).toBe("read");
  });

  it("does not require `location` when a default is configured", () => {
    const tool = createWeatherTool({ defaultLocation: "Seoul" });
    expect(tool.definition.inputSchema.required).toBeUndefined();
    const properties = tool.definition.inputSchema.properties as Record<string, { description: string }>;
    expect(properties["location"]?.description).toContain("Seoul");
  });
});

describe("createWeatherTool current weather", () => {
  it("returns a grounded current-weather line for a real location", async () => {
    const provider = new OpenMeteoWeatherProvider(fakeFetch({
      forecast: { current: { temperature_2m: 21.6, weather_code: 2 } },
      geocode: SEOUL_GEOCODE
    }));
    const tool = createWeatherTool({ provider });
    const result = await run(tool, { location: "Seoul" });
    expect(result).toMatchObject({ found: true, location: "Seoul" });
    expect(typeof result["weather"]).toBe("string");
    expect(result["weather"]).toContain("partly cloudy");
  });

  it("falls back to the configured default location when none is passed", async () => {
    const provider = new OpenMeteoWeatherProvider(fakeFetch({
      forecast: { current: { temperature_2m: 21.6, weather_code: 0 } },
      geocode: SEOUL_GEOCODE
    }));
    const tool = createWeatherTool({ defaultLocation: "Seoul", provider });
    const result = await run(tool, {});
    expect(result).toMatchObject({ found: true, location: "Seoul" });
  });

  it("degrades cleanly with found:false when no location is given and no default is configured — never invents a place", async () => {
    const tool = createWeatherTool({ provider: new OpenMeteoWeatherProvider(fakeFetch({})) });
    const result = await run(tool, {});
    expect(result["found"]).toBe(false);
    expect(result["location"]).toBeUndefined();
    expect(typeof result["reason"]).toBe("string");
  });

  it("degrades cleanly (no throw) when geocoding finds nothing", async () => {
    const provider = new OpenMeteoWeatherProvider(fakeFetch({ geocode: { results: [] } }));
    const tool = createWeatherTool({ provider });
    const result = await run(tool, { location: "Nowhereville" });
    expect(result).toMatchObject({ found: false, location: "Nowhereville" });
    expect(result["weather"]).toBeUndefined();
  });

  it("degrades cleanly (no throw-through) on a non-200 forecast response", async () => {
    const provider = new OpenMeteoWeatherProvider(fakeFetch({ forecastStatus: 500, geocode: SEOUL_GEOCODE }));
    const tool = createWeatherTool({ provider });
    const result = await run(tool, { location: "Seoul" });
    expect(result).toMatchObject({ found: false, location: "Seoul" });
  });

  it("degrades cleanly on a malformed (schema-violating) response body rather than fabricating a value", async () => {
    const provider = new OpenMeteoWeatherProvider(fakeFetch({
      // geocode result missing latitude/longitude entirely — malformed shape.
      geocode: { results: [{ country: "Nowhere", name: "Ghost Town" }] }
    }));
    const tool = createWeatherTool({ provider });
    const result = await run(tool, { location: "Ghost Town" });
    expect(result["found"]).toBe(false);
  });
});

describe("createWeatherTool forecast (`when`)", () => {
  it("returns a forecast line for an explicit valid ISO date", async () => {
    const provider = new OpenMeteoWeatherProvider(fakeFetch({
      daily: { daily: { precipitation_probability_max: [10], temperature_2m_max: [22], temperature_2m_min: [14], time: ["2026-05-30"], weather_code: [1] } },
      geocode: SEOUL_GEOCODE
    }));
    const tool = createWeatherTool({ provider });
    const result = await run(tool, { location: "Seoul", when: "2026-05-30" });
    expect(result).toMatchObject({ date: "2026-05-30", found: true, location: "Seoul" });
    expect(typeof result["forecast"]).toBe("string");
  });

  it("rejects an impossible calendar date (Feb 30) with a clear reason, never a fabricated forecast", async () => {
    const provider = new OpenMeteoWeatherProvider(fakeFetch({ geocode: SEOUL_GEOCODE }));
    const tool = createWeatherTool({ provider });
    const result = await run(tool, { location: "Seoul", when: "2026-02-30" });
    expect(result["found"]).toBe(false);
    expect(result["forecast"]).toBeUndefined();
    expect(result["reason"]).toContain("couldn't understand the day");
  });

  it("resolves a relative phrase ('tomorrow') using the injected clock", async () => {
    const provider = new OpenMeteoWeatherProvider(fakeFetch({
      daily: { daily: { temperature_2m_max: [25], temperature_2m_min: [17], time: ["2026-05-31"], weather_code: [0] } },
      geocode: SEOUL_GEOCODE
    }));
    const tool = createWeatherTool({ now: () => new Date("2026-05-30T09:00:00Z"), provider });
    const result = await run(tool, { location: "Seoul", when: "tomorrow" });
    expect(result).toMatchObject({ date: "2026-05-31", found: true, location: "Seoul" });
  });

  it("returns found:false for an unparseable relative phrase", async () => {
    const tool = createWeatherTool({ provider: new OpenMeteoWeatherProvider(fakeFetch({ geocode: SEOUL_GEOCODE })) });
    const result = await run(tool, { location: "Seoul", when: "asdkfjhasldkfjh nonsense" });
    expect(result["found"]).toBe(false);
    expect(result["reason"]).toContain("couldn't understand the day");
  });

  it("returns found:false (not a throw) when no forecast day matches (beyond horizon / provider has none)", async () => {
    const provider = new OpenMeteoWeatherProvider(fakeFetch({
      daily: { daily: { temperature_2m_max: [25], temperature_2m_min: [17], time: ["2099-01-01"], weather_code: [0] } },
      geocode: SEOUL_GEOCODE
    }));
    const tool = createWeatherTool({ provider });
    const result = await run(tool, { location: "Seoul", when: "2026-05-30" });
    expect(result["found"]).toBe(false);
    expect(result["reason"]).toContain("no forecast");
  });

  it("returns found:false when the provider does not implement dailyForecast at all", async () => {
    const minimalProvider: WeatherProvider = {
      currentWeather: async () => ({ code: 0, condition: "clear sky", temperatureC: 20 }),
      geocode: async () => ({ latitude: 37.566, longitude: 126.978, name: "Seoul" })
    };
    const tool = createWeatherTool({ provider: minimalProvider });
    const result = await run(tool, { location: "Seoul", when: "2026-05-30" });
    expect(result["found"]).toBe(false);
    expect(result["reason"]).toContain("no forecast");
  });
});

describe("createWeatherTool mutation check (teeth)", () => {
  it("would fail if isValidCalendarDate's rollover guard were removed (Date auto-rolling Feb 30 -> Mar 2)", async () => {
    // Contract: an out-of-range calendar day must be rejected up front, not
    // silently resolved via JS Date's rollover behavior. If the source's
    // `isValidCalendarDate` check before calling resolveForecastLine were
    // deleted, "2026-02-30" would resolve to "2026-03-02" and the tool would
    // (if the provider happened to have that date) return a forecast for the
    // WRONG day instead of failing closed.
    const provider = new OpenMeteoWeatherProvider(fakeFetch({
      daily: { daily: { temperature_2m_max: [10], temperature_2m_min: [2], time: ["2026-03-02"], weather_code: [0] } },
      geocode: SEOUL_GEOCODE
    }));
    const tool = createWeatherTool({ provider });
    const result = await run(tool, { location: "Seoul", when: "2026-02-30" });
    expect(result["found"]).toBe(false);
    expect(result["date"]).toBeUndefined();
  });
});
