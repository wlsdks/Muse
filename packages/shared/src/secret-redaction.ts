/**
 * Process-wide redaction of RESOLVED secret VALUES.
 *
 * SecretSource resolves a secret on demand and registers its raw value here;
 * every persisted sink (log, action-log, provenance) runs its text through
 * `redactSecrets` so a value that was resolved once is masked as
 * `‹secret:NAME›` everywhere it could otherwise be written in clear.
 *
 * The registry is process-wide + GROW-ONLY by design: a value seen once stays
 * masked for the life of the process (a freed secret can still sit in a buffer
 * a later log line copies). It lives in `@muse/shared` — the lowest package —
 * so every sink can import the redactor WITHOUT a dependency cycle on the
 * resolver package.
 *
 * This is intentionally distinct from `redactSecretsInText` (pattern-based
 * shape matching of credential-shaped strings); this one masks the EXACT
 * values Muse itself resolved, which the shape patterns might miss.
 */

const MASK_OPEN = "‹secret:";
const MASK_CLOSE = "›";

const registry = new Map<string, string>();

/**
 * Register a resolved secret value under its logical name. Empty / non-string
 * values are ignored (nothing to mask). Idempotent; a later name for the same
 * value overwrites the label only.
 */
export function registerSecretValue(value: string, name: string): void {
  if (typeof value !== "string" || value.length === 0) {
    return;
  }
  registry.set(value, name);
}

/**
 * Replace every registered secret value in `text` with `‹secret:NAME›`. Uses
 * literal split/join (no regex) so a value containing regex metacharacters is
 * matched verbatim and there is no ReDoS surface. Never throws; a non-string or
 * empty input passes through. Longest values are masked first so a secret that
 * is a substring of another can't unmask the longer one.
 */
export function redactSecrets(text: string): string {
  if (typeof text !== "string" || text.length === 0) {
    return text;
  }
  let out = text;
  const byLength = [...registry.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [value, name] of byLength) {
    if (out.includes(value)) {
      out = out.split(value).join(`${MASK_OPEN}${name}${MASK_CLOSE}`);
    }
  }
  return out;
}

/** Is anything registered? (cheap guard so a sink can skip the scan when empty). */
export function hasRegisteredSecrets(): boolean {
  return registry.size > 0;
}

/**
 * Clear the registry. TEST-ONLY — the production registry is grow-only and
 * must never be cleared at runtime (it would un-mask values already seen).
 */
export function clearSecretRegistryForTests(): void {
  registry.clear();
}
