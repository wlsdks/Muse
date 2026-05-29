/**
 * Pure data layer for recorded scoped consent
 * (`~/.muse/consents.json`).
 *
 * The act-as-the-user prerequisite (P5-b3, shared with P4): before
 * a standing objective may use the user's service credential to
 * perform an external action, the user must have recorded consent
 * for that exact {objective, scope}. The gate is fail-closed and
 * deterministic — absence of a consent record means "do not act",
 * never "ask the model".
 *
 * Same durability posture as personal-objectives-store /
 * personal-followups-store: atomic fsync+rename write, tolerant
 * read, corrupt store quarantined aside (never destroyed).
 */

import { promises as fs } from "node:fs";

import type { JsonObject } from "@muse/shared";

import { atomicWriteFile, withFileMutationQueue } from "./atomic-file-store.js";

export interface ScopedConsent {
  readonly id: string;
  /** User who granted the consent (~/.muse subscriber bucket). */
  readonly userId: string;
  /** The objective this consent authorises action for. */
  readonly objectiveId: string;
  /**
   * The narrow capability consented to, e.g.
   * `github:issues:write`. An action requesting a different scope
   * is NOT covered — consent is never broadened implicitly.
   */
  readonly scope: string;
  /** ISO timestamp the consent was recorded. */
  readonly grantedAt: string;
  /** Optional human note ("approved in chat 2026-05-19"). */
  readonly note?: string;
}

async function quarantineCorruptStore(file: string): Promise<void> {
  try {
    await fs.rename(file, `${file}.corrupt-${Date.now().toString()}`);
  } catch {
    // ignore — read still degrades to empty either way
  }
}

export async function readConsents(file: string): Promise<readonly ScopedConsent[]> {
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
    await quarantineCorruptStore(file);
    return [];
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { consents?: unknown }).consents)) {
    await quarantineCorruptStore(file);
    return [];
  }
  return (parsed as { consents: unknown[] }).consents.flatMap((entry): readonly ScopedConsent[] =>
    isScopedConsent(entry) ? [entry] : []
  );
}

export async function writeConsents(file: string, consents: readonly ScopedConsent[]): Promise<void> {
  // Atomic, fsync'd, owner-only write via the shared primitive (randomUUID tmp →
  // no same-ms rename-collision crash).
  await atomicWriteFile(file, `${JSON.stringify({ consents }, null, 2)}\n`);
}

/**
 * Record a consent grant. Idempotent on `id`: re-recording the
 * same id REPLACES (re-grant updates the note/timestamp without
 * duplicating).
 */
export async function recordConsent(file: string, consent: ScopedConsent): Promise<void> {
  // Serialise the read-modify-write: two concurrent grants must not each read
  // the same snapshot and clobber one another. A lost consent record is
  // outbound-safety-relevant (rule 5: standing objectives need RECORDED scoped
  // consent before acting toward a third party — a silently-dropped grant means
  // a later legitimate action is wrongly refused, or a concurrent write corrupts
  // the set the fail-closed check reads).
  await withFileMutationQueue(file, async () => {
    const existing = await readConsents(file);
    const filtered = existing.filter((entry) => entry.id !== consent.id);
    await writeConsents(file, [...filtered, consent]);
  });
}

/**
 * Fail-closed consent check: returns true ONLY when a consent
 * record matches the user, objective AND the exact scope. Any
 * read/parse problem degrades to `false` (no consent ⇒ no action)
 * — the safe direction for a guard.
 */
export async function hasConsent(
  file: string,
  query: { readonly userId: string; readonly objectiveId: string; readonly scope: string }
): Promise<boolean> {
  const all = await readConsents(file);
  return all.some(
    (c) => c.userId === query.userId && c.objectiveId === query.objectiveId && c.scope === query.scope
  );
}

export function serializeConsent(consent: ScopedConsent): JsonObject {
  return {
    grantedAt: consent.grantedAt,
    id: consent.id,
    objectiveId: consent.objectiveId,
    scope: consent.scope,
    userId: consent.userId,
    ...(consent.note ? { note: consent.note } : {})
  };
}

function isScopedConsent(value: unknown): value is ScopedConsent {
  if (!value || typeof value !== "object") {
    return false;
  }
  const c = value as ScopedConsent;
  return (
    typeof c.id === "string" &&
    typeof c.userId === "string" &&
    typeof c.objectiveId === "string" &&
    typeof c.scope === "string" &&
    typeof c.grantedAt === "string"
  );
}
