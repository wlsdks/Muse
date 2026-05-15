/**
 * Pure environment-string parsers used across the autoconfigure
 * package. Lifted out of `index.ts` so internal modules
 * (`response-filters.ts`, `autoconfigure-model-provider.ts`) can
 * import them without a circular dependency on the runtime-assembly
 * factory. The four parsers that were previously exported from
 * `index.ts` are re-exported there, so external callers see no
 * surface change.
 *
 * Each parser takes `string | undefined` (the env-var shape) and a
 * fallback or default behavior. None throws — invalid input maps to
 * the fallback, so a typo'd MUSE_* var won't abort runtime boot.
 */

/**
 * Goal 128 — align env-var boolean parsing with the goal-127
 * `RuntimeSettings.getBoolean` contract:
 *
 *   - whitespace-trimmed + lowercased
 *   - `"true" / "1" / "yes" / "on"` → `true`
 *   - `"false" / "0" / "no" / "off"` → `false`
 *   - anything else (typo, garbage, blank) → `fallback`
 *
 * Before this iteration, the parser only matched the truthy set
 * and silently returned `false` for anything else — so a typo'd
 * `MUSE_PROACTIVE_AGENT_TURN=Treu` produced `false` regardless of
 * the caller's fallback intent. The fallback-on-unknown branch
 * preserves the operator's stated default when the env value is
 * unrecognised, which is safer than the "unknown → false" coercion.
 */
const TRUTHY_ENV_VALUES: ReadonlySet<string> = new Set(["true", "1", "yes", "on"]);
const FALSY_ENV_VALUES: ReadonlySet<string> = new Set(["false", "0", "no", "off"]);

export function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  const normalised = value.trim().toLowerCase();
  if (TRUTHY_ENV_VALUES.has(normalised)) return true;
  if (FALSY_ENV_VALUES.has(normalised)) return false;
  return fallback;
}

export function parseInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseSloErrorRate(value: string | undefined, fallback: number): number {
  const parsed = value === undefined ? Number.NaN : Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return fallback;
  }
  return parsed;
}

export function parsePositiveFloat(value: string | undefined, fallback: number): number {
  const parsed = value === undefined ? Number.NaN : Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function parseNonNegativeFloat(value: string | undefined, fallback: number): number {
  const parsed = value === undefined ? Number.NaN : Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

export function parseCsv(value: string | undefined): readonly string[] | undefined {
  const entries = value
    ?.split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return entries && entries.length > 0 ? entries : undefined;
}

export function parseOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}
