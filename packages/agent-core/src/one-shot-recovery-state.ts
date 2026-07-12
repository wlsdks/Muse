/**
 * Turn-internal one-shot recovery state. A single agent turn has several
 * recovery branches (tool-arg repair, false-done reprompt, grounding reverify)
 * that must each fire AT MOST once — a double retry wastes a model call and can
 * loop. This object unifies the scattered per-branch flags so a branch can
 * never fire twice within a turn: `if (state.claim(branch)) { ...recover... }`
 * runs the body only on the FIRST claim.
 */
export class OneShotRecoveryState {
  private readonly claimed = new Set<string>();

  /**
   * Claim a recovery branch for this turn. Returns `true` exactly once (the
   * first claim of that branch); every later claim of the same branch returns
   * `false`, so a guarded recovery body can never run twice.
   */
  claim(branch: string): boolean {
    if (this.claimed.has(branch)) {
      return false;
    }
    this.claimed.add(branch);
    return true;
  }

  hasClaimed(branch: string): boolean {
    return this.claimed.has(branch);
  }
}
