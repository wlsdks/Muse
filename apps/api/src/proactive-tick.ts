/**
 * Proactive surfacing daemon (Phase A per docs/design/proactive-surfacing.md).
 * Sibling of reminder-tick.ts — same setInterval-on-the-API-server
 * pattern, calendar-imminence-driven signal source.
 *
 * Off by default. Activates only when:
 *   - `MUSE_PROACTIVE_PROVIDER` and `MUSE_PROACTIVE_DESTINATION` are set,
 *   - the messaging registry has the named provider,
 *   - a calendar registry is wired (some provider registered), and
 *   - a sidecar file is configured.
 *
 * Tick cadence is `MUSE_PROACTIVE_TICK_MS` (default 60_000); clamped
 * to [5s, 1h] for the same reason reminder-tick clamps.
 */

import { runDueProactiveNotices } from "@muse/mcp";
import type { CalendarProviderRegistry } from "@muse/calendar";
import type { MessagingProviderRegistry } from "@muse/messaging";

import { isQuietHour, type QuietHourRange } from "./reminder-tick.js";

export interface ProactiveTickOptions {
  readonly calendarRegistry: CalendarProviderRegistry;
  readonly messagingRegistry: MessagingProviderRegistry;
  readonly providerId: string;
  readonly destination: string;
  readonly sidecarFile: string;
  readonly leadMinutes?: number;
  readonly intervalMs?: number;
  readonly logger?: (message: string) => void;
  readonly errorLogger?: (message: string) => void;
  /**
   * Shared with the reminder daemon — operators rarely want a
   * different quiet window for the two channels. Parse via
   * `parseQuietHours(MUSE_PROACTIVE_QUIET_HOURS ?? MUSE_REMINDER_QUIET_HOURS)`
   * at the wiring layer.
   */
  readonly quietHours?: QuietHourRange;
  /** Injectable clock for tests; default is `() => new Date()`. */
  readonly now?: () => Date;
}

const DEFAULT_INTERVAL_MS = 60_000;
const MIN_INTERVAL_MS = 5_000;
const MAX_INTERVAL_MS = 60 * 60_000;

export interface ProactiveTickHandle {
  readonly stop: () => void;
  readonly tickOnce: () => Promise<void>;
}

export function startProactiveTick(options: ProactiveTickOptions): ProactiveTickHandle {
  const intervalMs = clampInterval(options.intervalMs ?? DEFAULT_INTERVAL_MS);
  const now = options.now ?? (() => new Date());
  let firing = false;

  const tickOnce = async (): Promise<void> => {
    if (firing) {
      return;
    }
    if (options.quietHours && isQuietHour(now().getHours(), options.quietHours)) {
      return;
    }
    firing = true;
    try {
      const summary = await runDueProactiveNotices({
        calendarRegistry: options.calendarRegistry,
        destination: options.destination,
        ...(options.leadMinutes !== undefined ? { leadMinutes: options.leadMinutes } : {}),
        messagingRegistry: options.messagingRegistry,
        now,
        providerId: options.providerId,
        sidecarFile: options.sidecarFile
      });
      if (summary.fired > 0 || summary.errors.length > 0) {
        options.logger?.(
          `proactive-tick: fired ${summary.fired.toString()} of ${summary.imminent.toString()} imminent via ${options.providerId}` +
            (summary.errors.length > 0 ? `, ${summary.errors.length.toString()} error(s)` : "")
        );
        for (const error of summary.errors) {
          options.errorLogger?.(`proactive-tick: ${error}`);
        }
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      options.errorLogger?.(`proactive-tick: ${message}`);
    } finally {
      firing = false;
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

function clampInterval(raw: number): number {
  if (!Number.isFinite(raw)) {
    return DEFAULT_INTERVAL_MS;
  }
  return Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, Math.trunc(raw)));
}
