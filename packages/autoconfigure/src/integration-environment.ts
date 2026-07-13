/**
 * Narrow, immutable environment snapshot for the standard personal
 * integration surfaces. It intentionally carries paths and non-secret
 * configuration state, never the source environment or provider tokens.
 */

import { homedir } from "node:os";
import { join as pathJoin } from "node:path";

import { isLocalOnlyEnabled } from "@muse/model";

import {
  resolveCredentialsFile,
  resolveDiscordAfterFile,
  resolveDiscordInboxFile,
  resolveInboxInjectionCursorFile,
  resolveLineInboxFile,
  resolveLocalCalendarFile,
  resolveMatrixInboxFile,
  resolveMatrixSinceFile,
  resolveMessagingCredentialsFile,
  resolveSlackAfterFile,
  resolveSlackInboxFile,
  resolveTelegramInboxFile,
  resolveTelegramOffsetFile
} from "./provider-paths.js";
import type { MuseEnvironment } from "./runtime-assembly.js";

export type IntegrationMessagingProviderId = "telegram" | "discord" | "slack" | "line" | "matrix";

export interface ResolvedMessagingProviderEnvironment {
  readonly envConfigured: boolean;
  readonly inboxFile: string;
  readonly cursorFile: string;
  readonly pollCursorFile: string;
}

export interface ResolvedIntegrationEnvironment {
  readonly localOnly: boolean;
  readonly calendar: Readonly<{
    readonly credentialsFile: string;
    readonly localFile: string;
  }>;
  readonly messaging: Readonly<{
    readonly credentialsFile: string;
    readonly ownersFile: string;
    readonly pairingCodesFile: string;
    readonly lineChannelSecret?: string;
    readonly providers: Readonly<Record<IntegrationMessagingProviderId, ResolvedMessagingProviderEnvironment>>;
  }>;
}

export interface ResolveIntegrationEnvironmentOptions {
  /** Direct `buildServer` override seam. It wins over the ambient source. */
  readonly localOnlyOverride?: boolean;
}

function configured(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function resolveChannelStateFile(env: MuseEnvironment, envKey: string, defaultName: string): string {
  const explicit = env[envKey]?.trim();
  if (explicit && explicit.length > 0) {
    return explicit;
  }
  // Keep the snapshot coherent with every provider-path resolver: an explicit
  // composition env can isolate HOME even when the process ambient differs.
  const home = env.HOME?.trim() || process.env.HOME?.trim() || homedir();
  return pathJoin(home, ".muse", defaultName);
}

function freezeProvider(input: ResolvedMessagingProviderEnvironment): ResolvedMessagingProviderEnvironment {
  return Object.freeze(input);
}

/**
 * Resolve the only environment-derived data that standard calendar/messaging
 * API setup needs. Local-only is evaluated first so a source Proxy can prove
 * that remote token and LINE-secret getters were never touched.
 */
export function resolveIntegrationEnvironment(
  sourceEnv: MuseEnvironment,
  options: ResolveIntegrationEnvironmentOptions = {}
): ResolvedIntegrationEnvironment {
  const localOnly = options.localOnlyOverride ?? isLocalOnlyEnabled(sourceEnv);
  const calendar = Object.freeze({
    credentialsFile: resolveCredentialsFile(sourceEnv),
    localFile: resolveLocalCalendarFile(sourceEnv)
  });
  const ownersFile = resolveChannelStateFile(sourceEnv, "MUSE_CHANNEL_OWNERS_FILE", "channel-owners.json");
  const pairingCodesFile = resolveChannelStateFile(sourceEnv, "MUSE_CHANNEL_PAIRING_CODES_FILE", "channel-pairing-codes.json");

  // These are all local paths. Do not move any remote token/secret lookup
  // above this return: the local-only branch is the privacy boundary.
  const localPaths = {
    discord: freezeProvider({
      cursorFile: resolveInboxInjectionCursorFile(sourceEnv, "discord"),
      envConfigured: false,
      inboxFile: resolveDiscordInboxFile(sourceEnv),
      pollCursorFile: resolveDiscordAfterFile(sourceEnv)
    }),
    line: freezeProvider({
      cursorFile: resolveInboxInjectionCursorFile(sourceEnv, "line"),
      envConfigured: false,
      inboxFile: resolveLineInboxFile(sourceEnv),
      pollCursorFile: resolveInboxInjectionCursorFile(sourceEnv, "line")
    }),
    matrix: freezeProvider({
      cursorFile: resolveInboxInjectionCursorFile(sourceEnv, "matrix"),
      envConfigured: false,
      inboxFile: resolveMatrixInboxFile(sourceEnv),
      pollCursorFile: resolveMatrixSinceFile(sourceEnv)
    }),
    slack: freezeProvider({
      cursorFile: resolveInboxInjectionCursorFile(sourceEnv, "slack"),
      envConfigured: false,
      inboxFile: resolveSlackInboxFile(sourceEnv),
      pollCursorFile: resolveSlackAfterFile(sourceEnv)
    }),
    telegram: freezeProvider({
      cursorFile: resolveInboxInjectionCursorFile(sourceEnv, "telegram"),
      envConfigured: false,
      inboxFile: resolveTelegramInboxFile(sourceEnv),
      pollCursorFile: resolveTelegramOffsetFile(sourceEnv)
    })
  } as const;

  if (localOnly) {
    return Object.freeze({
      calendar,
      localOnly: true,
      messaging: Object.freeze({
        credentialsFile: resolveMessagingCredentialsFile(sourceEnv),
        ownersFile,
        pairingCodesFile,
        providers: Object.freeze(localPaths)
      })
    });
  }

  const providers = Object.freeze({
    discord: freezeProvider({ ...localPaths.discord, envConfigured: configured(sourceEnv.MUSE_DISCORD_BOT_TOKEN) }),
    line: freezeProvider({ ...localPaths.line, envConfigured: configured(sourceEnv.MUSE_LINE_CHANNEL_ACCESS_TOKEN) }),
    matrix: freezeProvider({ ...localPaths.matrix, envConfigured: configured(sourceEnv.MUSE_MATRIX_ACCESS_TOKEN) }),
    slack: freezeProvider({ ...localPaths.slack, envConfigured: configured(sourceEnv.MUSE_SLACK_BOT_TOKEN) }),
    telegram: freezeProvider({ ...localPaths.telegram, envConfigured: configured(sourceEnv.MUSE_TELEGRAM_BOT_TOKEN) })
  });
  const lineChannelSecret = sourceEnv.MUSE_LINE_CHANNEL_SECRET?.trim();
  return Object.freeze({
    calendar,
    localOnly: false,
    messaging: Object.freeze({
      credentialsFile: resolveMessagingCredentialsFile(sourceEnv),
      ...(lineChannelSecret ? { lineChannelSecret } : {}),
      ownersFile,
      pairingCodesFile,
      providers
    })
  });
}
