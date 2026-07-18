/**
 * Day-rhythm — the one-click "하루 리듬" opt-in: once turned on, the morning
 * briefing and evening digest ticks auto-route to the user's paired
 * messaging channel instead of sleeping behind `MUSE_BRIEFING_ENABLED` /
 * env archaeology. State lives in the SAME `~/.config/muse/config.json`
 * `apps/cli/src/program-config.ts`'s `readConfigStore`/`writeConfigStore`
 * read/write (`resolveMuseCliConfigFilePath`) — reimplemented here (not
 * imported) because apps/api cannot depend on apps/cli, the identical
 * constraint `model-registry.ts`'s `readMuseCliConfigFile` documents. Both
 * the API server (routes) and the CLI daemon (ticks) import this module so
 * a toggle from the web console takes effect on the daemon's NEXT tick —
 * no restart needed, same "read LIVE every tick" idiom as
 * `commands-daemon-config.ts`'s `dailyBrief` block.
 *
 * Absent block ⇒ disabled (trust floor: off by default, explicit opt-in
 * only).
 */

import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { isRecord, parseJson } from "@muse/shared";

export const DAY_RHYTHM_DEFAULT_MORNING_HOUR = 8;
export const DAY_RHYTHM_DEFAULT_EVENING_HOUR = 18;

export interface DayRhythmConfig {
  readonly enabled: boolean;
  readonly morningHour: number;
  readonly eveningHour: number;
}

function isNodeErrnoException(value: unknown): value is NodeJS.ErrnoException {
  return value !== null && typeof value === "object" && "code" in value && typeof (value as { code?: unknown }).code === "string";
}

function parseHour(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 23 ? value : fallback;
}

/** Absent/malformed input ⇒ disabled defaults — never throws. */
export function normalizeDayRhythmConfig(raw: unknown): DayRhythmConfig {
  if (!isRecord(raw)) {
    return { enabled: false, eveningHour: DAY_RHYTHM_DEFAULT_EVENING_HOUR, morningHour: DAY_RHYTHM_DEFAULT_MORNING_HOUR };
  }
  return {
    enabled: raw.enabled === true,
    eveningHour: parseHour(raw.eveningHour, DAY_RHYTHM_DEFAULT_EVENING_HOUR),
    morningHour: parseHour(raw.morningHour, DAY_RHYTHM_DEFAULT_MORNING_HOUR)
  };
}

interface MuseCliConfigShape {
  readonly [key: string]: unknown;
}

async function readRawConfig(filePath: string): Promise<MuseCliConfigShape> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = parseJson(raw);
    if (parsed === undefined) {
      throw new Error(`config file is not valid JSON: ${filePath} — fix or delete it`);
    }
    if (!isRecord(parsed)) {
      throw new Error(`config file is not a JSON object: ${filePath} — fix or delete it`);
    }
    return parsed;
  } catch (error) {
    if (isNodeErrnoException(error) && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

/**
 * Reads the `dayRhythm` block from `~/.config/muse/config.json`. An absent
 * file, an absent block, or a malformed value all resolve to the disabled
 * defaults — this is a read path several ticks call every cycle, so it must
 * never throw on ordinary "not configured yet" states.
 */
export async function readDayRhythmConfig(filePath: string): Promise<DayRhythmConfig> {
  const parsed = await readRawConfig(filePath);
  return normalizeDayRhythmConfig(parsed.dayRhythm);
}

/**
 * Atomic read-merge-write of ONLY `dayRhythm` — preserves `apiUrl` /
 * `defaultModel` / `language` (or any other key) untouched. Same
 * tmp+rename+chmod 0600 pattern as `model-registry.ts`'s
 * `writeMuseCliDefaultModel` (crash-safe: a crash mid-write never
 * truncates the user's config.json).
 */
export async function writeDayRhythmConfig(
  filePath: string,
  next: DayRhythmConfig
): Promise<DayRhythmConfig> {
  const current = await readRawConfig(filePath);
  const merged: MuseCliConfigShape = { ...current, dayRhythm: next };
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid.toString()}-${randomBytes(8).toString("hex")}`;
  try {
    await writeFile(tmp, `${JSON.stringify(merged, null, 2)}\n`, { mode: 0o600 });
    await rename(tmp, filePath);
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
  await chmod(filePath, 0o600).catch(() => undefined);
  return next;
}

/** Per-tick reader for the daemon: ANY read/parse failure resolves to the
 * disabled defaults — a corrupt config.json must never crash the tick chain
 * (the strict reader above stays for surfaces that want the loud error). */
export async function readDayRhythmConfigSafe(filePath: string): Promise<DayRhythmConfig> {
  try {
    return await readDayRhythmConfig(filePath);
  } catch {
    return { enabled: false, eveningHour: DAY_RHYTHM_DEFAULT_EVENING_HOUR, morningHour: DAY_RHYTHM_DEFAULT_MORNING_HOUR };
  }
}
