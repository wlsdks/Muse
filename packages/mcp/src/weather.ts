/**
 * Weather provider behind a model-neutral abstraction (the way
 * calendar did). Read-only world-sensing via Open-Meteo (free, no API
 * key) — `.claude/rules/outbound-safety.md` governs only actions
 * toward a third party, so weather needs no approval gate. Lives in
 * @muse/mcp so both the CLI (`muse weather`) and the proactive
 * briefing daemon can reuse it.
 */

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

export interface GeocodedLocation {
  readonly name: string;
  readonly country?: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly timezone?: string;
}

export interface CurrentWeather {
  readonly temperatureC: number;
  readonly apparentC?: number;
  readonly humidityPct?: number;
  readonly windSpeedKmh?: number;
  readonly code: number;
  readonly condition: string;
  readonly observedAtIso?: string;
  readonly timezone?: string;
}

export interface WeatherProvider {
  geocode(query: string): Promise<GeocodedLocation | undefined>;
  currentWeather(location: GeocodedLocation): Promise<CurrentWeather>;
}

// WMO weather interpretation codes (open-meteo `weather_code`). Only the
// documented buckets — an unknown code reports its number so the user
// still gets a signal rather than a silent "clear".
const WMO_WEATHER_CODES: Readonly<Record<number, string>> = {
  0: "clear sky",
  1: "mainly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "fog",
  48: "depositing rime fog",
  51: "light drizzle",
  53: "moderate drizzle",
  55: "dense drizzle",
  56: "light freezing drizzle",
  57: "dense freezing drizzle",
  61: "slight rain",
  63: "moderate rain",
  65: "heavy rain",
  66: "light freezing rain",
  67: "heavy freezing rain",
  71: "slight snow",
  73: "moderate snow",
  75: "heavy snow",
  77: "snow grains",
  80: "slight rain showers",
  81: "moderate rain showers",
  82: "violent rain showers",
  85: "slight snow showers",
  86: "heavy snow showers",
  95: "thunderstorm",
  96: "thunderstorm with slight hail",
  99: "thunderstorm with heavy hail"
};

export function describeWeatherCode(code: number): string {
  return WMO_WEATHER_CODES[code] ?? `weather code ${code.toString()}`;
}

export function formatWeather(location: GeocodedLocation, current: CurrentWeather): string {
  const place = location.country ? `${location.name}, ${location.country}` : location.name;
  const parts = [`${current.condition}, ${Math.round(current.temperatureC).toString()}°C`];
  if (typeof current.apparentC === "number") {
    parts.push(`feels ${Math.round(current.apparentC).toString()}°C`);
  }
  if (typeof current.humidityPct === "number") {
    parts.push(`humidity ${Math.round(current.humidityPct).toString()}%`);
  }
  if (typeof current.windSpeedKmh === "number") {
    parts.push(`wind ${Math.round(current.windSpeedKmh).toString()} km/h`);
  }
  return `${place}: ${parts.join(" · ")}`;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export class OpenMeteoWeatherProvider implements WeatherProvider {
  constructor(private readonly fetchImpl: typeof globalThis.fetch = globalThis.fetch) {}

  async geocode(query: string): Promise<GeocodedLocation | undefined> {
    const url = `${GEOCODE_URL}?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
    const response = await this.fetchImpl(url);
    if (!response.ok) {
      throw new Error(`geocoding failed (${response.status.toString()})`);
    }
    const body = await response.json() as { results?: Array<Record<string, unknown>> };
    const first = body.results?.[0];
    const latitude = numberOrUndefined(first?.latitude);
    const longitude = numberOrUndefined(first?.longitude);
    if (!first || latitude === undefined || longitude === undefined) {
      return undefined;
    }
    return {
      latitude,
      longitude,
      name: typeof first.name === "string" ? first.name : query,
      ...(typeof first.country === "string" ? { country: first.country } : {}),
      ...(typeof first.timezone === "string" ? { timezone: first.timezone } : {})
    };
  }

  async currentWeather(location: GeocodedLocation): Promise<CurrentWeather> {
    const params = new URLSearchParams({
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
      latitude: location.latitude.toString(),
      longitude: location.longitude.toString(),
      timezone: location.timezone ?? "auto"
    });
    const response = await this.fetchImpl(`${FORECAST_URL}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`forecast failed (${response.status.toString()})`);
    }
    const body = await response.json() as { current?: Record<string, unknown> };
    const current = body.current ?? {};
    const code = numberOrUndefined(current.weather_code) ?? 0;
    return {
      apparentC: numberOrUndefined(current.apparent_temperature),
      code,
      condition: describeWeatherCode(code),
      humidityPct: numberOrUndefined(current.relative_humidity_2m),
      observedAtIso: typeof current.time === "string" ? current.time : undefined,
      temperatureC: numberOrUndefined(current.temperature_2m) ?? 0,
      timezone: location.timezone,
      windSpeedKmh: numberOrUndefined(current.wind_speed_10m)
    };
  }
}

/**
 * Resolve a place name to a one-line current-weather string, or
 * `undefined` if the place can't be found / the lookup fails. Used by
 * the proactive briefing to ground a heads-up ("rain — leave early")
 * without throwing into the briefing path.
 */
export async function resolveWeatherLine(
  provider: WeatherProvider,
  query: string
): Promise<string | undefined> {
  try {
    const location = await provider.geocode(query);
    if (!location) {
      return undefined;
    }
    return formatWeather(location, await provider.currentWeather(location));
  } catch {
    return undefined;
  }
}
