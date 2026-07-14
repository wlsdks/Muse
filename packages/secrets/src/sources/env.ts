import type { SecretRef, SecretSource } from "../types.js";

/**
 * Normalise a secret name into the env-var suffix: uppercase, non-alphanumerics
 * → `_`. So `telegram-bot-token` reads from `MUSE_SECRET_TELEGRAM_BOT_TOKEN`.
 */
export function envVarNameFor(name: string): string {
  return `MUSE_SECRET_${name.toUpperCase().replace(/[^A-Z0-9]+/gu, "_")}`;
}

/**
 * The simplest local source — a secret carried as `MUSE_SECRET_<NAME>` in the
 * environment. For headless / CI where no GUI vault is available. `local: true`
 * (the value never leaves the box). A missing var ⇒ `undefined` ⇒ next source.
 */
export function createEnvSource(env: NodeJS.ProcessEnv = process.env): SecretSource {
  return {
    id: "env",
    local: true,
    async get(ref: SecretRef): Promise<string | undefined> {
      const value = env[envVarNameFor(ref.name)];
      return value !== undefined && value.length > 0 ? value : undefined;
    }
  };
}
