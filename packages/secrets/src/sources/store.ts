import type { SecretRef, SecretSource } from "../types.js";

/**
 * Reads ONE secret value for a ref from an existing per-service credential
 * store. Generic by design — it takes a loader CALLBACK rather than importing
 * `@muse/calendar` / `@muse/messaging`, so those packages can depend on
 * `@muse/secrets` for the live wiring without creating a reference cycle.
 */
export type StoreLoader = (ref: SecretRef) => Promise<string | undefined>;

/**
 * The legacy-store fallback source. `local: true` — the per-service stores are
 * on-box chmod-600 files. Placed LAST in the chain so the user's real vault
 * wins, but existing behavior is unchanged when no vault is configured (the
 * resolver falls through to this and returns the stored value). A loader that
 * throws is treated as a miss (⇒ undefined), never a crash.
 */
export function createStoreSource(id: string, load: StoreLoader): SecretSource {
  return {
    id,
    local: true,
    async get(ref: SecretRef): Promise<string | undefined> {
      try {
        return await load(ref);
      } catch {
        return undefined;
      }
    }
  };
}
