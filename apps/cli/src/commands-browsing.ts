/**
 * `muse browsing` — 100% local, opt-in Chrome browsing-history ingest.
 *
 *   muse browsing sync                  read new visits since the cursor into ~/.muse/browsing.json
 *   muse browsing search <query> [--limit N]
 *   muse browsing recent [--limit N]
 *
 * Consent is explicit either way: nothing reads the browser history until
 * the user runs `muse browsing sync` OR sets `MUSE_BROWSING_AUTO_SYNC=true`
 * (the daemon's standing opt-in; off by default and pinned by test). The
 * archive lives at `~/.muse/browsing.json` (mode 0o600) so search / recall
 * never re-touch the live Chrome file.
 */

import { stripUntrustedTerminalChars } from "@muse/shared";
import {
  BROWSING_SYNC_LIMIT,
  compareBrowsingVisitsNewestFirst,
  defaultBrowsingFile,
  locateChromeHistoryFile,
  readBrowsingStore,
  searchBrowsingVisits,
  syncBrowsingHistory
} from "@muse/recall";
import type { Command } from "commander";

import { defaultEmbedModel } from "./council-corpus.js";
import { embed } from "./embed.js";
import type { ProgramIO } from "./program.js";

export { BROWSING_SYNC_LIMIT };

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
 * One matched visit reshaped as a citation, in the SAME field shape `muse
 * ask --json`'s `grounded.noteChunks` uses (`score` alongside the source
 * identity) — parity across surfaces so a script consuming either JSON
 * output can treat a "grounded source" uniformly. `score` is always `1`:
 * unlike ask's cosine-ranked notes, a browsing-search hit is a literal
 * substring match against the user's own local archive, not an LLM claim
 * that could be partially supported — every citation returned here is
 * verifiably real, hence full confidence.
 */
export interface BrowsingCitation {
  readonly url: string;
  readonly title: string;
  readonly visitedAt: string;
  readonly score: 1;
}

/**
 * `ask --json`'s `groundedVerdict` is the rubric's judgment on a GENERATED
 * answer ("grounded" | "ungrounded" | "abstain" | ...). `browsing search`
 * never generates an answer — it returns literal archive matches — so only
 * two of those labels apply honestly: `"grounded"` when at least one real
 * citation backs the query, `"abstain"` when the local archive has nothing
 * (there is no claim to fabricate, so "ungrounded" cannot occur here).
 */
export function browsingGroundedVerdict(hitCount: number): "grounded" | "abstain" {
  return hitCount > 0 ? "grounded" : "abstain";
}

export function toBrowsingCitations(
  hits: readonly { readonly url: string; readonly title: string; readonly visitedAt: string }[]
): readonly BrowsingCitation[] {
  return hits.map((h) => ({ url: h.url, title: h.title, visitedAt: h.visitedAt, score: 1 }));
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
      const { synced, total } = await syncBrowsingHistory({
        // Embed titles at ingest so cross-lingual recall works later; localhost-only,
        // per-visit fail-soft (Ollama down ⇒ visits still ingest, just unembedded).
        embed: (text) => embed(text, defaultEmbedModel(process.env)),
        historyFile,
        limit: BROWSING_SYNC_LIMIT,
        storeFile: defaultBrowsingFile()
      });
      io.stdout(`synced ${synced.toString()} new visits (total ${total.toString()})\n`);
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
        // `visits` stays for existing consumers (additive, not a breaking
        // change); `groundedVerdict` + `grounded.citations` are new and match
        // `muse ask --json`'s grounded-block contract (see BrowsingCitation).
        io.stdout(`${JSON.stringify({
          query,
          total: hits.length,
          visits: hits,
          groundedVerdict: browsingGroundedVerdict(hits.length),
          grounded: { citations: toBrowsingCitations(hits) }
        }, null, 2)}\n`);
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
