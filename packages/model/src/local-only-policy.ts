/**
 * Deterministic local-only / no-cloud-egress policy. When the user runs
 * Muse for privacy/security on local open-source models only, this is
 * the fail-close gate: it classifies a resolved model target as `local`
 * (never leaves the user's machine) or `cloud` (reaches a third-party
 * LLM API), so the runtime can refuse to start against a cloud provider
 * — deterministic code, never a prompt instruction.
 */

export type ProviderLocality = "local" | "cloud";

const LOCAL_ONLY_TRUE_VALUES: ReadonlySet<string> = new Set(["true", "1", "yes", "on"]);
const LOCAL_ONLY_OLLAMA_DEFAULT_BASE_URL = "http://127.0.0.1:11434/v1";

/**
 * Provider ids whose traffic stays on the user's own machine — local
 * inference servers. A remote *host* for one of these is still off-box
 * egress, so the base URL is checked below; the id alone is not enough.
 */
const LOCAL_INFERENCE_PROVIDER_IDS: ReadonlySet<string> = new Set(["ollama", "lmstudio", "diagnostic"]);

/**
 * Provider ids that ALWAYS reach a third-party cloud LLM API. `codex` shells to
 * the official codex CLI which egresses to OpenAI via the user's ChatGPT
 * subscription — cloud regardless of any base URL, so it is fail-closed under
 * `MUSE_LOCAL_ONLY=true` before the adapter is constructed.
 */
const CLOUD_PROVIDER_IDS: ReadonlySet<string> = new Set(["openai", "anthropic", "gemini", "openrouter", "codex"]);

/**
 * True when `raw` points at the local loopback interface (localhost,
 * 127.0.0.0/8, ::1, or a `.localhost` name). A bare host with no scheme
 * is tolerated. Anything unparseable or off-box is NOT loopback.
 */
export function isLoopbackUrl(raw: string | undefined): boolean {
  const value = raw?.trim();
  if (!value) {
    return false;
  }
  // A bare `localhost:11434` parses with "localhost" as the SCHEME (empty
  // host), so only treat the string as already-schemed when it has `://`;
  // otherwise give it an http scheme so the host is parsed correctly.
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//iu.test(value) ? value : `http://${value}`;
  let host: string;
  try {
    host = new URL(withScheme).hostname;
  } catch {
    return false;
  }
  const hostname = host.replace(/^\[/u, "").replace(/\]$/u, "").toLowerCase();
  return hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname === "::1"
    || isIpv4Loopback(hostname);
}

/** `MUSE_LOCAL_ONLY` is enabled only by its established explicit truthy spellings. */
export function isLocalOnlyEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  const raw = env["MUSE_LOCAL_ONLY"];
  return raw !== undefined && LOCAL_ONLY_TRUE_VALUES.has(raw.trim().toLowerCase());
}

/**
 * Produces the endpoint an actual local-only model transport may use. This is
 * intentionally narrower than `isLoopbackUrl`: `.localhost`, TLS localhost,
 * wildcard binds, userinfo, and every non-numeric hostname are refused instead
 * of being classified then handed back to a resolver on the fetch path.
 */
export function canonicalizeLocalOnlyModelBaseUrl(providerId: string, rawBaseUrl: string | undefined): string | undefined {
  if (rawBaseUrl === undefined || rawBaseUrl.trim().length === 0) {
    return providerId.trim().toLowerCase() === "ollama" ? LOCAL_ONLY_OLLAMA_DEFAULT_BASE_URL : undefined;
  }

  const original = rawBaseUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(original);
  } catch {
    throw new LocalOnlyViolationError(providerId, original);
  }
  if (
    parsed.protocol !== "http:"
    || parsed.username.length > 0
    || parsed.password.length > 0
    || parsed.search.length > 0
    || parsed.hash.length > 0
  ) {
    throw new LocalOnlyViolationError(providerId, original);
  }

  const hostname = parsed.hostname.replace(/^\[/u, "").replace(/\]$/u, "").toLowerCase();
  if (hostname === "localhost") {
    parsed.hostname = "127.0.0.1";
  } else if (!isIpv4Loopback(hostname) && hostname !== "::1") {
    throw new LocalOnlyViolationError(providerId, original);
  }

  return parsed.toString().replace(/\/$/u, "");
}

function isIpv4Loopback(hostname: string): boolean {
  const parts = hostname.split(".");
  return parts.length === 4
    && parts.every((part) => /^\d{1,3}$/u.test(part))
    && parts.every((part) => Number(part) >= 0 && Number(part) <= 255)
    && Number(parts[0]) === 127;
}

/**
 * Classify a resolved model target. `effectiveBaseUrl` is the base URL
 * the provider will actually use (an Ollama default of undefined means
 * its built-in 127.0.0.1, i.e. local). Cloud-id providers are cloud
 * regardless of base URL; local-inference ids are local only when their
 * host is loopback; anything else (openai-compatible / unknown) is
 * local only when pointed at a loopback host.
 */
export function classifyProviderLocality(providerId: string, effectiveBaseUrl: string | undefined): ProviderLocality {
  const id = providerId.trim().toLowerCase();
  if (CLOUD_PROVIDER_IDS.has(id)) {
    return "cloud";
  }
  if (LOCAL_INFERENCE_PROVIDER_IDS.has(id)) {
    return effectiveBaseUrl === undefined || isLoopbackUrl(effectiveBaseUrl) ? "local" : "cloud";
  }
  return isLoopbackUrl(effectiveBaseUrl) ? "local" : "cloud";
}

/**
 * Thrown at runtime assembly when `MUSE_LOCAL_ONLY` is on but the
 * selected model would reach a cloud provider. A LOUD failure on
 * purpose: silently disabling the runtime would hide a privacy
 * violation the user explicitly asked to be protected from.
 */
export class LocalOnlyViolationError extends Error {
  readonly code = "LOCAL_ONLY_VIOLATION";
  readonly providerId: string;
  readonly baseUrl: string | undefined;

  constructor(providerId: string, baseUrl?: string) {
    super(
      `Muse's local-only model posture is enforced here in code, `
      + `but the selected model endpoint targets the cloud provider `
      + `'${providerId}'${baseUrl ? ` (${baseUrl})` : ""}. `
      + `Point Muse at a local model (e.g. MUSE_MODEL=ollama/qwen3:8b, or a localhost `
      + `OpenAI-compatible MUSE_MODEL_BASE_URL) — or set MUSE_LOCAL_ONLY=false to use the `
      + `cloud provider, which permits cloud model egress.`
    );
    this.name = "LocalOnlyViolationError";
    this.providerId = providerId;
    this.baseUrl = baseUrl;
  }
}
