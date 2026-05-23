import { Command } from "commander";
import { describe, expect, it } from "vitest";

import { registerWeatherCommand } from "./weather.js";

// Routes the two open-meteo endpoints by host: geocoding vs forecast.
function fakeFetch(handlers: { geocode?: unknown; forecast?: unknown }): typeof globalThis.fetch {
  return (async (input: string | URL) => {
    const url = String(input);
    if (url.includes("geocoding-api.open-meteo.com")) {
      return new Response(JSON.stringify(handlers.geocode ?? { results: [] }), { status: 200 });
    }
    if (url.includes("api.open-meteo.com/v1/forecast")) {
      return new Response(JSON.stringify(handlers.forecast ?? {}), { status: 200 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as unknown as typeof globalThis.fetch;
}

describe("muse weather command", () => {
  function run(args: string[], fetchImpl: typeof globalThis.fetch) {
    const output: string[] = [];
    const io = { fetch: fetchImpl, stderr: (m: string) => output.push(m), stdout: (m: string) => output.push(m) };
    const program = new Command();
    program.exitOverride();
    registerWeatherCommand(program, io);
    return { output, run: program.parseAsync(["node", "muse", "weather", ...args]) };
  }

  it("seeded location → the printed answer reflects the (HTTP-faked) forecast", async () => {
    const fetchImpl = fakeFetch({
      geocode: { results: [{ country: "South Korea", latitude: 37.566, longitude: 126.978, name: "Seoul", timezone: "Asia/Seoul" }] },
      forecast: { current: { apparent_temperature: 19, relative_humidity_2m: 55, temperature_2m: 22, weather_code: 3, wind_speed_10m: 10 } }
    });
    const { output, run: done } = run(["Seoul"], fetchImpl);
    await done;
    expect(output.join("")).toContain("Seoul, South Korea: overcast, 22°C");
  });

  it("unknown place → a clear not-found error, exit 1, no forecast line", async () => {
    const prevExit = process.exitCode;
    const fetchImpl = fakeFetch({ geocode: { results: [] } });
    const { output, run: done } = run(["Xyzzyville"], fetchImpl);
    await done;
    expect(output.join("")).toContain("could not find a place named 'Xyzzyville'");
    expect(process.exitCode).toBe(1);
    process.exitCode = prevExit;
  });

  it("no location → uses MUSE_WEATHER_LOCATION (the user's home)", async () => {
    const prev = process.env.MUSE_WEATHER_LOCATION;
    process.env.MUSE_WEATHER_LOCATION = "Seoul";
    try {
      const fetchImpl = fakeFetch({
        geocode: { results: [{ country: "South Korea", latitude: 37.566, longitude: 126.978, name: "Seoul", timezone: "Asia/Seoul" }] },
        forecast: { current: { temperature_2m: 22, weather_code: 3 } }
      });
      const { output, run: done } = run([], fetchImpl);
      await done;
      expect(output.join("")).toContain("Seoul, South Korea: overcast, 22°C");
    } finally {
      if (prev === undefined) delete process.env.MUSE_WEATHER_LOCATION;
      else process.env.MUSE_WEATHER_LOCATION = prev;
    }
  });

  it("no location and no home configured → usage error, exit 1", async () => {
    const prev = process.env.MUSE_WEATHER_LOCATION;
    const prevExit = process.exitCode;
    delete process.env.MUSE_WEATHER_LOCATION;
    try {
      const { output, run: done } = run([], fakeFetch({}));
      await done;
      expect(output.join("")).toContain("set MUSE_WEATHER_LOCATION");
      expect(process.exitCode).toBe(1);
    } finally {
      if (prev !== undefined) process.env.MUSE_WEATHER_LOCATION = prev;
      process.exitCode = prevExit;
    }
  });

  it("--days N prints the multi-day daily forecast (HTTP-faked daily block)", async () => {
    const fetchImpl = fakeFetch({
      geocode: { results: [{ country: "South Korea", latitude: 37.566, longitude: 126.978, name: "Seoul", timezone: "Asia/Seoul" }] },
      forecast: {
        daily: {
          precipitation_probability_max: [5, 80],
          temperature_2m_max: [24, 19],
          temperature_2m_min: [15, 13],
          time: ["2026-05-25", "2026-05-26"],
          weather_code: [0, 61]
        }
      }
    });
    const { output, run: done } = run(["Seoul", "--days", "2"], fetchImpl);
    await done;
    const text = output.join("");
    expect(text).toContain("Seoul, South Korea — forecast:");
    expect(text).toContain("2026-05-25: clear sky, 15–24°C, rain 5%");
    expect(text).toContain("2026-05-26: slight rain, 13–19°C, rain 80%");
  });

  it("--days with a non-numeric value → usage error, exit 1", async () => {
    const prevExit = process.exitCode;
    const fetchImpl = fakeFetch({ geocode: { results: [{ latitude: 37.566, longitude: 126.978, name: "Seoul" }] } });
    const { output, run: done } = run(["Seoul", "--days", "lots"], fetchImpl);
    await done;
    expect(output.join("")).toContain("--days must be a positive number");
    expect(process.exitCode).toBe(1);
    process.exitCode = prevExit;
  });

  it("appends a rain heads-up when the hourly forecast crosses the threshold", async () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const t = new Date(now.getTime() + 2 * 3_600_000);
    const localHour = `${t.getFullYear().toString()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:00`;
    const fetchImpl = fakeFetch({
      geocode: { results: [{ country: "South Korea", latitude: 37.566, longitude: 126.978, name: "Seoul", timezone: "Asia/Seoul" }] },
      forecast: { current: { temperature_2m: 22, weather_code: 3 }, hourly: { precipitation_probability: [80], time: [localHour], weather_code: [63] } }
    });
    const { output, run: done } = run(["Seoul"], fetchImpl);
    await done;
    expect(output.join("")).toContain("rain likely");
  });
});
