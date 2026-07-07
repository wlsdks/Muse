/**
 * Pure data layer for `~/.muse/browsing.json` — the local archive of
 * Chrome browsing history the user has explicitly ingested. Shape:
 *
 *   { version: 1,
 *     visits: [ { id, url, title, visitedAt } ],
 *     lastVisitTimeCursor: <WebKit-epoch µs of the newest visit> }
 *
 * Tolerant reads (missing / malformed → empty), atomic writes via
 * tmp + rename + 0o600. This data is SENSITIVE (every page the user
 * visited), so the 0o600 owner-only mode is a hard requirement, not a
 * nicety — mirrors the rest of the personal stores.
 */

import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

import { backupVersionMismatchedStore } from "./store-version-backup.js";

export const BROWSING_STORE_SCHEMA_VERSION = 1;

export interface BrowsingVisit {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  /** ISO 8601 timestamp of the visit. */
  readonly visitedAt: string;
}

export interface BrowsingStore {
  readonly version: typeof BROWSING_STORE_SCHEMA_VERSION;
  readonly visits: readonly BrowsingVisit[];
  /**
   * WebKit-epoch microseconds of the newest ingested visit (0 when the
   * store is empty). The next `muse browsing sync` reads only visits
   * strictly newer than this, so a re-sync is incremental — it never
   * re-scans the whole History file.
   */
  readonly lastVisitTimeCursor: number;
}

/**
 * Chrome's `visit_time` counts MICROSECONDS since 1601-01-01T00:00:00Z
 * (the WebKit / Windows FILETIME epoch), NOT the Unix epoch. The offset
 * between the two epochs is 11 644 473 600 000 ms. Pure + exported so a
 * known-answer test pins the conversion.
 */
const WEBKIT_TO_UNIX_EPOCH_OFFSET_MS = 11_644_473_600_000;

export function webkitTimeToIso(micros: number): string {
  const unixMs = micros / 1000 - WEBKIT_TO_UNIX_EPOCH_OFFSET_MS;
  return new Date(unixMs).toISOString();
}

export function isoToWebkitTime(iso: string): number {
  const unixMs = Date.parse(iso);
  return (unixMs + WEBKIT_TO_UNIX_EPOCH_OFFSET_MS) * 1000;
}

export function defaultBrowsingFile(): string {
  const fromEnv = process.env.MUSE_BROWSING_FILE?.trim();
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return join(homedir(), ".muse", "browsing.json");
}

function emptyStore(): BrowsingStore {
  return { version: BROWSING_STORE_SCHEMA_VERSION, visits: [], lastVisitTimeCursor: 0 };
}

export async function readBrowsingStore(file: string): Promise<BrowsingStore> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return emptyStore();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyStore();
  }
  if (!parsed || typeof parsed !== "object") {
    return emptyStore();
  }
  const candidate = parsed as Partial<BrowsingStore>;
  if (candidate.version !== BROWSING_STORE_SCHEMA_VERSION) {
    await backupVersionMismatchedStore(file, candidate.version);
    return emptyStore();
  }
  const visits = (candidate.visits ?? []).filter(
    (v): v is BrowsingVisit =>
      Boolean(v) &&
      typeof v === "object" &&
      typeof (v as BrowsingVisit).id === "string" &&
      typeof (v as BrowsingVisit).url === "string" &&
      typeof (v as BrowsingVisit).title === "string" &&
      typeof (v as BrowsingVisit).visitedAt === "string"
  );
  const cursor =
    typeof candidate.lastVisitTimeCursor === "number" && Number.isFinite(candidate.lastVisitTimeCursor)
      ? candidate.lastVisitTimeCursor
      : 0;
  return { version: BROWSING_STORE_SCHEMA_VERSION, visits, lastVisitTimeCursor: cursor };
}

export async function writeBrowsingStore(file: string, store: BrowsingStore): Promise<void> {
  await fs.mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid.toString()}-${Date.now().toString()}`;
  await fs.writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.rename(tmp, file);
  await fs.chmod(file, 0o600).catch(() => undefined);
}

/**
 * Default cap on retained visits. A power user can accrue tens of
 * thousands of visits a month; keeping every historical row would bloat
 * `~/.muse/browsing.json` without serving recall. 5000 visits ×
 * ~200 bytes ≈ 1MB — a generous tail for "that page I read last week"
 * while bounding worst-case disk + search cost.
 */
export const DEFAULT_BROWSING_VISITS_CAP = 5000;

/**
 * Merge `incoming` (a fresh sync) into `previous` (the on-disk
 * archive). Dedup key is `visit.id` — incoming wins. Sort is
 * newest-first by `visitedAt`; the list is sliced to `cap`. Pure — no
 * IO, no `Date.now()` — so the unit test pins every branch.
 */
export function mergeBrowsingVisits(
  previous: readonly BrowsingVisit[],
  incoming: readonly BrowsingVisit[],
  cap: number = DEFAULT_BROWSING_VISITS_CAP
): readonly BrowsingVisit[] {
  const byId = new Map<string, BrowsingVisit>();
  for (const visit of previous) {
    if (visit.id) byId.set(visit.id, visit);
  }
  for (const visit of incoming) {
    if (visit.id) byId.set(visit.id, visit);
  }
  const merged = [...byId.values()].sort(compareBrowsingVisitsNewestFirst);
  const effectiveCap =
    Number.isFinite(cap) && cap > 0 ? Math.trunc(cap) : DEFAULT_BROWSING_VISITS_CAP;
  return merged.slice(0, effectiveCap);
}

/**
 * Newest-first order with a consistent tie-break so the comparator is
 * antisymmetric (V8 requires it): equal timestamps fall back to a
 * descending id compare; an unparseable date sorts to the tail.
 */
export function compareBrowsingVisitsNewestFirst(a: BrowsingVisit, b: BrowsingVisit): number {
  const ta = Date.parse(a.visitedAt);
  const tb = Date.parse(b.visitedAt);
  if (!Number.isFinite(ta) && !Number.isFinite(tb)) return b.id.localeCompare(a.id);
  if (!Number.isFinite(ta)) return 1;
  if (!Number.isFinite(tb)) return -1;
  return tb - ta || b.id.localeCompare(a.id);
}

/**
 * Case-insensitive substring search over each visit's title + url,
 * newest-first, capped at `limit`. Pure (no IO) so a unit test pins
 * matching + ordering.
 */
export function searchBrowsingVisits(
  visits: readonly BrowsingVisit[],
  query: string,
  limit: number
): readonly BrowsingVisit[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return [];
  }
  const hits = visits.filter(
    (v) => v.title.toLowerCase().includes(needle) || v.url.toLowerCase().includes(needle)
  );
  return [...hits].sort(compareBrowsingVisitsNewestFirst).slice(0, Math.max(1, limit));
}
