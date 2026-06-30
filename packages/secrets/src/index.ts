export type { SecretRef, SecretSource } from "./types.js";
export { resolveSecret } from "./resolve.js";
export { createSecretScope, type SecretScope, type SecretScopeOptions } from "./scope.js";
export { createEnvSource, envVarNameFor } from "./sources/env.js";
export {
  createKeychainSource,
  SECURITY_BIN,
  type ArgvRunner,
  type KeychainSourceOptions
} from "./sources/keychain.js";
export { createStoreSource, type StoreLoader } from "./sources/store.js";

// Re-export the redaction primitive from its home in @muse/shared so callers
// can import the whole SecretSource surface from one place.
export { redactSecrets, registerSecretValue, hasRegisteredSecrets } from "@muse/shared";
