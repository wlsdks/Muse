/**
 * `muse doctor` surfacing for day-rhythm ("하루 리듬") — the one-click
 * morning-briefing + evening-digest opt-in. Kept in its own file (not
 * `commands-doctor-checks.ts`) mirroring `commands-doctor-heartbeat.ts`'s
 * pure-check / IO-wrapper split: the diagnosis itself is a pure function of
 * already-read state, so it's directly testable without touching disk.
 *
 * Severity: off is the trust-floor default and reports `ok` — it is not a
 * problem, it just hasn't been turned on. On-but-unpaired is the one
 * actionable state (nothing can actually be delivered) and reports `warn`.
 */

import { readFile } from "node:fs/promises";

import { readDayRhythmConfig, resolveSinglePairedChannel, type DayRhythmConfig, type PairedChannel } from "@muse/autoconfigure";

import { formatRelativeTime } from "./human-formatters.js";

import type { LocalCheck } from "./commands-doctor-checks.js";

export interface DayRhythmDoctorState {
  readonly config: DayRhythmConfig;
  readonly pairedChannel: PairedChannel | undefined;
  /** ISO timestamp of the last delivered briefing, from the tick's own sidecar — `undefined` when it has never fired or the sidecar is unreadable. */
  readonly lastBriefingDeliveredAtIso: string | undefined;
}

/** Pure: turn already-read day-rhythm state into a doctor line. */
export function dayRhythmDoctorCheck(state: DayRhythmDoctorState, now: Date = new Date()): LocalCheck {
  const name = "day rhythm";
  if (!state.config.enabled) {
    return { detail: "off (default) — turn on 하루 리듬 in the web console's Home to auto-deliver a morning briefing + evening digest", name, status: "ok" };
  }
  const times = `morning ~${state.config.morningHour.toString()}:00 / evening ~${state.config.eveningHour.toString()}:00`;
  if (!state.pairedChannel) {
    return { detail: `on (${times}) but no channel paired — nothing will be delivered until one is`, name, status: "warn" };
  }
  const lastDelivered = state.lastBriefingDeliveredAtIso
    ? `; last briefing delivered ${formatRelativeTime(state.lastBriefingDeliveredAtIso, now)}`
    : "; no briefing delivered yet";
  return {
    detail: `on (${times}) via ${state.pairedChannel.providerId}${lastDelivered}`,
    name,
    status: "ok"
  };
}

/** IO wrapper: read the config + paired-channel + briefing sidecar, then diagnose. */
export async function readDayRhythmDoctorCheck(
  configFile: string,
  channelOwnersFile: string,
  briefingSidecarFile: string,
  registry: { readonly has: (providerId: string) => boolean },
  now: () => Date = () => new Date()
): Promise<LocalCheck> {
  const config = await readDayRhythmConfig(configFile).catch((): DayRhythmConfig => ({ enabled: false, eveningHour: 18, morningHour: 8 }));
  const pairedChannel = await resolveSinglePairedChannel(channelOwnersFile, registry).catch(() => undefined);
  let lastBriefingDeliveredAtIso: string | undefined;
  try {
    const raw = JSON.parse(await readFile(briefingSidecarFile, "utf8")) as { lastFiredAt?: unknown };
    lastBriefingDeliveredAtIso = typeof raw.lastFiredAt === "string" ? raw.lastFiredAt : undefined;
  } catch { /* no sidecar yet — never fired, or unreadable */ }
  return dayRhythmDoctorCheck({ config, lastBriefingDeliveredAtIso, pairedChannel }, now());
}
