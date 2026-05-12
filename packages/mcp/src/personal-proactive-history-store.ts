/**
 * Append-only history of proactive surfacing fires. Mirror of
 * `personal-reminder-history-store` for the proactive daemon —
 * records every delivery attempt (success or failure) by
 * `runDueProactiveNotices` so the user / agent can audit
 * "did Muse actually push the 3pm meeting notice?" weeks later.
 *
 * Lives alongside the dedupe sidecar (`proactive-fired.json`) but
 * the two files have different jobs: the sidecar is a key-set the
 * daemon checks before firing; the history is an append-only audit
 * log with the delivered text + error context for failure triage.
 *
 * Shape: `{ version: 1, entries: HistoryEntry[] }`. Atomic
 * tmp+rename writes, capped at `capacity` newest entries (default
 * 500). The cap is enforced on append — `readHistory` doesn't trim.
 * Missing / malformed file → empty array (idempotent first-read).
 */

import { promises as fs } from "node:fs";
import { dirname } from "node:path";

import type { ProactiveFiredKind } from "./proactive-notice-loop.js";

export interface ProactiveHistoryEntry {
  /** "calendar" | "task" — same union the dedupe sidecar uses. */
  readonly kind: ProactiveFiredKind;
  /** Provider-reported event id, or task id. */
  readonly itemId: string;
  /** Event startsAt / task dueAt (ISO). */
  readonly startIso: string;
  /** Item title at the time of firing (event title or task title). */
  readonly title: string;
  /** Resolved messaging provider for this fire. */
  readonly providerId: string;
  /** Resolved messaging destination for this fire. */
  readonly destination: string;
  /** Text actually delivered (flat or agent-synthesized — Phase D). */
  readonly text: string;
  /** When the delivery was attempted. */
  readonly firedAtIso: string;
  readonly status: "delivered" | "failed";
  readonly error?: string;
}

interface PersistedShape {
  readonly version: 1;
  readonly entries: readonly ProactiveHistoryEntry[];
}

const DEFAULT_CAPACITY = 500;
const MAX_CAPACITY = 5_000;
const DEFAULT_READ_LIMIT = 100;
const MAX_READ_LIMIT = 500;

export async function readProactiveHistory(file: string, limit?: number): Promise<readonly ProactiveHistoryEntry[]> {
  const cap = clampReadLimit(limit);
  const all = await readRaw(file);
  // Stored newest-last; surface newest-first like inbox-store + reminder-history do.
  return [...all].reverse().slice(0, cap);
}

export interface AppendProactiveHistoryOptions {
  readonly capacity?: number;
}

export async function appendProactiveHistory(
  file: string,
  entry: ProactiveHistoryEntry,
  options: AppendProactiveHistoryOptions = {}
): Promise<void> {
  const capacity = clampCapacity(options.capacity);
  const existing = await readRaw(file);
  const next = [...existing, entry];
  const trimmed = next.length > capacity ? next.slice(next.length - capacity) : next;
  const payload: PersistedShape = { entries: trimmed, version: 1 };
  const tmp = `${file}.tmp-${process.pid.toString()}-${Date.now().toString()}`;
  await fs.mkdir(dirname(file), { recursive: true });
  await fs.writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.rename(tmp, file);
}

async function readRaw(file: string): Promise<readonly ProactiveHistoryEntry[]> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { entries?: unknown }).entries)) {
    return [];
  }
  return (parsed as { entries: unknown[] }).entries.flatMap((entry): readonly ProactiveHistoryEntry[] =>
    isHistoryEntry(entry) ? [entry] : []
  );
}

function clampReadLimit(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw)) {
    return DEFAULT_READ_LIMIT;
  }
  return Math.max(1, Math.min(MAX_READ_LIMIT, Math.trunc(raw)));
}

function clampCapacity(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw)) {
    return DEFAULT_CAPACITY;
  }
  return Math.max(1, Math.min(MAX_CAPACITY, Math.trunc(raw)));
}

function isHistoryEntry(value: unknown): value is ProactiveHistoryEntry {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as ProactiveHistoryEntry;
  return (candidate.kind === "calendar" || candidate.kind === "task")
    && typeof candidate.itemId === "string"
    && typeof candidate.startIso === "string"
    && typeof candidate.title === "string"
    && typeof candidate.providerId === "string"
    && typeof candidate.destination === "string"
    && typeof candidate.text === "string"
    && typeof candidate.firedAtIso === "string"
    && (candidate.status === "delivered" || candidate.status === "failed");
}
