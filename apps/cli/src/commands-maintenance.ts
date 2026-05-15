/**
 * Goal 080 — `muse maintenance compact` rotates the archive
 * sidecars goal 079 produces (`proactive-history.json.1`,
 * `.2`, …) into `~/.muse/archive/<basename>.<n>.<iso>.json.gz`
 * so disk usage stays bounded over time without losing audit
 * data.
 *
 * Scope:
 *   - Walks the `~/.muse/` directory for `*.json.<n>` siblings
 *     of well-known stores (`proactive-history`, in 079;
 *     extensible by env).
 *   - Optional `--keep-days N` filter — only files older than
 *     N days are compacted (default: compact every numbered
 *     archive, regardless of age).
 *   - Writes the gz archive under `~/.muse/archive/`, then
 *     unlinks the source. Atomic: a partial-write doesn't
 *     leave both copies behind because we gz to a `.tmp`
 *     sibling and rename on success.
 */

import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

import type { Command } from "commander";

import type { ProgramIO } from "./program.js";

/**
 * Goal 080 — store basenames whose `<name>.json.<n>` rotations
 * the compaction sweep recognizes. Starts narrow (only the goal
 * 079 producer) so the sweep doesn't accidentally consume
 * unrelated files an operator dropped in `~/.muse/`. Future
 * goals that add rotating sidecars append here.
 *
 * Exported for direct test coverage.
 */
export const COMPACTABLE_STORE_BASENAMES: readonly string[] = [
  "proactive-history.json",
  "reminder-history.json"
];

interface MaintenanceCompactOptions {
  readonly keepDays?: string;
  readonly museDir?: string;
  readonly archiveDir?: string;
  readonly dryRun?: boolean;
  readonly json?: boolean;
}

export interface CompactPlanEntry {
  readonly source: string;
  readonly destination: string;
  readonly mtimeMs: number;
}

/**
 * Pure planner — given the `~/.muse/` contents + a keep-days
 * filter, return the list of archive files to compact and where
 * each lands. Exported for direct unit testing so the gz
 * pipeline doesn't have to fire in the test path.
 */
export async function planActivityLogCompaction(args: {
  readonly museDir: string;
  readonly archiveDir: string;
  readonly nowMs: number;
  readonly keepDays?: number;
}): Promise<readonly CompactPlanEntry[]> {
  const entries: CompactPlanEntry[] = [];
  let dirContents: readonly string[];
  try {
    dirContents = await readdir(args.museDir);
  } catch {
    return entries;
  }
  const cutoffMs = typeof args.keepDays === "number" && args.keepDays > 0
    ? args.nowMs - args.keepDays * 24 * 60 * 60 * 1000
    : undefined;
  for (const name of dirContents) {
    // Match `<baseStore>.<n>` where baseStore is on the allow-list
    // and n is a positive integer. Anything else (regular JSON
    // files, temp scratch, unrelated sidecars) is skipped.
    if (!/^[A-Za-z0-9._-]+\.json\.\d+$/u.test(name)) continue;
    const baseStore = name.replace(/\.\d+$/u, "");
    if (!COMPACTABLE_STORE_BASENAMES.includes(baseStore)) continue;
    const source = join(args.museDir, name);
    let st: Awaited<ReturnType<typeof stat>>;
    try {
      st = await stat(source);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    if (cutoffMs !== undefined && st.mtimeMs > cutoffMs) continue;
    const stamp = new Date(st.mtimeMs).toISOString().replace(/[:.]/g, "-");
    const destination = join(args.archiveDir, `${name}.${stamp}.gz`);
    entries.push({ source, destination, mtimeMs: st.mtimeMs });
  }
  return entries;
}

async function gzCompact(source: string, destination: string): Promise<void> {
  const tmp = `${destination}.tmp`;
  await pipeline(createReadStream(source), createGzip(), createWriteStream(tmp, { mode: 0o600 }));
  const { rename } = await import("node:fs/promises");
  await rename(tmp, destination);
}

export function registerMaintenanceCommand(program: Command, io: ProgramIO): void {
  const maintenance = program.command("maintenance").description("Housekeeping for ~/.muse archives");

  maintenance
    .command("compact")
    .description("Rotate goal-079 archive sidecars (proactive-history.json.<n>, …) into ~/.muse/archive/*.gz")
    .option("--keep-days <n>", "Only compact archives older than N days (default: compact every numbered archive)")
    .option("--dry-run", "Print the plan without touching disk")
    .option("--json", "Emit a structured summary instead of a formatted list")
    .action(async (options: MaintenanceCompactOptions) => {
      const museDir = options.museDir ?? join(homedir(), ".muse");
      const archiveDir = options.archiveDir ?? join(museDir, "archive");
      // strict Number() so a "7d" unit-slip rejects instead of
      // silently becoming 7.
      const keepDays = options.keepDays !== undefined
        ? Number(options.keepDays.trim())
        : undefined;
      if (keepDays !== undefined && (!Number.isFinite(keepDays) || keepDays < 0)) {
        io.stderr(`--keep-days must be a non-negative number (got '${options.keepDays ?? ""}')\n`);
        process.exitCode = 1;
        return;
      }
      const plan = await planActivityLogCompaction({
        museDir,
        archiveDir,
        nowMs: Date.now(),
        ...(keepDays !== undefined ? { keepDays } : {})
      });
      if (plan.length === 0) {
        if (options.json) {
          io.stdout(`${JSON.stringify({ compacted: 0, plan: [] }, null, 2)}\n`);
        } else {
          io.stdout("(no archive sidecars match the compaction criteria)\n");
        }
        return;
      }
      if (options.dryRun) {
        if (options.json) {
          io.stdout(`${JSON.stringify({ dryRun: true, plan }, null, 2)}\n`);
          return;
        }
        for (const entry of plan) {
          io.stdout(`would compact ${basename(entry.source)} → ${entry.destination}\n`);
        }
        return;
      }
      await mkdir(archiveDir, { recursive: true });
      let compacted = 0;
      for (const entry of plan) {
        try {
          await gzCompact(entry.source, entry.destination);
          await unlink(entry.source);
          compacted += 1;
        } catch (cause) {
          io.stderr(`failed to compact ${entry.source}: ${cause instanceof Error ? cause.message : String(cause)}\n`);
        }
      }
      if (options.json) {
        io.stdout(`${JSON.stringify({ compacted, plan }, null, 2)}\n`);
      } else {
        io.stdout(`Compacted ${compacted.toString()} / ${plan.length.toString()} archive(s) into ${archiveDir}\n`);
      }
    });
}
