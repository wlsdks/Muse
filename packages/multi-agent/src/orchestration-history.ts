import type { OrchestrationMode } from "./index.js";

/**
 * Records a single `MultiAgentOrchestrator.run()` call so operators can
 * inspect recent orchestration outcomes (mode, worker counts, success/
 * failure split, wall-clock duration) without scraping logs.
 *
 * The orchestrator records `started` first, then exactly one of
 * `completed` or `failed` once the run resolves. Stores must accept the
 * out-of-order case where a `started` is followed by a `failed` (no
 * results) and surface the entry exactly once via `list()`.
 */

export interface OrchestrationHistoryEntry {
  readonly runId: string;
  readonly mode: OrchestrationMode;
  readonly workerCount: number;
  readonly completedCount: number;
  readonly failedCount: number;
  readonly startedAt: Date;
  readonly finishedAt: Date;
  readonly durationMs: number;
  readonly status: "completed" | "failed";
  readonly error?: string;
}

export interface OrchestrationHistoryStore {
  record(entry: OrchestrationHistoryEntry): void;
  list(limit?: number): readonly OrchestrationHistoryEntry[];
  clear(): void;
}

export interface InMemoryOrchestrationHistoryStoreOptions {
  /**
   * Maximum number of entries to retain. Older entries are evicted FIFO
   * when the cap is reached. Defaults to 100.
   */
  readonly maxEntries?: number;
}

/**
 * Bounded in-memory ring buffer. Newest entry is index 0 of `list()`.
 */
export class InMemoryOrchestrationHistoryStore implements OrchestrationHistoryStore {
  private readonly entries: OrchestrationHistoryEntry[] = [];
  private readonly maxEntries: number;

  constructor(options: InMemoryOrchestrationHistoryStoreOptions = {}) {
    const limit = options.maxEntries ?? 100;

    if (!Number.isInteger(limit) || limit <= 0) {
      throw new RangeError("maxEntries must be a positive integer");
    }

    this.maxEntries = limit;
  }

  record(entry: OrchestrationHistoryEntry): void {
    this.entries.unshift(entry);

    if (this.entries.length > this.maxEntries) {
      this.entries.length = this.maxEntries;
    }
  }

  list(limit?: number): readonly OrchestrationHistoryEntry[] {
    if (limit === undefined) {
      return [...this.entries];
    }

    if (!Number.isInteger(limit) || limit < 0) {
      throw new RangeError("limit must be a non-negative integer");
    }

    return this.entries.slice(0, limit);
  }

  clear(): void {
    this.entries.length = 0;
  }
}
