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

export interface RetryOptions {
  /** Extra attempts after the first. Default 2 (so up to 3 calls). */
  readonly retries?: number;
  /** First backoff in ms; doubles each retry. Default 250. */
  readonly baseDelayMs?: number;
  /** Injectable delay so tests don't wait on real timers. */
  readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * Transient HTTP failures worth retrying: 429 (rate-limit) and any
 * 5xx. A 4xx other than 429 is a permanent client error — retrying it
 * just wastes the window, so fail fast.
 */
export function isRetriableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

/**
 * `fetch` with retry-with-backoff for transient failures (429 / 5xx /
 * network reject). Permanent responses (2xx, or a non-429 4xx) return
 * immediately; the last attempt's response/error is handed back so the
 * caller's own status handling still runs. Keeps a read-only world
 * sense (weather) from crashing the briefing on a blip.
 */
export async function fetchWithRetry(
  fetchImpl: typeof globalThis.fetch,
  url: string,
  options: RetryOptions = {}
): Promise<Response> {
  const retries = Number.isFinite(options.retries) ? Math.max(0, Math.trunc(options.retries as number)) : 2;
  const baseDelayMs = Number.isFinite(options.baseDelayMs) ? Math.max(0, options.baseDelayMs as number) : 250;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(url);
      if (response.ok || !isRetriableStatus(response.status) || attempt === retries) {
        return response;
      }
    } catch (cause) {
      lastError = cause;
      if (attempt === retries) {
        throw cause;
      }
    }
    await sleep(baseDelayMs * 2 ** attempt);
  }
  throw lastError ?? new Error("fetchWithRetry: retries exhausted");
}

export class OpenMeteoWeatherProvider implements WeatherProvider {
  constructor(
    private readonly fetchImpl: typeof globalThis.fetch = globalThis.fetch,
    private readonly retryOptions: RetryOptions = {}
  ) {}

  async geocode(query: string): Promise<GeocodedLocation | undefined> {
    const url = `${GEOCODE_URL}?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
    const response = await fetchWithRetry(this.fetchImpl, url, this.retryOptions);
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
    const response = await fetchWithRetry(this.fetchImpl, `${FORECAST_URL}?${params.toString()}`, this.retryOptions);
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
