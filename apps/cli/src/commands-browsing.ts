/**
 * `muse browsing` — 100% local, opt-in Chrome browsing-history ingest.
 *
 *   muse browsing sync                  read new visits since the cursor into ~/.muse/browsing.json
 *   muse browsing search <query> [--limit N]
 *   muse browsing recent [--limit N]
 *
 * Running `muse browsing sync` IS the consent: nothing reads the browser
 * history until the user asks. The archive lives at `~/.muse/browsing.json`
 * (mode 0o600) so search / recall never re-touch the live Chrome file.
 */

import { stripUntrustedTerminalChars } from "@muse/shared";
import {
  compareBrowsingVisitsNewestFirst,
  defaultBrowsingFile,
  locateChromeHistoryFile,
  mergeBrowsingVisits,
  readBrowsingStore,
  readChromeHistoryVisits,
  searchBrowsingVisits,
  writeBrowsingStore,
  type BrowsingVisit
} from "@muse/recall";
import type { Command } from "commander";

import type { ProgramIO } from "./program.js";

/** Max visits read from Chrome per `sync` run — bounds a single pass over a large History file. */
export const BROWSING_SYNC_LIMIT = 2000;

/**
 * Human-readable line for one visit. `title` / `url` are page-controlled
 * (an attacker can set a page's <title>), so they get the same ESC/C0/C1/DEL
 * strip + whitespace-collapse the feeds / inbox surfaces apply before any
 * terminal print.
 */
export function formatBrowsingVisitLines(visit: {
  readonly title: string;
  readonly url: string;
  readonly visitedAt: string;
}): readonly string[] {
  const clean = (value: string): string => stripUntrustedTerminalChars(value).replace(/\s+/gu, " ").trim();
  const lines = [`${clean(visit.title) || "(no title)"} — ${clean(visit.visitedAt) || "(no date)"}`];
  const url = clean(visit.url);
  if (url) lines.push(`  ${url}`);
  return lines;
}

/**
 * Strict `--limit` parse: absent → fallback; a non-numeric / unit-slip /
 * non-positive value rejects rather than silently defaulting; a genuine
 * number truncates + clamps to `cap`.
 */
export function parseBrowsingLimit(raw: string | undefined, fallback: number, cap: number): number {
  if (raw === undefined || raw.trim().length === 0) {
    return fallback;
  }
  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`--limit must be a positive number (got '${raw}')`);
  }
  return Math.min(cap, Math.trunc(parsed));
}

/** Exact WebKit-epoch µs of a visit, parsed from the `<micros>-<hash>` id — 0 when unparseable. */
function cursorFromVisit(visit: BrowsingVisit): number {
  const prefix = visit.id.split("-")[0];
  const micros = Number(prefix);
  return Number.isFinite(micros) ? micros : 0;
}

export function registerBrowsingCommand(program: Command, io: ProgramIO): void {
  const browsing = program
    .command("browsing")
    .description("Local, opt-in Chrome browsing-history ingest + search (never leaves your machine)");

  browsing
    .command("sync")
    .description("Read new Chrome visits since the last sync into the local archive")
    .action(async () => {
      const historyFile = await locateChromeHistoryFile();
      if (!historyFile) {
        io.stderr("muse browsing sync: Chrome history not found — set MUSE_CHROME_HISTORY_FILE (or MUSE_CHROME_PROFILE) to point at your History file\n");
        process.exitCode = 1;
        return;
      }
      const file = defaultBrowsingFile();
      const store = await readBrowsingStore(file);
      const incoming = await readChromeHistoryVisits(historyFile, {
        sinceVisitTime: store.lastVisitTimeCursor,
        limit: BROWSING_SYNC_LIMIT
      });
      const visits = mergeBrowsingVisits(store.visits, incoming);
      const nextCursor = incoming.reduce((max, v) => Math.max(max, cursorFromVisit(v)), store.lastVisitTimeCursor);
      await writeBrowsingStore(file, { version: store.version, visits, lastVisitTimeCursor: nextCursor });
      io.stdout(`synced ${incoming.length.toString()} new visits (total ${visits.length.toString()})\n`);
    });

  browsing
    .command("search")
    .description("Search the local browsing archive by keyword (title + url), newest-first")
    .argument("<query...>", "Keyword(s) to match (joined by spaces; case-insensitive substring)")
    .option("--limit <n>", "Max matches (default 20, cap 100)")
    .option("--json", "Emit a structured payload")
    .action(async (queryParts: readonly string[], options: { readonly limit?: string; readonly json?: boolean }) => {
      const query = queryParts.join(" ").trim();
      if (query.length === 0) {
        io.stderr("muse browsing search: query is required\n");
        process.exitCode = 1;
        return;
      }
      const limit = parseBrowsingLimit(options.limit, 20, 100);
      const store = await readBrowsingStore(defaultBrowsingFile());
      const hits = searchBrowsingVisits(store.visits, query, limit);
      if (options.json) {
        io.stdout(`${JSON.stringify({ query, total: hits.length, visits: hits }, null, 2)}\n`);
        return;
      }
      if (hits.length === 0) {
        io.stdout(`(no visits match "${query}" — try a different keyword or run \`muse browsing sync\`)\n`);
        return;
      }
      for (const hit of hits) {
        for (const line of formatBrowsingVisitLines(hit)) io.stdout(`${line}\n`);
      }
    });

  browsing
    .command("recent")
    .description("Show the newest N visits in the local archive")
    .option("--limit <n>", "How many to show (default 20, cap 100)")
    .option("--json", "Emit a structured payload")
    .action(async (options: { readonly limit?: string; readonly json?: boolean }) => {
      const limit = parseBrowsingLimit(options.limit, 20, 100);
      const store = await readBrowsingStore(defaultBrowsingFile());
      const recent = [...store.visits].sort(compareBrowsingVisitsNewestFirst).slice(0, limit);
      if (options.json) {
        io.stdout(`${JSON.stringify({ total: recent.length, visits: recent }, null, 2)}\n`);
        return;
      }
      if (recent.length === 0) {
        io.stdout("(no visits yet — run `muse browsing sync`)\n");
        return;
      }
      for (const visit of recent) {
        for (const line of formatBrowsingVisitLines(visit)) io.stdout(`${line}\n`);
      }
    });
}
