/**
 * Per-provider "last injected at" cursor for the agent-prompt
 * inbox-injection surface (Context Engineering Phase 2).
 *
 * Persists at `~/.muse/{providerId}-inbox-injection.json`. Schema is
 * versioned in-file so a v1 (single-user) install upgrades to v2
 * (multi-user) transparently on the first read.
 *
 * v1:
 *   { version: 1, lastInjectedAt: { [source]: ISO8601 } }
 * v2 (current):
 *   { version: 2, byUser: { [userKey]: { [source]: ISO8601 } } }
 *
 * `userKey` is the caller's `userId` or the literal `"_global"` when
 * `userId` is omitted (single-user install). v1 data is migrated into
 * the `_global` slot on read, preserving the cursor state without
 * forcing a manual file fix.
 *
 * "source" mirrors `InboundMessage.source` — chat / channel / user id.
 * Telegram has a single global source which we key as `"_global"`.
 */

import { promises as fs } from "node:fs";
import { dirname } from "node:path";

const GLOBAL_USER_KEY = "_global";

interface PersistedShapeV2 {
  readonly version: 2;
  readonly byUser: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

function userKey(userId: string | undefined): string {
  if (!userId) return GLOBAL_USER_KEY;
  const trimmed = userId.trim();
  return trimmed.length === 0 ? GLOBAL_USER_KEY : trimmed;
}

async function readPersisted(file: string): Promise<Readonly<Record<string, Readonly<Record<string, string>>>>> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object") {
    return {};
  }
  const versioned = parsed as { version?: unknown; byUser?: unknown; lastInjectedAt?: unknown };
  if (versioned.version === 2 && versioned.byUser && typeof versioned.byUser === "object") {
    const out: Record<string, Record<string, string>> = {};
    for (const [key, value] of Object.entries(versioned.byUser as Record<string, unknown>)) {
      if (value && typeof value === "object") {
        const inner: Record<string, string> = {};
        for (const [source, iso] of Object.entries(value as Record<string, unknown>)) {
          if (typeof iso === "string" && iso.trim().length > 0) {
            inner[source] = iso;
          }
        }
        out[key] = inner;
      }
    }
    return out;
  }
  // v1 migration: fold the flat map into the `_global` user slot.
  if (versioned.lastInjectedAt && typeof versioned.lastInjectedAt === "object") {
    const inner: Record<string, string> = {};
    for (const [source, iso] of Object.entries(versioned.lastInjectedAt as Record<string, unknown>)) {
      if (typeof iso === "string" && iso.trim().length > 0) {
        inner[source] = iso;
      }
    }
    return { [GLOBAL_USER_KEY]: inner };
  }
  return {};
}

async function writePersisted(
  file: string,
  byUser: Readonly<Record<string, Readonly<Record<string, string>>>>
): Promise<void> {
  const payload: PersistedShapeV2 = { byUser, version: 2 };
  const tmp = `${file}.tmp-${process.pid.toString()}-${Date.now().toString()}`;
  await fs.mkdir(dirname(file), { recursive: true });
  await fs.writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.rename(tmp, file);
}

export async function readInboxInjectionCursor(
  file: string,
  userId?: string
): Promise<Readonly<Record<string, string>>> {
  const byUser = await readPersisted(file);
  return byUser[userKey(userId)] ?? {};
}

export async function writeInboxInjectionCursor(
  file: string,
  cursor: Readonly<Record<string, string>>,
  userId?: string
): Promise<void> {
  const existing = await readPersisted(file);
  const sanitized: Record<string, string> = {};
  for (const [source, iso] of Object.entries(cursor)) {
    if (typeof iso === "string" && iso.trim().length > 0) {
      sanitized[source] = iso;
    }
  }
  const next = { ...existing, [userKey(userId)]: sanitized };
  await writePersisted(file, next);
}

/**
 * Merge an `advance` map into the persisted cursor for `userId`.
 * Each (source → iso) pair is only written when the new timestamp
 * is a strictly later instant than the existing one. Other users'
 * cursors are preserved untouched. Returns the merged cursor for
 * the supplied user so callers can avoid an extra read.
 */
export async function advanceInboxInjectionCursor(
  file: string,
  advance: Readonly<Record<string, string>>,
  userId?: string
): Promise<Readonly<Record<string, string>>> {
  const existing = await readPersisted(file);
  const key = userKey(userId);
  const current = existing[key] ?? {};
  const merged: Record<string, string> = { ...current };
  for (const [source, iso] of Object.entries(advance)) {
    // Compare parsed instants, not raw strings: lexicographic
    // ordering is wrong across mixed precision ("…01.500Z" sorts
    // BEFORE "…01Z") and timezone offsets, which would stall the
    // cursor and re-inject the same message every poll.
    const incoming = Date.parse(iso);
    if (Number.isNaN(incoming)) {
      continue;
    }
    const prior = merged[source];
    const priorTime = prior !== undefined ? Date.parse(prior) : Number.NaN;
    if (Number.isNaN(priorTime) || incoming > priorTime) {
      merged[source] = iso;
    }
  }
  const nextByUser = { ...existing, [key]: merged };
  await writePersisted(file, nextByUser);
  return merged;
}
