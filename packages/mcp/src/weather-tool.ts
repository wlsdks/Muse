/**
 * `weather` agent tool — on-demand current weather + rain heads-up for
 * a place, so a `muse ask` conversation can answer "what's the weather
 * in Seoul?" / "will it rain this afternoon?". Read-only; open-meteo
 * needs no API key (zero-cost), so it's always available. Reuses
 * `resolveWeatherLine` (incl. the goal-795 rain heads-up).
 */

import type { JsonObject } from "@muse/shared";
import type { MuseTool } from "@muse/tools";

import { OpenMeteoWeatherProvider, resolveWeatherLine, type WeatherProvider } from "./weather.js";

export interface WeatherToolDeps {
  readonly provider?: WeatherProvider;
}

export function createWeatherTool(deps: WeatherToolDeps = {}): MuseTool {
  const provider = deps.provider ?? new OpenMeteoWeatherProvider();
  return {
    definition: {
      description:
        "Get the current weather (and a rain heads-up) for a place. Use when the user asks about the weather, temperature, or whether it will rain; do not use for general facts or forecasts beyond today. Read-only.",
      domain: "system",
      inputSchema: {
        additionalProperties: false,
        properties: {
          location: { description: "Place name to look up, e.g. 'Seoul' or 'London, UK'.", type: "string" }
        },
        required: ["location"],
        type: "object"
      },
      keywords: ["weather", "temperature", "rain", "forecast", "umbrella"],
      name: "weather",
      risk: "read"
    },
    execute: async (args): Promise<JsonObject> => {
      const location = typeof args["location"] === "string" ? args["location"].trim() : "";
      if (location.length === 0) {
        return { found: false, reason: "location is required (e.g. Seoul)" };
      }
      const line = await resolveWeatherLine(provider, location);
      return line
        ? { found: true, location, weather: line }
        : { found: false, location, reason: "couldn't find that location or the weather lookup failed" };
    }
  };
}
