/**
 * `muse history` — unified activity feed across the five
 * personal-JARVIS history stores: reminder firings, proactive
 * notices, fired followups, fired patterns, and prior episodes.
 *
 * Pure file IO over `~/.muse/<store>.json`. Returns the most-recent
 * entries newest-first. Filters: `--kind <one of the five>`,
 * `--since <iso>`, `--limit <n>` (default 20, cap 200), `--json`.
 *
 * Why a dedicated command:
 *   - `muse remind history` → reminder fires only
 *   - `muse proactive list` → proactive notices only
 *   - `muse followup list` → all followups regardless of status
 *   - `muse pattern list` → DETECTED patterns, not fired ones
 *   - `muse episode list` → conversation sessions
 *
 * For a JARVIS user the question "what did you do for me yesterday?"
 * crosses all five. Without this command they'd have to run four
 * separate `list`-shaped commands and merge by hand.
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  readFollowups,
  readProactiveHistory,
  readReminderHistory,
  type PersistedFollowup
} from "@muse/mcp";
import type { Command } from "commander";

import { formatLocalDateTime } from "./human-formatters.js";
import type { ProgramIO } from "./program.js";

type ActivityKind = "reminder" | "proactive" | "followup" | "pattern" | "episode";

interface ActivityEntry {
  readonly kind: ActivityKind;
  readonly whenIso: string;
  readonly summary: string;
  readonly status?: string;
  readonly providerId?: string;
  readonly destination?: string;
  readonly id?: string;
}

interface HistoryOptions {
  readonly kind?: string;
  readonly since?: string;
  readonly limit?: string;
  readonly json?: boolean;
}

interface PatternFiredRow {
  readonly patternId?: unknown;
  readonly firedAtMs?: unknown;
  readonly suggestion?: unknown;
}

interface EpisodeRow {
  readonly id?: unknown;
  readonly endedAt?: unknown;
  readonly summary?: unknown;
}

function envOr(key: string, fallbackName: string): string {
  const v = process.env[key]?.trim();
  return v && v.length > 0 ? v : join(homedir(), ".muse", fallbackName);
}

async function safeReadJson(path: string): Promise<unknown | undefined> {
  try {
    const raw = await fs.readFile(path, "utf8");
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

async function readReminderActivity(): Promise<readonly ActivityEntry[]> {
  const file = envOr("MUSE_REMINDER_HISTORY_FILE", "reminder-history.json");
  const rows = await readReminderHistory(file).catch(() => [] as const);
  return rows.map((row): ActivityEntry => ({
    destination: row.destination,
    id: row.reminderId,
    kind: "reminder",
    providerId: row.providerId,
    status: row.status,
    summary: row.text,
    whenIso: row.firedAtIso
  }));
}

async function readProactiveActivity(): Promise<readonly ActivityEntry[]> {
  const file = envOr("MUSE_PROACTIVE_HISTORY_FILE", "proactive-history.json");
  const rows = await readProactiveHistory(file).catch(() => [] as const);
  return rows.map((row): ActivityEntry => ({
    destination: row.destination,
    id: row.itemId,
    kind: "proactive",
    providerId: row.providerId,
    status: row.status,
    summary: row.text || row.title,
    whenIso: row.firedAtIso
  }));
}

async function readFollowupActivity(): Promise<readonly ActivityEntry[]> {
  const file = envOr("MUSE_FOLLOWUPS_FILE", "followups.json");
  const rows = await readFollowups(file).catch(() => [] as const);
  return rows
    .filter((row: PersistedFollowup) => row.status === "fired" && typeof row.firedAt === "string")
    .map((row): ActivityEntry => ({
      id: row.id,
      kind: "followup",
      status: "fired",
      summary: row.summary,
      whenIso: row.firedAt as string
    }));
}

async function readPatternActivity(): Promise<readonly ActivityEntry[]> {
  const file = envOr("MUSE_PATTERNS_FIRED_FILE", "patterns-fired.json");
  const doc = await safeReadJson(file) as { fired?: readonly PatternFiredRow[] } | undefined;
  const rows = doc?.fired ?? [];
  return rows.flatMap((row): readonly ActivityEntry[] => {
    if (typeof row.patternId !== "string" || typeof row.firedAtMs !== "number" || !Number.isFinite(row.firedAtMs)) {
      return [];
    }
    return [{
      id: row.patternId,
      kind: "pattern",
      summary: typeof row.suggestion === "string" ? row.suggestion : `pattern ${row.patternId}`,
      whenIso: new Date(row.firedAtMs).toISOString()
    }];
  });
}

async function readEpisodeActivity(): Promise<readonly ActivityEntry[]> {
  const file = envOr("MUSE_EPISODES_FILE", "episodes.json");
  const doc = await safeReadJson(file) as { episodes?: readonly EpisodeRow[] } | undefined;
  const rows = doc?.episodes ?? [];
  return rows.flatMap((row): readonly ActivityEntry[] => {
    if (typeof row.id !== "string" || typeof row.endedAt !== "string" || typeof row.summary !== "string") {
      return [];
    }
    return [{
      id: row.id,
      kind: "episode",
      summary: row.summary,
      whenIso: row.endedAt
    }];
  });
}

const ALL_KINDS: ReadonlySet<ActivityKind> = new Set(["reminder", "proactive", "followup", "pattern", "episode"]);

function parseLimit(raw: string | undefined, fallback: number, cap: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(cap, Math.trunc(parsed));
}

export function registerHistoryCommand(program: Command, io: ProgramIO): void {
  program
    .command("history")
    .description("Unified activity feed across reminder/proactive/followup/pattern/episode stores (newest first)")
    .option("--kind <one>", "Filter to a single kind: reminder | proactive | followup | pattern | episode")
    .option("--since <iso>", "Drop entries older than this ISO timestamp")
    .option("--limit <n>", "Max entries (default 20, cap 200)")
    .option("--json", "Emit a structured array instead of the formatted feed")
    .action(async (options: HistoryOptions) => {
      const kindFilter = options.kind?.trim().toLowerCase();
      if (kindFilter && !ALL_KINDS.has(kindFilter as ActivityKind)) {
        throw new Error(`--kind must be one of: reminder, proactive, followup, pattern, episode (got '${kindFilter}')`);
      }
      const sinceMs = options.since ? Date.parse(options.since) : Number.NEGATIVE_INFINITY;
      if (options.since && !Number.isFinite(sinceMs)) {
        throw new Error(`--since must be a parseable ISO timestamp (got '${options.since}')`);
      }
      const limit = parseLimit(options.limit, 20, 200);

      const readers: ReadonlyArray<readonly [ActivityKind, () => Promise<readonly ActivityEntry[]>]> = [
        ["reminder", readReminderActivity],
        ["proactive", readProactiveActivity],
        ["followup", readFollowupActivity],
        ["pattern", readPatternActivity],
        ["episode", readEpisodeActivity]
      ];
      const selected = kindFilter
        ? readers.filter(([k]) => k === kindFilter)
        : readers;
      const bundles = await Promise.all(selected.map(async ([, reader]) => reader()));
      const merged = bundles.flat()
        .filter((entry) => {
          if (!Number.isFinite(sinceMs)) return true;
          const t = Date.parse(entry.whenIso);
          return Number.isFinite(t) && t >= sinceMs;
        })
        .sort((left, right) => right.whenIso.localeCompare(left.whenIso))
        .slice(0, limit);

      if (options.json) {
        io.stdout(`${JSON.stringify({ entries: merged, total: merged.length }, null, 2)}\n`);
        return;
      }
      if (merged.length === 0) {
        io.stdout("(no activity yet — JARVIS hasn't fired anything in the configured stores)\n");
        return;
      }
      io.stdout(`Activity (${merged.length.toString()} entries, newest first):\n\n`);
      for (const entry of merged) {
        const status = entry.status ? ` ${entry.status}` : "";
        const via = entry.providerId
          ? ` via ${entry.providerId}${entry.destination ? `→${entry.destination}` : ""}`
          : "";
        const when = formatLocalDateTime(entry.whenIso);
        const head = `[${when}] ${entry.kind}${status}${via}`;
        io.stdout(`  ${head}\n`);
        const summary = entry.summary.replace(/\s+/gu, " ").trim();
        const truncated = summary.length > 140 ? `${summary.slice(0, 139)}…` : summary;
        io.stdout(`      ${truncated || "(no summary)"}\n\n`);
      }
    });
}
