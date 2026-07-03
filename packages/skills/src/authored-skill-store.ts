/**
 * Agent-authored skill persistence. Skills Muse writes about ITSELF
 * (from session-end review) live here, separate from human-authored
 * user/workspace skills. Execute-gated by type: a SkillDraft carries
 * only name/description/body, so an authored skill can never declare
 * requires.bins — muse.skills.run therefore refuses to execute it
 * until a human promotes it. Durability mirrors the plan-cache store
 * (atomic fsync+rename, 0600).
 */

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";

import { FileSystemSkillLoader } from "./skill-loader.js";
import { parseSkillFile } from "./skill-parser.js";
import type { Skill } from "./skill-contract.js";

export interface SkillDraft {
  readonly name: string;
  readonly description: string;
  readonly body: string;
}

export type AuthorAction = "create" | "patch" | "skip" | "quarantined";

export interface SkillRiskScan {
  readonly flagged: boolean;
  readonly reasons: readonly string[];
}

/**
 * Defense-in-depth for AUTO-authored skill bodies: they are distilled by the
 * local model from corrections that can echo UNTRUSTED tool output, then
 * auto-injected into later prompts. A poisoned body could carry a persistent
 * prompt-injection or a copy-paste-dangerous command. High-precision patterns
 * only — a normal procedural skill won't match — so a flag is a real signal,
 * not noise. The store quarantines a flagged body instead of activating it.
 *
 * Pattern adapted from OpenClaw's skill-workshop scan-before-activate (MIT) —
 * deterministic reimplementation for Muse, no code copied. See THIRD_PARTY_NOTICES.md.
 */
const SKILL_RISK_PATTERNS: readonly { readonly label: string; readonly re: RegExp }[] = [
  { label: "prompt-injection", re: /\bignore\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|earlier|above)\s+(?:instructions?|prompts?)\b/iu },
  { label: "prompt-injection", re: /\bdisregard\s+(?:the\s+)?(?:above|prior|previous|earlier|system)\b/iu },
  { label: "prompt-injection", re: /\b(?:reveal|print|repeat|leak|show)\s+(?:me\s+)?(?:the\s+|your\s+)?system\s+prompt\b/iu },
  { label: "dangerous-shell", re: /\brm\s+-rf\b/iu },
  { label: "dangerous-shell", re: /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sh|bash|zsh)\b/iu },
  { label: "dangerous-shell", re: /:\s*\(\s*\)\s*\{[^}]*\|[^}]*&\s*\}\s*;/u },
  { label: "embedded-secret", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/u },
  { label: "embedded-secret", re: /\bAKIA[0-9A-Z]{16}\b/u }
];

export function scanSkillBodyForRisks(body: string): SkillRiskScan {
  const reasons: string[] = [];
  for (const { label, re } of SKILL_RISK_PATTERNS) {
    if (re.test(body) && !reasons.includes(label)) reasons.push(label);
  }
  return { flagged: reasons.length > 0, reasons };
}

export interface AuthoredSkillStoreOptions {
  readonly dir: string;
  readonly maxSkills?: number;
  /** Non-authored skill names, best-effort, for collision suffixing. */
  readonly existingNames?: () => readonly string[];
  readonly now?: () => Date;
  /** 0..1 similarity used for create-vs-patch. Default: local Jaccard. */
  readonly similarity?: (a: string, b: string) => number;
  /** Pre-mutation snapshot ring size (see {@link DEFAULT_SKILL_SNAPSHOT_RING_SIZE}). */
  readonly snapshotRingSize?: number;
}

export const DEFAULT_MAX_AUTHORED_SKILLS = 30;
const PATCH_SIMILARITY_THRESHOLD = 0.6;

export function slugifySkillName(name: string): string {
  const slug = name.trim().toLowerCase().replace(/\s+/gu, "-").replace(/[^a-z0-9-]+/gu, "");
  return slug.length > 0 ? slug.slice(0, 64) : "skill";
}

export function serializeAuthoredSkill(draft: SkillDraft, authoredAt: string, lastUsedAt?: string): string {
  const muse: Record<string, unknown> = { authored: true, authoredAt };
  if (lastUsedAt) muse.lastUsedAt = lastUsedAt;
  const metadata = JSON.stringify({ muse });
  return `---\nname: ${draft.name}\ndescription: ${draft.description}\nmetadata: ${metadata}\n---\n\n${draft.body.trim()}\n`;
}

/** Content tokens (lowercased, len≥3, split on non-alphanumeric) — shared by the
 *  name/description Jaccard match and the body-subsumption check. */
function skillContentTokens(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((x) => x.length >= 3));
}

function defaultSimilarity(a: string, b: string): number {
  const sa = skillContentTokens(a);
  const sb = skillContentTokens(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter += 1;
  return inter / (sa.size + sb.size - inter);
}

/** Containment ratio at/above which a draft skill body counts as already covered.
 *  High (0.85) on purpose: only a near-TOTAL subset is skipped, so a draft that adds
 *  even a couple of genuinely new procedure tokens still authors — the false-skip tail
 *  (a short draft whose few tokens all happen to appear in a long skill) is bounded,
 *  and a skip is non-destructive (returns the existing skill, writes nothing). */
export const DEFAULT_SKILL_SUBSUMPTION_CONTAINMENT = 0.85;

/**
 * Is the `draftBody` (near-)entirely COVERED by `existingBody`? Voyager-style skill-
 * library novelty gate (arXiv:2305.16291): a newly-distilled skill whose procedure is
 * a subset of one already authored is a redundant near-duplicate. DIRECTIONAL
 * (containment `|draft ∩ existing| / |draft|`), unlike the symmetric name/description
 * Jaccard — so a redundant SUBSET draft is caught while a richer SUPERSET new skill is
 * never suppressed. Fail-OPEN: an empty body can't be judged → not subsumed (allow the
 * write). Pure + exported for direct coverage.
 */
export function skillBodyIsSubsumed(
  draftBody: string,
  existingBody: string,
  options: { readonly minContainment?: number } = {}
): boolean {
  const minContainment = Number.isFinite(options.minContainment) ? options.minContainment! : DEFAULT_SKILL_SUBSUMPTION_CONTAINMENT;
  const draft = skillContentTokens(draftBody);
  const existing = skillContentTokens(existingBody);
  if (draft.size === 0 || existing.size === 0) return false;
  let intersection = 0;
  for (const token of draft) {
    if (existing.has(token)) intersection += 1;
  }
  return intersection / draft.size >= minContainment;
}

/** Neutralise volatile timestamps so an unchanged content re-write is idempotent. */
function stripTimestamps(text: string): string {
  return text
    .replace(/"authoredAt":"[^"]*"/u, '"authoredAt":""')
    .replace(/"lastUsedAt":"[^"]*"/u, '"lastUsedAt":""')
    .trim();
}

async function writeFileAtomic(filePath: string, text: string): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid.toString()}-${Date.now().toString()}`;
  const handle = await fs.open(tmp, "w", 0o600);
  try {
    await handle.writeFile(text, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, filePath);
  await fs.chmod(filePath, 0o600).catch(() => undefined);
}

/** A skill projected to the signals that decide cap-overflow eviction order. */
export interface SkillEvictionEntry {
  readonly name: string;
  /** Has the skill ever been used (a `lastUsedAt` recorded)? */
  readonly used: boolean;
  /** Epoch-ms of last use, or authoredAt when never used. */
  readonly lastActiveMs: number;
}

/**
 * Eviction order (lowest-utility FIRST) for the authored-skill cap — value-aware,
 * not FIFO-by-age (SkillOps arXiv:2605.13716 utility-driven retire; TinyLFU
 * arXiv:1512.00727 value-aware cache eviction): a NEVER-used skill is evicted
 * before any ever-used one, ties broken least-recently-active first (LRU). So a
 * heavily-used old skill survives a never-used newer one. With no usage data
 * `lastActiveMs` is `authoredAt`, so it degrades to FIFO (strict superset, no
 * regression). Pure + exported for direct coverage.
 */
export function rankSkillsForEviction(entries: readonly SkillEvictionEntry[]): readonly string[] {
  return [...entries]
    .sort((a, b) => (Number(a.used) - Number(b.used)) || (a.lastActiveMs - b.lastActiveMs))
    .map((entry) => entry.name);
}

/**
 * Minimal, duck-typed shape of a scheduled job / standing objective that
 * might still need a skill to exist. Deliberately NOT imported from
 * `@muse/scheduler` — every field is optional and structurally compatible
 * with `ScheduledJob`, so a caller can pass real scheduler/objective records
 * straight through without this package taking a build dependency on
 * `packages/scheduler`.
 */
export interface SkillReferencingJob {
  readonly enabled?: boolean;
  readonly name?: string;
  readonly description?: string;
  readonly agentPrompt?: string;
  readonly toolArguments?: unknown;
  readonly tags?: readonly string[];
}

/**
 * Is `skill` still named by any job (scheduled job or standing objective)?
 * A referenced skill is exempt from idle pruning even at zero uses — mirrors
 * Hermes Agent curator's cron-reference exemption (`_cron_referenced_skills`,
 * MIT), which DELIBERATELY includes paused/disabled jobs too: "resuming or
 * the next fire must find it" — a job disabled today may be re-enabled
 * tomorrow, and a skill archived out from under it in the meantime is a
 * silent regression the user never asked for. So `enabled` is intentionally
 * NOT used to filter here (kept on the type for callers/future use, e.g.
 * surfacing which references are live vs. dormant).
 *
 * KNOWN LIMITATION: Muse has no structured skill<->job link today (no
 * `skillId` field on `ScheduledJob`), so this is a conservative
 * case-insensitive, word-boundary SUBSTRING match of the skill's name
 * against free-text job fields (`name`/`description`/`agentPrompt`/`tags`/
 * stringified `toolArguments`). Consequences: (a) a job that paraphrases a
 * skill instead of naming it produces a false negative (skill still gets
 * pruned) — acceptable, matches today's un-exempted behavior; (b) a job
 * whose text happens to mention the skill's name in an unrelated sense
 * produces a false positive (skill over-exempted) — the safe direction,
 * since over-retaining a skill costs disk, not correctness. Replace with an
 * exact `skillId` match the day a structured link exists.
 */
export function referencedByScheduledJob(skill: Skill, jobs: readonly SkillReferencingJob[]): boolean {
  const needle = skill.name.trim().toLowerCase();
  if (needle.length === 0) return false;
  const pattern = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\b`, "iu");
  for (const job of jobs) {
    const haystacks: unknown[] = [job.name, job.description, job.agentPrompt, ...(job.tags ?? [])];
    if (job.toolArguments !== undefined) {
      try {
        haystacks.push(JSON.stringify(job.toolArguments));
      } catch {
        // non-serializable arguments — ignore, other fields still checked
      }
    }
    for (const text of haystacks) {
      if (typeof text === "string" && pattern.test(text)) return true;
    }
  }
  return false;
}

/** One archived-content record inside a {@link SkillSnapshot}. */
export interface SkillSnapshotEntry {
  readonly name: string;
  readonly slug: string;
  readonly contentHash: string;
  readonly content: string;
}

/** A pre-mutation snapshot taken before `curate`/`consolidate` archives skills. */
export interface SkillSnapshot {
  readonly id: string;
  readonly createdAt: string;
  readonly entries: readonly SkillSnapshotEntry[];
}

/**
 * Snapshot ring size: how many pre-mutation snapshots are kept before the
 * oldest is pruned. 5 mirrors Hermes Agent curator_backup's `DEFAULT_KEEP`
 * — enough undo history to cover several curate/consolidate ticks (this
 * store already ticks at most a few times a day) without unbounded disk
 * growth from a snapshot format that stores full skill content per entry.
 */
export const DEFAULT_SKILL_SNAPSHOT_RING_SIZE = 5;

export class AuthoredSkillStore {
  private readonly dir: string;
  private readonly maxSkills: number;
  private readonly existingNames: () => readonly string[];
  private readonly now: () => Date;
  private readonly similarity: (a: string, b: string) => number;
  private readonly snapshotRingSize: number;

  constructor(options: AuthoredSkillStoreOptions) {
    this.dir = options.dir;
    this.maxSkills = options.maxSkills ?? DEFAULT_MAX_AUTHORED_SKILLS;
    this.existingNames = options.existingNames ?? (() => []);
    this.now = options.now ?? (() => new Date());
    this.similarity = options.similarity ?? defaultSimilarity;
    this.snapshotRingSize = options.snapshotRingSize ?? DEFAULT_SKILL_SNAPSHOT_RING_SIZE;
  }

  async listAuthored(): Promise<readonly Skill[]> {
    return new FileSystemSkillLoader({ roots: [{ path: this.dir, source: "authored" }] }).loadAll();
  }

  async writeOrPatch(draft: SkillDraft): Promise<{ action: AuthorAction; skill: Skill; reasons?: readonly string[] }> {
    const scan = scanSkillBodyForRisks(draft.body);
    if (scan.flagged) {
      const filePath = join(this.dir, ".quarantine", slugifySkillName(draft.name), "SKILL.md");
      await writeFileAtomic(filePath, serializeAuthoredSkill(draft, this.now().toISOString()));
      return { action: "quarantined", reasons: scan.reasons, skill: await parseSkillFile(filePath, { source: "authored" }) };
    }
    const authored = await this.listAuthored();
    const match = authored.find(
      (s) =>
        s.name === draft.name ||
        this.similarity(`${s.name} ${s.description}`, `${draft.name} ${draft.description}`) >=
          PATCH_SIMILARITY_THRESHOLD
    );
    if (match) {
      const text = serializeAuthoredSkill(
        { name: match.name, description: draft.description, body: draft.body },
        this.now().toISOString()
      );
      const existing = await fs.readFile(match.sourceInfo.filePath, "utf8").catch(() => "");
      if (stripTimestamps(existing) === stripTimestamps(text)) {
        return { action: "skip", skill: match };
      }
      await writeFileAtomic(match.sourceInfo.filePath, text);
      return { action: "patch", skill: await this.reload(match.name) };
    }
    // Write-time SUBSUMPTION dedup (Voyager skill-library novelty gate,
    // arXiv:2305.16291): the name/description match above is symmetric Jaccard and
    // never inspects the BODY, so a draft with a fresh name whose PROCEDURE is a
    // subset of an existing skill would author a near-duplicate (the curator only
    // cleans that up later at idle cost). If an existing authored skill already
    // covers this draft's body, skip the redundant write.
    const subsumer = authored.find((s) => skillBodyIsSubsumed(draft.body, s.body));
    if (subsumer) {
      return { action: "skip", skill: subsumer };
    }
    const name = this.dedupeName(draft.name);
    const slug = slugifySkillName(name);
    const filePath = join(this.dir, slug, "SKILL.md");
    await writeFileAtomic(filePath, serializeAuthoredSkill({ ...draft, name }, this.now().toISOString()));
    const created = await this.reload(name);
    await this.enforceCap();
    return { action: "create", skill: created };
  }

  /**
   * Record that this authored skill was used at the current time. Updates
   * lastUsedAt in the skill's on-disk metadata. Throttled: skips if the
   * skill was already recorded within 60 seconds (avoids per-turn disk
   * churn for long conversations where the same skill stays relevant).
   * Returns true if the file was updated, false if skill not found or
   * throttled. Fail-soft: never throws.
   *
   * Pattern adapted from Hermes Agent's curator lifecycle (MIT) — reimplemented for Muse.
   */
  async recordUsage(name: string): Promise<boolean> {
    try {
      const authored = await this.listAuthored();
      const skill = authored.find((s) => s.name === name);
      if (!skill) return false;

      const muse = (skill.frontmatter.metadata?.["muse"] ?? {}) as Record<string, unknown>;
      const lastUsedAt = typeof muse.lastUsedAt === "string" ? muse.lastUsedAt : undefined;
      const now = this.now();

      if (lastUsedAt) {
        const elapsed = now.getTime() - Date.parse(lastUsedAt);
        if (Number.isFinite(elapsed) && elapsed < 60_000) return false;
      }

      const authoredAt = typeof muse.authoredAt === "string" ? muse.authoredAt : "";
      const text = serializeAuthoredSkill(
        { name: skill.name, description: skill.description, body: skill.body },
        authoredAt,
        now.toISOString()
      );
      await writeFileAtomic(skill.sourceInfo.filePath, text);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Archive authored skills idle longer than maxIdleDays — last used (or
   * authored, when never used) before the cutoff. Archive-never-delete via
   * the same .archive/ rename as the cap. Returns the names archived; a
   * non-positive window is a no-op. Keeps the learned-skill set relevant so
   * the local model isn't choosing among stale skills (tool-calling.md).
   *
   * `options.scheduledJobs` exempts a skill still named by a scheduled job /
   * standing objective (enabled or disabled) from idle pruning even at zero uses
   * (see {@link referencedByScheduledJob}) — mirrors treating a cron-
   * referenced skill like a pinned one. Before archiving, a snapshot of
   * every about-to-be-touched skill's content is taken (see
   * {@link SkillSnapshot}) so a bad batch can be undone with `rollback()`.
   *
   * Pattern adapted from Hermes Agent's curator lifecycle — last_used_at
   * feeding stale → auto-archive transitions, cron-reference exemption, and
   * pre-mutation snapshotting (MIT) — reimplemented for Muse.
   */
  async curate(
    maxIdleDays: number,
    options: { readonly scheduledJobs?: readonly SkillReferencingJob[] } = {}
  ): Promise<readonly string[]> {
    if (!(maxIdleDays > 0)) return [];
    const cutoff = this.now().getTime() - maxIdleDays * 24 * 60 * 60 * 1000;
    const jobs = options.scheduledJobs ?? [];
    const candidates = (await this.listAuthored()).filter(
      (s) => this.lastActiveAt(s) < cutoff && !referencedByScheduledJob(s, jobs)
    );
    if (candidates.length > 0) await this.snapshotSkills(candidates);
    const archived: string[] = [];
    for (const s of candidates) {
      if (await this.archiveSkill(s)) archived.push(s.name);
    }
    return archived;
  }

  /**
   * Consolidate overlapping authored skills into umbrellas (the curator
   * merge, after Hermes). Clusters authored skills by name+description
   * similarity (>= threshold); each cluster of >= minClusterSize is handed to
   * the injected `merge` (an LLM merger, kept out of this package so it stays
   * model-free) — if it returns an umbrella, the originals are ARCHIVED (never
   * deleted) and the umbrella written. `dryRun` reports the plan and mutates
   * nothing. Returns one entry per consolidated cluster.
   */
  async consolidate(
    merge: (
      cluster: readonly SkillDraft[],
      feedback?: { readonly avoidDropping: readonly string[] }
    ) => Promise<SkillDraft | undefined>,
    options: {
      readonly threshold?: number;
      readonly minClusterSize?: number;
      readonly dryRun?: boolean;
      /**
       * Held-out validation gate (SkillOpt propose-and-test): after the merger
       * proposes an umbrella, accept the merge ONLY when this returns true /
       * `{accept:true}`. Return `{accept, lost}` to also feed the dropped-skill
       * labels into a steered retry (see `feedbackRetry`). A rejected umbrella is
       * dropped and the originals are left intact (rollback) — never
       * archived/overwritten. Injected so this package stays model-free; the
       * caller wires `validateUmbrellaCoverage`. Omitted ⇒ no gate (back-compat).
       */
      readonly validate?: (
        cluster: readonly SkillDraft[],
        umbrella: SkillDraft
      ) =>
        | boolean
        | { readonly accept: boolean; readonly lost?: readonly string[] }
        | Promise<boolean | { readonly accept: boolean; readonly lost?: readonly string[] }>;
      /**
       * SkillOpt rejected-edit loop: when the gate rejects a merge AND the
       * verdict reports the dropped skills (`lost`), re-propose ONCE with that
       * feedback before giving up — so a fixable umbrella converges instead of
       * being recomputed identically next tick. Default false (one attempt).
       */
      readonly feedbackRetry?: boolean;
      /**
       * Self-consistency sampling: propose the umbrella up to `attempts` times and
       * commit the FIRST that passes `validate`, steering each retry away from the
       * gate-reported `lost` skills. Raises the merge-success rate on a stochastic
       * local model (gemma4) where a single try sometimes under-covers — without
       * weakening the gate (a non-covering umbrella is still rejected every time).
       * Default 1 (or 2 when `feedbackRetry` is set, for back-compat).
       */
      readonly attempts?: number;
      /**
       * Cross-tick reject COOLDOWN (injected so this package stays IO-free): a
       * cluster the gate keeps rejecting shouldn't be recomputed (a local-LLM
       * merge + embeds) every idle tick forever. `shouldSkipCluster` is consulted
       * BEFORE proposing — skip when it returns true; `recordReject` bumps the
       * cluster's count on a real held-out reject (NOT on a no-cohere/NONE);
       * `recordMerged` clears it on commit. The caller wires a fingerprint→count
       * ledger (fingerprint over name+content, so editing a member re-opens it).
       * Omitted ⇒ no cooldown (back-compat).
       */
      readonly shouldSkipCluster?: (cluster: readonly SkillDraft[]) => boolean | Promise<boolean>;
      readonly recordReject?: (cluster: readonly SkillDraft[]) => void | Promise<void>;
      readonly recordMerged?: (cluster: readonly SkillDraft[]) => void | Promise<void>;
    } = {}
  ): Promise<readonly { readonly umbrella: string; readonly merged: readonly string[] }[]> {
    const threshold = typeof options.threshold === "number" && options.threshold > 0 ? options.threshold : 0.5;
    const minSize = Math.max(2, Math.trunc(options.minClusterSize ?? 2));
    const skills = await this.listAuthored();
    const clusters = this.clusterBySimilarity(skills, threshold).filter((c) => c.length >= minSize);
    const out: { umbrella: string; merged: readonly string[] }[] = [];
    for (const cluster of clusters) {
      const drafts = cluster.map((s) => ({ body: s.body, description: s.description, name: s.name }));
      // Cooldown: a cluster that has been rejected too many times is skipped
      // BEFORE the costly merge call, until a member's content changes.
      if (options.shouldSkipCluster && (await options.shouldSkipCluster(drafts))) continue;
      // Self-consistency: a small local model (gemma4) sometimes produces a
      // non-covering umbrella on a single try, so sample up to `attempts` times
      // and accept the FIRST that passes the held-out coverage gate (a later
      // attempt steers away from the previously-dropped skills when the gate
      // reports them). `feedbackRetry` stays as the back-compat one-retry alias.
      const attempts = Math.max(1, Math.trunc(options.attempts ?? (options.feedbackRetry ? 2 : 1)));
      let umbrella: SkillDraft | undefined;
      let accepted = !options.validate; // no gate ⇒ first cohere wins
      let lost: readonly string[] = [];
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const candidate = await merge(drafts, lost.length > 0 ? { avoidDropping: lost } : undefined);
        if (!candidate) break; // cluster didn't cohere — leave the skills alone (no reject)
        umbrella = candidate;
        if (!options.validate) break;
        const verdict = await options.validate(drafts, candidate);
        accepted = typeof verdict === "boolean" ? verdict : verdict.accept;
        lost = typeof verdict === "boolean" ? [] : (verdict.lost ?? []);
        if (accepted) break;
      }
      if (!umbrella) continue; // never cohered — no reject recorded
      if (!accepted) {
        await options.recordReject?.(drafts); // held-out reject → count toward cooldown
        continue; // roll back: originals intact
      }
      if (options.dryRun) {
        out.push({ merged: cluster.map((s) => s.name), umbrella: umbrella.name });
        continue;
      }
      // Snapshot the cluster's current content BEFORE this cluster's mutating
      // pass so a bad merge can be undone with rollback().
      await this.snapshotSkills(cluster);
      // Archive originals FIRST so the subsequent umbrella write can't
      // similarity-match (and accidentally patch) one of them.
      for (const s of cluster) await this.archiveSkill(s);
      const { skill } = await this.writeOrPatch(umbrella);
      await options.recordMerged?.(drafts); // merged → clear any cooldown entry
      out.push({ merged: cluster.map((s) => s.name), umbrella: skill.name });
    }
    return out;
  }

  private clusterBySimilarity(skills: readonly Skill[], threshold: number): readonly (readonly Skill[])[] {
    const clustered = new Set<string>();
    const clusters: Skill[][] = [];
    for (const seed of skills) {
      if (clustered.has(seed.name)) continue;
      const cluster = [seed];
      clustered.add(seed.name);
      for (const other of skills) {
        if (clustered.has(other.name)) continue;
        if (this.similarity(`${seed.name} ${seed.description}`, `${other.name} ${other.description}`) >= threshold) {
          cluster.push(other);
          clustered.add(other.name);
        }
      }
      clusters.push(cluster);
    }
    return clusters;
  }

  /** Archived skill folder names (under `.archive/`) — what `restore` can revive. */
  async listArchived(): Promise<readonly string[]> {
    return fs.readdir(join(this.dir, ".archive")).catch(() => [] as string[]);
  }

  /**
   * Restore an archived skill (curate/consolidate rollback): move
   * `.archive/<slug>` back to active. Refuses if a live skill already occupies
   * the slot (returns false) — never clobbers. Returns true on success.
   */
  async restore(name: string): Promise<boolean> {
    const slug = slugifySkillName(name);
    const src = join(this.dir, ".archive", slug);
    const dest = join(this.dir, slug);
    try {
      await fs.access(dest);
      return false; // a live skill already holds this slot
    } catch {
      // slot free — proceed
    }
    return fs.rename(src, dest).then(() => true).catch(() => false);
  }

  /** Pre-mutation snapshots, newest last — what `rollback()` can restore. */
  async listSnapshots(): Promise<readonly SkillSnapshot[]> {
    const files = await fs.readdir(this.snapshotsDir()).catch(() => [] as string[]);
    const out: SkillSnapshot[] = [];
    for (const file of files.filter((f) => f.endsWith(".json")).sort()) {
      const raw = await fs.readFile(join(this.snapshotsDir(), file), "utf8").catch(() => undefined);
      if (raw === undefined) continue;
      try {
        out.push(JSON.parse(raw) as SkillSnapshot);
      } catch {
        // corrupt/partial snapshot file — skip, don't fail the whole list
      }
    }
    return out;
  }

  /**
   * Roll a batch back: restore every skill recorded in a snapshot (default:
   * the most recent) to its snapshotted content. Never-delete preserved — a
   * skill that was newly authored/edited into the same slot AFTER the
   * snapshot was taken is preserved by archiving it (under a distinct
   * `<slug>-postsnapshot-<ts>` folder) instead of being overwritten or
   * removed. Throws if no snapshot exists (or a given `snapshotId` isn't
   * found) — there's nothing safe to roll back to.
   */
  async rollback(snapshotId?: string): Promise<{
    readonly snapshotId: string;
    readonly restored: readonly string[];
    readonly archivedConflicts: readonly string[];
  }> {
    const snapshots = await this.listSnapshots();
    const snapshot = snapshotId ? snapshots.find((s) => s.id === snapshotId) : snapshots.at(-1);
    if (!snapshot) {
      throw new Error(
        snapshotId ? `snapshot not found: ${snapshotId}` : "no snapshots available to roll back to"
      );
    }
    const restored: string[] = [];
    const archivedConflicts: string[] = [];
    for (const entry of snapshot.entries) {
      const conflict = await this.restoreSnapshotEntry(entry);
      restored.push(entry.name);
      if (conflict) archivedConflicts.push(entry.name);
    }
    return { archivedConflicts, restored, snapshotId: snapshot.id };
  }

  private snapshotsDir(): string {
    return join(this.dir, ".snapshots");
  }

  /**
   * Write a pre-mutation snapshot for `skills` (the set about to be
   * archived/merged) and prune the ring down to `snapshotRingSize`. A JSON
   * manifest per skill (name/slug/contentHash/full content) is sufficient in
   * Node — no tar needed, matching the file-based house style already used
   * for skill storage. No-op (writes nothing) when `skills` is empty, so an
   * idle curate/consolidate tick that finds nothing to touch doesn't churn
   * the ring.
   */
  private async snapshotSkills(skills: readonly Skill[]): Promise<string | undefined> {
    if (skills.length === 0) return undefined;
    const entries: SkillSnapshotEntry[] = [];
    for (const skill of skills) {
      const content = await fs.readFile(skill.sourceInfo.filePath, "utf8").catch(() => "");
      entries.push({
        content,
        contentHash: createHash("sha256").update(content).digest("hex"),
        name: skill.name,
        slug: slugifySkillName(skill.name)
      });
    }
    const id = `${this.now().toISOString().replace(/[:.]/gu, "-")}-${Math.random().toString(36).slice(2, 8)}`;
    const snapshot: SkillSnapshot = { createdAt: this.now().toISOString(), entries, id };
    await writeFileAtomic(join(this.snapshotsDir(), `${id}.json`), JSON.stringify(snapshot));
    await this.pruneSnapshots();
    return id;
  }

  private async pruneSnapshots(): Promise<void> {
    const files = (await fs.readdir(this.snapshotsDir()).catch(() => [] as string[]))
      .filter((f) => f.endsWith(".json"))
      .sort();
    const excess = files.length - this.snapshotRingSize;
    if (excess <= 0) return;
    for (const file of files.slice(0, excess)) {
      await fs.unlink(join(this.snapshotsDir(), file)).catch(() => undefined);
    }
  }

  /**
   * Restore one snapshot entry to `<dir>/<slug>/SKILL.md`. Returns true when
   * a DIFFERENT skill occupying the slot (authored/edited after the
   * snapshot) had to be preserved by archiving it under a distinct name —
   * i.e. a conflict was resolved by archive-not-delete rather than a clean
   * restore.
   */
  private async restoreSnapshotEntry(entry: SkillSnapshotEntry): Promise<boolean> {
    const liveDir = join(this.dir, entry.slug);
    const liveFile = join(liveDir, "SKILL.md");
    const archiveDir = join(this.dir, ".archive", entry.slug);

    const currentContent = await fs.readFile(liveFile, "utf8").catch(() => undefined);
    let conflict = false;
    if (currentContent !== undefined && currentContent !== entry.content) {
      const preserveDir = join(this.dir, ".archive", `${entry.slug}-postsnapshot-${this.now().getTime().toString()}`);
      await fs.rename(liveDir, preserveDir).catch(() => undefined);
      conflict = true;
    } else if (currentContent === undefined) {
      // Not live — if curate/consolidate archived it, reclaim the folder so
      // rollback doesn't leave an orphaned duplicate under .archive.
      await fs.rename(archiveDir, liveDir).catch(() => undefined);
    }
    await writeFileAtomic(liveFile, entry.content);
    return conflict;
  }

  private authoredAt(skill: Skill): number {
    const muse = (skill.frontmatter.metadata?.["muse"] ?? {}) as Record<string, unknown>;
    const raw = muse["authoredAt"];
    const at = typeof raw === "string" ? Date.parse(raw) : Number.NaN;
    return Number.isFinite(at) ? at : 0;
  }

  private lastActiveAt(skill: Skill): number {
    const muse = (skill.frontmatter.metadata?.["muse"] ?? {}) as Record<string, unknown>;
    const raw = muse["lastUsedAt"];
    const used = typeof raw === "string" ? Date.parse(raw) : Number.NaN;
    return Number.isFinite(used) ? used : this.authoredAt(skill);
  }

  private hasUsage(skill: Skill): boolean {
    const muse = (skill.frontmatter.metadata?.["muse"] ?? {}) as Record<string, unknown>;
    return typeof muse["lastUsedAt"] === "string" && (muse["lastUsedAt"] as string).length > 0;
  }

  private async archiveSkill(skill: Skill): Promise<boolean> {
    const folder = skill.sourceInfo.baseDir;
    const base = folder.split(/[\\/]/u).pop() ?? "skill";
    const dest = join(this.dir, ".archive", base);
    await fs.mkdir(dirname(dest), { recursive: true });
    return fs.rename(folder, dest).then(() => true).catch(() => false); // never delete
  }

  private async enforceCap(): Promise<void> {
    const skills = await this.listAuthored();
    if (skills.length <= this.maxSkills) return;
    // Utility-aware eviction (SkillOps arXiv:2605.13716; value-aware cache
    // eviction, TinyLFU arXiv:1512.00727): evict the LOWEST-utility skills, not
    // merely the oldest-authored — a heavily-used skill must not be archived
    // before a never-used newer one. Degrades to FIFO when no usage data exists
    // (lastActiveAt falls back to authoredAt), so it is a strict superset.
    const order = rankSkillsForEviction(
      skills.map((s) => ({ name: s.name, used: this.hasUsage(s), lastActiveMs: this.lastActiveAt(s) }))
    );
    const evict = new Set(order.slice(0, skills.length - this.maxSkills));
    for (const s of skills) {
      if (evict.has(s.name)) await this.archiveSkill(s);
    }
  }

  private dedupeName(name: string): string {
    const taken = new Set(this.existingNames());
    if (!taken.has(name)) return name;
    for (let n = 1; ; n += 1) {
      const candidate = n === 1 ? `${name}-learned` : `${name}-learned-${n.toString()}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  private async reload(name: string): Promise<Skill> {
    const all = await this.listAuthored();
    const found = all.find((s) => s.name === name);
    if (!found) throw new Error(`authored skill vanished after write: ${name}`);
    return found;
  }
}
