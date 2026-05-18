# Goals

The self-driving backlog for the autonomous iteration loop.

The loop **never stops and never asks a human for work**. Every
iteration it discovers, defines, and ships the next genuinely-
productive piece of forward development, appends it to this backlog,
and continues — indefinitely. This is a self-evolving (자가발전)
loop: each iteration must leave Muse materially more capable than
the last.

## The direction: expand OUTWARD

The 255–372 run failed not because it self-generated work but
because the work circled Muse's own internals (re-hardening,
re-sorting, re-formatting code that already worked). Self-expansion
is the engine; the missing constraint was **direction**.

Every self-generated goal must expand Muse **outward** — toward
being the user's always-on personal AI assistant that reaches into
their real tools and life and acts on their behalf. Concretely,
"outward" means a goal grows at least one of:

- **Reach** — a new external surface Muse can perceive or act
  through (a tool, an integration, a data source, a device/channel,
  a real-world account the user actually uses).
- **Anticipation** — Muse noticing something and surfacing/acting
  *before* being asked (proactive, scheduled, context-aware).
- **Autonomy** — Muse completing a real multi-step task end-to-end
  on the user's behalf with less human steering than before.
- **Presence** — Muse being reachable/aware across more of the
  user's day (channels, surfaces, continuity across sessions).

If a goal does not move Reach / Anticipation / Autonomy / Presence
forward, it is **inward churn and is banned** — exactly the failure
to avoid.

## Banned shapes (never self-generate these)

- inward churn: refactor / re-harden / re-sort / re-format / guard /
  comment / dead-import / rename work with no outward gain,
- non-finite or defensive guards on already-validated input with no
  observed failure story,
- tests that only restate a signature or pin already-covered logic.

If the obvious next step is one of these, it does **not** count as
an iteration. Filler is forbidden; stopping is forbidden; asking a
human is forbidden. The only exit is shipped outward progress —
widen discovery until you find it.

## Self-generation — how the loop finds its next goal

Discovery procedure each iteration, in order; take the **first that
yields an outward goal**:

1. **Mission gap** — compare Muse against an always-on personal AI
   assistant that acts in the user's real world. The largest
   missing Reach/Anticipation/Autonomy/Presence capability is the
   goal.
2. **Design-doc gap** — pick a `docs/design/*.md`; take the largest
   unbuilt slice that adds an outward capability.
3. **Dogfood** — exercise a real Muse surface; a wrong behaviour
   that blocks an outward capability is the goal.
4. **Reach extension** — a concrete new tool / integration / channel
   the user would actually use.
5. **Architecture leverage** — *only* when it unblocks ≥2 named
   outward goals; state them.

Then append it to the backlog as the next `NNN`, write
`NNN-slug.md` (`## Why`, `## Scope`/`## Slices`, `## Verify`,
`## Status`), and execute. Self-expansion is required, not
forbidden. There is no terminal state.

## Backlog hygiene (keep it clean — every iteration)

- Keep only the **5 most recently completed** goal files in
  `docs/goals/`. When a 6th completes, delete the oldest done
  `NNN-*.md` (git history preserves it).
- The table below lists **all open goals + only the last 5 done**.
- One goal directory, no clutter. Optimised for a fresh agent to
  read in seconds.

## Progress dashboard (keep it live — every iteration)

`scripts/dashboard-server.mjs` serves a read-only HTML view of open
goals + recently-shipped work, bound to `127.0.0.1` only, refreshed
from git on each request. After every commit the loop must keep the
work legible **through what the dashboard reads**: a clear
Conventional-Commit subject and a human-readable `## Status` line on
the goal. The fixed public link lives in the root `README.md`
("Live progress") and must stay there. Exposing it runs through
goal 376's documented outbound-only Cloudflare-tunnel path — never
an inbound port; the loop PC must never be put at risk.

## Workflow per iteration

1. Read [`.claude/rules/iteration-loop.md`](../../.claude/rules/iteration-loop.md)
   and auto-memory `MEMORY.md`.
2. Discovery → an outward goal that clears the bar.
3. Append it as the next `NNN`; write its md.
4. Epic? Next undone slice only — one slice = one commit.
5. Execute → `pnpm check` → `pnpm lint` (0/0) → `pnpm smoke:broad`
   → `pnpm smoke:live` (when a provider key is set).
6. Commit (Conventional Commits, one goal/slice per commit) with a
   subject the dashboard can show verbatim.
7. Flip `## Status` → `done — <hash>` / `slice N done — <hash>`,
   update the table, prune to last-5-done.
8. Continue to the next iteration. Never halt.

## Epics

A goal may exceed one iteration: mark it `epic`, list ordered
tracer-bullet `## Slices`, ship one slice per commit.

## Backlog

| #   | Goal                                                                    | Category       | Status         |
| --- | ----------------------------------------------------------------------- | -------------- | -------------- |
| 373 | [Proactive multi-device routing](373-proactive-multi-device-routing.md) | epic / outward | slice 2/3 done |
| 374 | [`muse ask --notes-only`](374-muse-ask-notes-only.md)                   | outward        | open           |
| 375 | [Web UI history panel](375-web-history-panel.md)                        | epic / outward | open           |
| 376 | [Progress dashboard + safe tunnel](376-progress-dashboard-and-safe-tunnel.md) | epic / outward | open     |
| …   | *self-generated outward via discovery — never ends*                     |                |                |
