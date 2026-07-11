import type { MessagingSetupProvider } from "../api/types.js";

export interface ProviderStatusView {
  readonly tone: "ok" | "warn" | "neutral";
  readonly labelKey: "int.status.connected" | "int.status.connectedEnv" | "int.status.savedNotLive" | "int.status.notConnected";
}

/** Status badge shape for one provider card — pure so it stays unit-testable. */
export function providerStatus(provider: MessagingSetupProvider): ProviderStatusView {
  if (!provider.configured) {
    return { labelKey: "int.status.notConnected", tone: "neutral" };
  }
  if (!provider.registered) {
    // Credential persisted but the running server has no live provider —
    // the state after a manual file edit or a failed boot; surfacing it
    // beats a silent "connected" that can't actually send.
    return { labelKey: "int.status.savedNotLive", tone: "warn" };
  }
  return provider.source === "env"
    ? { labelKey: "int.status.connectedEnv", tone: "ok" }
    : { labelKey: "int.status.connected", tone: "ok" };
}

/** Env-sourced credentials outlive the UI (only the shell can unset them). */
export function canDisconnect(provider: MessagingSetupProvider): boolean {
  return provider.configured && provider.source === "file";
}

/**
 * Matrix has no fixed API host — the user picks a homeserver — so
 * its card needs a homeserver-URL input alongside the token and the
 * connect POST must carry both.
 */
export function requiresHomeserver(providerId: string): boolean {
  return providerId === "matrix";
}

export interface DaemonBadgeView {
  readonly tone: "ok" | "warn" | "neutral";
  readonly labelKey: "int.daemon.running" | "int.daemon.enabledNotRunning" | "int.daemon.on" | "int.daemon.off";
}

/**
 * Truthful daemon badge: `enabled` is only the flag; `running` (when the
 * server reports it) is the live handle. A flag-on/daemon-dead mismatch
 * must surface as a warning, never as a green "on".
 */
export function daemonBadge(flag: { readonly enabled: boolean; readonly running?: boolean }): DaemonBadgeView {
  if (!flag.enabled) {
    return { labelKey: "int.daemon.off", tone: "neutral" };
  }
  if (flag.running === undefined) {
    return { labelKey: "int.daemon.on", tone: "ok" };
  }
  return flag.running
    ? { labelKey: "int.daemon.running", tone: "ok" }
    : { labelKey: "int.daemon.enabledNotRunning", tone: "warn" };
}
