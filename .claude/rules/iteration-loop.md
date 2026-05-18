# Iteration-loop steering

This rule governs the autonomous `/loop` (and any scheduled-agent
equivalent) that works `docs/goals/`. The loop is **self-evolving
(자가발전): it runs forever, self-generates its own next goal every
iteration, and never asks a human for work.**

It exists because the earlier run (goals 255–372) degraded into
low-value janitorial micro-fixes. The lesson is **not** "stop self-
generating" — self-generation is the engine. The lesson is "what
gets self-generated must be genuine forward development."

## The contract

- **The loop deepens Muse toward its mission every iteration**
  (provider-neutral, JARVIS-class conductor — auto-memory
  `project_muse_identity.md`). Each iteration must leave Muse
  materially more capable than the last.
- **Never stop. Never ask a human for the next goal. Never schedule
  a wake-up and idle.** The loop discovers its own next goal and
  keeps going indefinitely. There is no terminal state.
- **Source of truth**: `docs/goals/README.md` — the productivity
  bar, the discovery procedure, the forward-progress guard. Read it
  and `MEMORY.md` every iteration before acting.

## Productivity bar (every iteration must clear it)

Eligible work: a new user-visible capability, closing a
`docs/design/*` gap, architecture deepening with stated leverage,
or a dogfood-observed real bug (cite the observed failure).

Banned self-generated shapes (these *are* the 255–372 failure):
non-finite/defensive guards with no failure story, control-byte /
escaping / sanitiser sweeps with no reported breakage, re-sort /
re-format / relative-time niceties, comment / provenance / dead-
import sweeps, tests that only restate a signature, pure renames.
If the obvious next step is one of these, it does not count —
widen discovery until a goal clears the bar.

## Self-expansion is required

The loop **appends its own next `NNN` goal** to the
`docs/goals/README.md` backlog via the discovery procedure there
(dogfood → design-doc gap → mission gap → architecture leverage →
measured quality/perf). Backlog self-expansion is the mechanism,
not a violation. The table grows for as long as the loop runs.

## Forward-progress guard (infinite ≠ churn)

- One goal (or one epic slice) per commit; epics do the next
  undone slice only.
- No more than 2 consecutive iterations on the same capability
  surface; every 3 iterations include ≥1 new user-visible
  capability or design-doc-gap closure.
- If discovery only surfaces banned-shape work, the current scope
  is mined out: **widen scope** (deeper dogfood, a fresh
  `docs/design/` area, a new mission capability). Never emit
  filler, never stop, never ask.
- Verification gates non-negotiable: `pnpm check`, `pnpm lint`
  (0/0), `pnpm smoke:broad`, and `pnpm smoke:live` when a provider
  key is present. "Passes diagnostic smoke" is not proof.

## After-correction protocol

This file is the response to a recurring correction
(`.claude/rules/commits.md`). If the loop is corrected again on how
it self-generates or paces work, tighten this file rather than re-
explaining per session.
