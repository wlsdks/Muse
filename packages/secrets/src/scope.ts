import { resolveSecret } from "./resolve.js";
import type { SecretRef, SecretSource } from "./types.js";

/** A scope entry: a bare name (matches that name in ANY service) or a name pinned to one service. */
export type SecretScopeEntry = string | { readonly name: string; readonly service?: string };

export interface SecretScopeOptions {
  /** Called when a `get` is refused because the ref is outside the declared scope. */
  readonly onDenied?: (ref: SecretRef) => void;
}

/**
 * Least-privilege wrapper around the resolver. A caller declares the secret
 * NAMES (optionally pinned to a SERVICE) it may read; a `get` for anything else
 * is fail-closed — it returns `undefined` (never the value) and records a
 * denial, WITHOUT ever querying a source. A service-pinned entry
 * (`{name:"token", service:"telegram"}`) does NOT permit `{name:"token",
 * service:"gmail"}` — so two services whose secrets share a name can't read each
 * other's. A bare-name entry matches any service (the convenience default).
 */
export interface SecretScope {
  readonly allowed: ReadonlySet<string>;
  get(ref: SecretRef, sources: readonly SecretSource[]): Promise<string | undefined>;
  permits(ref: SecretRef): boolean;
}

interface NormalizedEntry {
  readonly name: string;
  readonly service?: string;
}

function normalize(entry: SecretScopeEntry): NormalizedEntry {
  return typeof entry === "string"
    ? { name: entry }
    : { name: entry.name, ...(entry.service !== undefined ? { service: entry.service } : {}) };
}

export function createSecretScope(
  allowedEntries: readonly SecretScopeEntry[],
  options: SecretScopeOptions = {}
): SecretScope {
  const entries = allowedEntries.map(normalize);
  const allowed = new Set(entries.map((e) => e.name));
  // A ref is permitted iff some entry matches its name AND either the entry pins no service (any
  // service) or it pins exactly the ref's service. A service-pinned entry never matches a ref for a
  // different (or absent) service — that is the cross-service fail-close.
  const permits = (ref: SecretRef): boolean =>
    entries.some((e) => e.name === ref.name && (e.service === undefined || e.service === ref.service));
  return {
    allowed,
    async get(ref, sources) {
      if (!permits(ref)) {
        options.onDenied?.(ref);
        return undefined;
      }
      return resolveSecret(ref, sources);
    },
    permits
  };
}
