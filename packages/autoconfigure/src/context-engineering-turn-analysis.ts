/**
 * Turn-analysis: the package-level cores of the CLI's session-end learning that
 * the SERVER / daemon (which has no session-end) also needs — commitment →
 * check-in scanning and correction → preference inference over a turn's
 * messages. Split out of context-engineering-builders.ts; each is a pure
 * orchestration over the @muse/agent-core detectors + the persistence stores.
 */

import { collapseNearDuplicateCommitments, detectCorrections, detectUserCommitments, inferPreferenceFromCorrection, type SessionTurnLine } from "@muse/agent-core";
import { appendCheckins, readCheckins, scheduleCheckins, type PersistedCheckin } from "@muse/mcp";
import type { UserModelSlot } from "@muse/memory";

import { createGateEmbedder } from "./context-engineering-builders.js";

/**
 * Deterministic commitment → check-in scan over the turn's user messages — the
 * package-level core of the CLI's `scanSessionCheckins`, so the SERVER / daemon
 * (which has no session-end) also captures open-loops the user voices and
 * schedules the proactive check-in. No model: `detectUserCommitments` is a rule
 * pass and `scheduleCheckins` is deterministic (deduped, per-day capped,
 * quiet-hours applied at delivery). Returns the newly-scheduled check-ins.
 */
export async function scanCommitmentsFromTurns(
  userTurns: readonly string[],
  options: {
    readonly file: string;
    readonly userId: string;
    readonly now?: () => Date;
    /** Injected embedder for semantic near-duplicate collapse. Defaults to createGateEmbedder(process.env). */
    readonly embed?: (text: string) => Promise<readonly number[]>;
  }
): Promise<readonly PersistedCheckin[]> {
  const raw = detectUserCommitments(userTurns);
  if (raw.length === 0) return [];
  const embedder = options.embed ?? createGateEmbedder(process.env);
  const collapsed = await collapseNearDuplicateCommitments(raw, embedder).catch(() => raw);
  const commitments = collapsed.map((c) => c.text);
  const existing = await readCheckins(options.file).catch(() => []);
  const fresh = scheduleCheckins(commitments, {
    existing,
    now: (options.now ?? ((): Date => new Date()))(),
    userId: options.userId
  });
  await appendCheckins(options.file, fresh);
  return fresh;
}

/**
 * Infer stable preferences from corrections in the turn → upsert into the typed
 * user model (superseding by category). The package-level core of the CLI's
 * `inferSessionPreferences`, so the server/daemon learns the user's style too.
 * One local-model call per detected correction; NONE-aware (parseInferredPreference
 * rejects vacuous traits + requires a category), so it never fabricates a
 * preference. Returns `"value (category)"` for each preference learned.
 */
export async function inferPreferencesFromTurns(
  turns: readonly SessionTurnLine[],
  options: {
    readonly model: string;
    readonly modelProvider: Parameters<typeof inferPreferenceFromCorrection>[1]["modelProvider"];
    readonly store: { upsertUserModelSlot?: (userId: string, slot: UserModelSlot) => unknown };
    readonly userId: string;
    readonly now?: () => Date;
    /** Embedder for the held-out support gate; omitted ⇒ no gate (back-compat). */
    readonly embed?: (text: string) => Promise<readonly number[]>;
  }
): Promise<readonly string[]> {
  const upsert = options.store.upsertUserModelSlot;
  if (!upsert) return [];
  const exchanges = detectCorrections(turns);
  const added: string[] = [];
  for (const exchange of exchanges) {
    const pref = await inferPreferenceFromCorrection(exchange, {
      model: options.model,
      modelProvider: options.modelProvider,
      ...(options.embed ? { embed: options.embed } : {})
    });
    if (!pref || !pref.category) continue; // parseInferredPreference guarantees a category when it returns one
    await upsert(options.userId, {
      category: pref.category,
      confidence: pref.confidence,
      id: `pref-${pref.category}`, // supersede by category — a changed mind updates, not piles up
      kind: "preference",
      updatedAt: (options.now ?? ((): Date => new Date()))(),
      value: pref.value
    });
    added.push(`${pref.value} (${pref.category})`);
  }
  return added;
}
