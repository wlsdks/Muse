/**
 * ReasoningBank slice 2 (arXiv 2509.25140): end-of-session auto-distillation.
 * Reads the just-finished session, finds where the user CORRECTED the
 * assistant, asks the model to generalise each correction into one reusable
 * strategy, dedupes it against the existing bank, and records it into the SAME
 * `~/.muse/playbook.json` the [Learned Strategies] injection reads. The
 * positive feedback loop for the ACE playbook, populated automatically.
 *
 * Mirrors `captureEndOfSessionEpisode`: I/O is injectable, every step is
 * fail-soft, and it returns a typed skip reason rather than throwing. The env
 * gate (`MUSE_PLAYBOOK_DISTILL_ENABLED`) is checked by the REPL-exit caller so
 * the manual `muse playbook distill` command can run regardless.
 */

import { randomUUID } from "node:crypto";

import {
  detectCorrections,
  distillStrategyFromCorrection,
  extractCurrentSessionTurns,
  strategyTextSimilarity,
  type DistillStrategyOptions,
  type SessionBoundaryRef,
  type SessionTurnLine
} from "@muse/agent-core";
import { resolvePlaybookFile } from "@muse/autoconfigure";
import { queryPlaybook, recordPlaybookStrategy } from "@muse/mcp";

import { readLastChatHistory, readSessionBoundaries } from "./chat-history.js";

type ModelProviderLike = DistillStrategyOptions["modelProvider"];

const DEFAULT_DEDUP_THRESHOLD = 0.6;
const DEFAULT_MAX_EXCHANGES = 2;

export interface DistillCorrectionsOptions {
  readonly modelProvider: ModelProviderLike;
  readonly model: string;
  /** Owner when the session boundary didn't carry a userId. */
  readonly userId?: string;
  /** Override the playbook path (env: `MUSE_PLAYBOOK_FILE`). */
  readonly playbookFile?: string;
  /** Cap corrections distilled per session. Default 2. */
  readonly maxExchanges?: number;
  /** A distilled strategy is dropped when this similar to an existing one. Default 0.6. */
  readonly dedupThreshold?: number;
  readonly now?: () => Date;
  readonly idFactory?: () => string;
  readonly readEnv?: () => NodeJS.ProcessEnv;
  readonly readLines?: () => Promise<readonly SessionTurnLine[]>;
  readonly readBoundaries?: () => Promise<readonly SessionBoundaryRef[]>;
}

export type DistillResult =
  | { readonly status: "recorded"; readonly strategies: readonly { readonly text: string; readonly tag?: string }[] }
  | { readonly status: "skipped"; readonly reason: string };

export async function distillSessionCorrections(options: DistillCorrectionsOptions): Promise<DistillResult> {
  const readLines = options.readLines ?? readLastChatHistory;
  const readBoundaries = options.readBoundaries ?? readSessionBoundaries;
  const now = options.now ?? (() => new Date());
  const idFactory = options.idFactory ?? (() => `pb_${randomUUID()}`);
  const env = (options.readEnv ?? (() => process.env))();
  const threshold = options.dedupThreshold ?? DEFAULT_DEDUP_THRESHOLD;

  let lines: readonly SessionTurnLine[];
  let boundaries: readonly SessionBoundaryRef[];
  try {
    [lines, boundaries] = await Promise.all([readLines(), readBoundaries()]);
  } catch (cause) {
    return { reason: `history read failed: ${errorMessage(cause)}`, status: "skipped" };
  }

  const range = extractCurrentSessionTurns(lines, boundaries);
  if (!range) {
    return { reason: "no current-session range (no boundary or no turns yet)", status: "skipped" };
  }
  const ownerId = range.userId ?? options.userId;
  if (!ownerId) {
    return { reason: "no userId available (boundary missing it, no fallback supplied)", status: "skipped" };
  }

  const exchanges = detectCorrections(range.turns, { maxExchanges: options.maxExchanges ?? DEFAULT_MAX_EXCHANGES });
  if (exchanges.length === 0) {
    return { reason: "no user corrections in this session", status: "skipped" };
  }

  const playbookFile = options.playbookFile ?? resolvePlaybookFile(env as Record<string, string | undefined>);
  const existingTexts = (await queryPlaybook(playbookFile, ownerId)).map((entry) => entry.text);
  const recorded: { readonly text: string; readonly tag?: string }[] = [];

  for (const exchange of exchanges) {
    const distilled = await distillStrategyFromCorrection(exchange, {
      model: options.model,
      modelProvider: options.modelProvider
    });
    if (!distilled) {
      continue;
    }
    const isDuplicate = [...existingTexts, ...recorded.map((r) => r.text)].some(
      (text) => strategyTextSimilarity(distilled.text, text) >= threshold
    );
    if (isDuplicate) {
      continue;
    }
    try {
      await recordPlaybookStrategy(playbookFile, {
        createdAt: now().toISOString(),
        id: idFactory(),
        text: distilled.text,
        userId: ownerId,
        ...(distilled.tag ? { tag: distilled.tag } : {})
      });
      recorded.push(distilled.tag ? { tag: distilled.tag, text: distilled.text } : { text: distilled.text });
    } catch {
      // Fail-soft per strategy — one bad write must not lose the rest.
    }
  }

  if (recorded.length === 0) {
    return { reason: "nothing new to record (all distilled strategies were empty or duplicates)", status: "skipped" };
  }
  return { status: "recorded", strategies: recorded };
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
