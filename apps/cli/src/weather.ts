/**
 * `muse weather <location>` — current conditions via Open-Meteo
 * (free, no API key). Read-only world-sensing, so no outbound-safety
 * gate applies. The provider lives in @muse/mcp so the proactive
 * briefing daemon can reuse it; this file is just the CLI surface.
 */

import { OpenMeteoWeatherProvider, formatWeather, type GeocodedLocation, type CurrentWeather, type WeatherProvider } from "@muse/mcp";
import type { Command } from "commander";

import type { ProgramIO } from "./program.js";

interface WeatherOptions {
  readonly json?: boolean;
}

export function registerWeatherCommand(program: Command, io: ProgramIO, provider?: WeatherProvider): void {
  program
    .command("weather")
    .description("Show current weather for a place (Open-Meteo, free, no key)")
    .argument("<location...>", "Place name, e.g. 'Seoul' or 'San Francisco'")
    .option("--json", "Emit the resolved location + current conditions as JSON")
    .action(async (locationParts: readonly string[], options: WeatherOptions) => {
      const query = locationParts.join(" ").trim();
      if (query.length === 0) {
        io.stderr("usage: muse weather <location>\n");
        process.exitCode = 1;
        return;
      }
      const weather = provider ?? new OpenMeteoWeatherProvider(io.fetch ?? globalThis.fetch);
      let location: GeocodedLocation | undefined;
      try {
        location = await weather.geocode(query);
      } catch (cause) {
        io.stderr(`muse weather: lookup failed: ${cause instanceof Error ? cause.message : String(cause)}\n`);
        process.exitCode = 1;
        return;
      }
      if (!location) {
        io.stderr(`muse weather: could not find a place named '${query}'.\n`);
        process.exitCode = 1;
        return;
      }
      let current: CurrentWeather;
      try {
        current = await weather.currentWeather(location);
      } catch (cause) {
        io.stderr(`muse weather: forecast failed: ${cause instanceof Error ? cause.message : String(cause)}\n`);
        process.exitCode = 1;
        return;
      }
      if (options.json) {
        io.stdout(`${JSON.stringify({ current, location }, null, 2)}\n`);
        return;
      }
      io.stdout(`${formatWeather(location, current)}\n`);
    });
}
