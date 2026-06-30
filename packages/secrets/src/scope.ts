import { resolveSecret } from "./resolve.js";
import type { SecretRef, SecretSource } from "./types.js";

export interface SecretScopeOptions {
  /** Called when a `get` is refused because the ref is outside the declared scope. */
  readonly onDenied?: (ref: SecretRef) => void;
}

/**
 * Least-privilege wrapper around the resolver. A caller declares the secret
 * NAMES it may read; a `get` for any other name is fail-closed — it returns
 * `undefined` (never the value) and records a denial, without ever querying a
 * source. So a Telegram-send tool scoped to its own token can't read the Gmail
 * password even if both live in the same vault.
 */
export interface SecretScope {
  readonly allowed: ReadonlySet<string>;
  get(ref: SecretRef, sources: readonly SecretSource[]): Promise<string | undefined>;
  permits(name: string): boolean;
}

export function createSecretScope(
  allowedNames: readonly string[],
  options: SecretScopeOptions = {}
): SecretScope {
  const allowed = new Set(allowedNames);
  return {
    allowed,
    async get(ref, sources) {
      if (!allowed.has(ref.name)) {
        options.onDenied?.(ref);
        return undefined;
      }
      return resolveSecret(ref, sources);
    },
    permits(name) {
      return allowed.has(name);
    }
  };
}
