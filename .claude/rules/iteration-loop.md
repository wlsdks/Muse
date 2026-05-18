# Iteration-loop steering

This rule governs the autonomous `/loop` (and any scheduled-agent
equivalent) that works `docs/goals/`. It exists because a 39-hour
unattended run (goals 255–372, 2026-05-16 → 18) converged into
low-value janitorial micro-fixes: the substantive roadmap was
largely complete, but nothing told the loop to *stop*, so it kept
auto-minting one safe edge-case goal every ~20 minutes.

## The contract

- **The loop deepens Muse toward its mission** (provider-neutral,
  JARVIS-class conductor — auto-memory `project_muse_identity.md`).
  Staying busy is not a goal. Producing nothing this iteration
  because nothing clears the value bar is the *correct* outcome.
- **Source of truth for what to do next**: `docs/goals/README.md`
  priority order + the Open table. Read it, and `MEMORY.md`, every
  iteration before acting.
- **Value bar** (full text in `docs/goals/README.md`): a goal is
  eligible only if it's a user-visible capability, real architecture
  deepening, or a robustness gap with a *concrete observed failure
  story*. Cosmetic edge-case guards, tests that restate the obvious,
  and comment sweeps are not eligible.

## Hard stop — the rule that fixes the failure

When no open goal clears the value bar, the loop **halts and asks a
human for strategic direction**. It MUST NOT:

- invent a new micro-hardening / cosmetic goal to keep producing,
- lower the value bar to make a non-qualifying goal "fit,"
- continue talking about "next iteration" or schedule a wake-up
  (see auto-memory `feedback_loop_termination.md`).

An exhausted backlog is the expected terminal state, not a problem
to route around.

## Anti-runaway limits

- **One goal (or one epic slice) per commit.** Epics: do only the
  next undone slice per iteration.
- **Max 3 consecutive `robustness` goals.** After that, the next
  iteration must be `architecture` or `feature`, or it halts.
- **No backlog self-expansion.** The loop executes the human-curated
  Open table; it does not append new `NNN` goals to keep itself fed.
- Verification gates are unchanged and non-negotiable: `pnpm check`,
  `pnpm lint` (0/0), `pnpm smoke:broad`, and `pnpm smoke:live` when a
  provider key is present. "Passes diagnostic smoke" is not proof.

## After-correction protocol

This file is itself the response to a recurring correction
(`.claude/rules/commits.md` → "After-correction protocol"). If the
loop is corrected again on how it picks or paces work, tighten this
file rather than re-explaining per session.
