import type { MessagingProviderRegistry } from "@muse/messaging";

export type DaemonProviderLock = "log";

export function resolveDaemonProviderLock(
  env: Readonly<Record<string, string | undefined>>
): DaemonProviderLock | undefined {
  const raw = env.MUSE_DAEMON_PROVIDER_LOCK?.trim();
  if (!raw) return undefined;
  if (raw === "log") return "log";
  throw new Error("MUSE_DAEMON_PROVIDER_LOCK only supports 'log'");
}

/**
 * Preserve the complete registry interface while enforcing the daemon's
 * provider lock at the final outbound chokepoint. Per-record and per-tick route
 * overrides all converge on `send`, so none can bypass this check.
 */
export function lockDaemonMessagingRegistry(
  registry: MessagingProviderRegistry,
  providerLock: DaemonProviderLock | undefined
): MessagingProviderRegistry {
  if (providerLock === undefined) return registry;
  return new Proxy(registry, {
    get(target, property) {
      if (property === "send") {
        return async (providerId: string, message: Parameters<MessagingProviderRegistry["send"]>[1]) => {
          if (providerId !== providerLock) {
            throw new Error("daemon provider lock rejected a non-log provider");
          }
          return target.send(providerId, message);
        };
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}
