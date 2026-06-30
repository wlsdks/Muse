import { registerSecretValue } from "@muse/shared";

import type { SecretRef, SecretSource } from "./types.js";

/**
 * Resolve a secret by trying each source IN ORDER, read-on-demand, returning
 * the first non-undefined hit (or `undefined` when no source holds it).
 *
 * Security invariants (SecretSource hostile review §4):
 *  - A NON-LOCAL source is REFUSED: its `get` is NEVER called, so a secret can
 *    never be sent to a cloud vault API to be read back (which would egress it).
 *    A non-local source is skipped, not fatal — the next local source still runs.
 *  - On a resolved value, the value is registered with the process-wide redaction
 *    registry so it is masked in every persisted sink from here on.
 *  - The resolver does NOT persist or cache the value anywhere; the only at-rest
 *    copy stays in the user's vault (and the legacy store being superseded).
 */
export async function resolveSecret(
  ref: SecretRef,
  sources: readonly SecretSource[]
): Promise<string | undefined> {
  for (const source of sources) {
    if (!source.local) {
      // Fail-closed against egress: never query a non-local source.
      continue;
    }
    let value: string | undefined;
    try {
      value = await source.get(ref);
    } catch {
      // A source that THROWS (a locked / erroring vault) is a miss — fall through to the next
      // source (the §4 fail-open contract). Crucially the error is SWALLOWED, never propagated:
      // it could carry the raw secret (read just before the throw) UN-registered, so a catch/logger
      // upstream would leak it. The boolean miss is all the caller needs.
      continue;
    }
    if (value !== undefined) {
      registerSecretValue(value, ref.name);
      return value;
    }
  }
  return undefined;
}
