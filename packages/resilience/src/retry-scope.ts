import { AsyncLocalStorage } from "node:async_hooks";

import type { RetryBudget, RetryBudgetSnapshot, RetryReservation } from "./retry-budget.js";

/** Fixed terminal error: a retry owned by a settled async scope may not resume. */
export class RetryScopeEndedError extends Error {
  constructor() {
    super("Retry scope ended");
    Object.defineProperty(this, "name", { configurable: true, value: "RetryScopeEndedError" });
  }
}

type ScopedReservationState = "pending" | "committed" | "cancelled" | "revoked";

interface TrackedReservation extends RetryReservation {
  revoke(): void;
}

class ScopedRetryBudget implements RetryBudget {
  private active = true;
  private endedSnapshot: RetryBudgetSnapshot;
  private readonly pending = new Set<TrackedReservation>();
  private underlying: RetryBudget | undefined;

  constructor(budget: RetryBudget) {
    this.underlying = budget;
    this.endedSnapshot = budget.snapshot();
  }

  isActive(): boolean {
    return this.active;
  }

  reserve(input: { readonly backoffMs: number; readonly cause: unknown }): RetryReservation {
    const underlyingBudget = this.underlying;
    if (!this.active || !underlyingBudget) {
      throw new RetryScopeEndedError();
    }

    const underlyingReservation = underlyingBudget.reserve(input);
    let state: ScopedReservationState = "pending";
    const tracked: TrackedReservation = {
      cancel: () => {
        if (state !== "pending") return;
        state = "cancelled";
        underlyingReservation.cancel();
        this.pending.delete(tracked);
      },
      commit: () => {
        if (state === "revoked") {
          throw new RetryScopeEndedError();
        }
        if (state !== "pending") return;
        if (!this.active || !this.underlying) {
          state = "revoked";
          underlyingReservation.cancel();
          this.pending.delete(tracked);
          throw new RetryScopeEndedError();
        }
        state = "committed";
        underlyingReservation.commit();
        this.pending.delete(tracked);
      },
      revoke: () => {
        if (state !== "pending") return;
        state = "revoked";
        underlyingReservation.cancel();
      }
    };
    this.pending.add(tracked);
    return tracked;
  }

  snapshot(): RetryBudgetSnapshot {
    return this.underlying?.snapshot() ?? this.endedSnapshot;
  }

  end(): void {
    if (!this.active) return;
    this.active = false;
    const underlyingBudget = this.underlying;
    for (const reservation of this.pending) {
      reservation.revoke();
    }
    this.endedSnapshot = underlyingBudget?.snapshot() ?? this.endedSnapshot;
    this.pending.clear();
    this.underlying = undefined;
  }
}

const retryBudgetStorage = new AsyncLocalStorage<ScopedRetryBudget>();

export function currentRetryBudget(): RetryBudget | undefined {
  const scope = retryBudgetStorage.getStore();
  return scope?.isActive() ? scope : undefined;
}

export async function runWithRetryBudget<T>(
  budget: RetryBudget | undefined,
  operation: () => T | PromiseLike<T>
): Promise<T> {
  if (!budget) {
    return operation();
  }

  const scope = new ScopedRetryBudget(budget);
  return retryBudgetStorage.run(scope, async () => {
    try {
      return await operation();
    } finally {
      scope.end();
    }
  });
}
