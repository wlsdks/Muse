/**
 * Slack polling daemon (Phase 2.d.3 per docs/design/messaging.md).
 *
 * Slack's API is per-channel (like Discord) — no global "what's
 * new?" stream — so this daemon iterates a user-configured channel
 * list on each tick, calling `provider.pollUpdates({ source: channelId })`
 * and appending each returned `InboundMessage` to a JSON inbox
 * file. The per-channel `ts` cursor (Phase 2.d.1+2) lives in the
 * provider's `afterFile`, so the daemon doesn't track state itself.
 *
 * One channel's failure (missing access, archived channel, bad id)
 * is logged and skipped; remaining channels still poll on the
 * same tick.
 *
 * Off by default. Activates only when:
 *   - `MUSE_SLACK_POLL_ENABLED === "1"`, and
 *   - `MUSE_SLACK_POLL_CHANNELS` is a non-empty CSV (e.g.
 *     `C0123ABCD,C0456EFGH`), and
 *   - the messaging registry has the `slack` provider, and
 *   - `inboxFile` is configured.
 *
 * Same single-flight + unref + injectable-logger shape as
 * `discord-poll-tick.ts` and `telegram-poll-tick.ts`. Tick cadence
 * is `MUSE_SLACK_POLL_INTERVAL_MS` (default 30_000); clamped to [5s, 1h].
 */

import { appendInbound, type SlackProvider } from "@muse/messaging";

export interface SlackPollOptions {
  readonly provider: SlackProvider;
  readonly inboxFile: string;
  /** Channel IDs to poll each tick. Empty → daemon never registered. */
  readonly channels: readonly string[];
  readonly intervalMs?: number;
  readonly fetchLimit?: number;
  readonly logger?: (message: string) => void;
  readonly errorLogger?: (message: string) => void;
}

export interface SlackPollHandle {
  readonly stop: () => void;
  readonly tickOnce: () => Promise<void>;
}

const DEFAULT_INTERVAL_MS = 30_000;
const MIN_INTERVAL_MS = 5_000;
const MAX_INTERVAL_MS = 60 * 60_000;

export function startSlackPollTick(options: SlackPollOptions): SlackPollHandle {
  const intervalMs = clampInterval(options.intervalMs ?? DEFAULT_INTERVAL_MS);
  let polling = false;

  const tickOnce = async (): Promise<void> => {
    if (polling) {
      return;
    }
    polling = true;
    try {
      let totalIngested = 0;
      for (const channel of options.channels) {
        try {
          const inbound = await options.provider.pollUpdates({
            source: channel,
            ...(options.fetchLimit !== undefined ? { limit: options.fetchLimit } : {})
          });
          for (const message of inbound) {
            await appendInbound(options.inboxFile, message);
          }
          totalIngested += inbound.length;
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : String(cause);
          options.errorLogger?.(`slack-poll: channel ${channel}: ${message}`);
        }
      }
      if (totalIngested > 0) {
        options.logger?.(`slack-poll: ingested ${totalIngested.toString()} message(s) across ${options.channels.length.toString()} channel(s)`);
      }
    } finally {
      polling = false;
    }
  };

  const handle = setInterval(() => {
    void tickOnce();
  }, intervalMs);
  if (typeof handle.unref === "function") {
    handle.unref();
  }

  return {
    stop: () => clearInterval(handle),
    tickOnce
  };
}

/**
 * Parse `MUSE_SLACK_POLL_CHANNELS` of the form `C0123ABCD,C0456EFGH`.
 * Trims each entry and drops empties. Returns `undefined` when the
 * raw value is missing/blank so the daemon stays off.
 */
export function parseSlackPollChannels(raw: string | undefined): readonly string[] | undefined {
  if (!raw) {
    return undefined;
  }
  const parts = raw.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  return parts.length > 0 ? parts : undefined;
}

function clampInterval(raw: number): number {
  if (!Number.isFinite(raw)) {
    return DEFAULT_INTERVAL_MS;
  }
  return Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, Math.trunc(raw)));
}
