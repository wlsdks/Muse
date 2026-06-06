/**
 * Open loops — the Zeigarnik / Ovsiankina effect, made actionable.
 *
 * An unfinished goal holds a low-grade tension in working memory that keeps
 * pulling at you (the Ovsiankina resumption drive; Masicampo & Baumeister,
 * Psychological Science 2011, showed that making a CONCRETE plan for when/where
 * to resume it dissolves that tension). The tasks that nag most are the ones
 * left OPEN, UNSCHEDULED (no due date — no plan), and sitting there a while.
 *
 * This surfaces exactly those — not every open task (that's `tasks list`), not
 * the deadline-ranked ones (`tasks next`), but the planless loops that fall
 * through the cracks — so the user can close the loop by attaching a plan. Pure
 * + deterministic.
 */

const DAY_MS = 24 * 60 * 60_000;
const DEFAULT_MIN_AGE_DAYS = 3;
const DEFAULT_MAX_RESULTS = 7;

export interface TaskLike {
  readonly title: string;
  readonly status: string;
  readonly createdAt: string;
  readonly dueAt?: string;
}

export interface OpenLoop {
  readonly title: string;
  readonly ageDays: number;
}

export interface OpenLoopOptions {
  readonly nowMs: number;
  /** A task must have been open at least this long to count as a nagging loop (a fresh one isn't). Default 3 days. */
  readonly minAgeDays?: number;
  readonly maxResults?: number;
}

/**
 * The open loops worth closing: status "open", NO due date (unscheduled — no
 * plan), and open for ≥ minAgeDays. Oldest first (longest-nagging), capped.
 */
export function openLoops(tasks: readonly TaskLike[], options: OpenLoopOptions): readonly OpenLoop[] {
  const minAgeDays = Number.isFinite(options.minAgeDays) ? Math.max(0, options.minAgeDays!) : DEFAULT_MIN_AGE_DAYS;
  const maxResults = Number.isFinite(options.maxResults) ? Math.max(1, Math.trunc(options.maxResults!)) : DEFAULT_MAX_RESULTS;
  return tasks
    .filter((task) => task.status === "open" && !(task.dueAt && task.dueAt.trim().length > 0))
    .map((task) => ({ ageDays: (options.nowMs - Date.parse(task.createdAt)) / DAY_MS, title: task.title }))
    .filter((loop) => Number.isFinite(loop.ageDays) && loop.ageDays >= minAgeDays)
    .sort((a, b) => b.ageDays - a.ageDays)
    .slice(0, maxResults);
}
