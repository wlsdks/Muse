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
});
