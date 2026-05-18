# Iteration-loop steering

This rule governs the autonomous `/loop` (and any scheduled-agent
equivalent) that works `docs/goals/`. The loop is **self-evolving
(자가발전): it runs forever, self-generates its own next goal every
iteration, and never asks a human for work.**

The 255–372 run degraded not because it self-generated — that is
the engine — but because the work circled Muse's own internals. The
fix is **direction + hygiene**, not a stop button.

## The contract

- **Every iteration must expand Muse outward** toward being the
  user's always-on personal AI assistant that reaches into their
  real tools and life and acts on their behalf (mission:
  `project_muse_identity`). Do not use any movie/character name in
  code, docs, or commits — describe the capability, not a brand.
- **Outward = grows Reach, Anticipation, Autonomy, or Presence**
  (full definitions in `docs/goals/README.md`). Inward churn
  (refactor / re-harden / re-sort / re-format / guard / comment /
  rename with no outward gain) is **banned**, same tier as cosmetic
  fixes.
- **Never stop, never ask a human, never schedule-and-idle.** The
  loop discovers its own next goal and continues indefinitely.
- **Source of truth**: `docs/goals/README.md` — the outward bar, the
  discovery procedure, hygiene, dashboard upkeep. Read it and
  `MEMORY.md` every iteration before acting.

## Self-expansion is required

Append the next `NNN` goal via the discovery procedure (mission gap
→ design-doc gap → dogfood → reach extension → architecture
leverage). Backlog self-expansion is the mechanism, not a
violation. There is no terminal state.

## Backlog hygiene (every iteration)

- Keep only the **5 most recently completed** `NNN-*.md`; on the
  6th completion delete the oldest done file (git keeps history).
- The `docs/goals/README.md` table = all open goals + last 5 done.
- Keep the goal directory clean and minimal — a fresh agent must
  grasp the state in seconds.

## Progress dashboard (every iteration)

`scripts/dashboard-server.mjs` is a read-only, `127.0.0.1`-only
HTML view rendered from git + `docs/goals` on each request. The
loop keeps it meaningful by writing a clear Conventional-Commit
subject and a human-readable `## Status` line every commit (the
dashboard surfaces these verbatim). The fixed "Live progress" link
in the root `README.md` must always remain. Any network exposure
goes through goal 376's outbound-only Cloudflare-tunnel path —
never an inbound port, never anything but that one HTML; the loop
PC must never be put at risk.

## Forward-progress guard (infinite ≠ churn)

- One goal (or one epic slice) per commit; epics do the next
  undone slice only.
- ≤2 consecutive iterations on the same capability surface; every
  3 iterations ship ≥1 new outward capability.
- If discovery only surfaces banned/inward work, the scope is
  mined out: **widen scope** (a fresh `docs/design/` area, a new
  mission capability, a new external reach). Never filler, never
  stop, never ask.
- Verification gates non-negotiable: `pnpm check`, `pnpm lint`
  (0/0), `pnpm smoke:broad`, and `pnpm smoke:live` when a provider
  key is present. "Passes diagnostic smoke" is not proof.

## After-correction protocol

This file is the response to a recurring correction
(`.claude/rules/commits.md`). If the loop is corrected again on how
it self-generates, paces, or directs work, tighten this file rather
than re-explaining per session.
