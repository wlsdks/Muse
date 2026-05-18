# Outward Target Map — the loop's self-directed north star

The loop sets and evolves its own direction. **No human authors
this; no human is asked.** A human only intervenes by issuing a
direct command. Until then the loop decides what "outward" means,
using its own judgement and best-practice knowledge of what a
great personal AI assistant does.

## North star (the feel, autonomously pursued — never the literal name)

Muse is a personal AI assistant in the spirit of the assistant
from the Iron Man films: it **proactively speaks first** based on
context (schedule, events, patterns, follow-ups) AND **responds
instantly and completely the moment it is addressed**, running the
full agent loop to finish the task — not a command parser, a
companion that acts.

Two qualities define every outward goal:

- **Proactive** — Muse initiates from real context before being
  asked.
- **Instantly responsive & complete** — when addressed, it answers
  now and carries the task to done end-to-end.

## Self-directed target map (the loop OWNS and EVOLVES this)

Each `- [ ]` bullet below is one **deliverable unit** — the
metric. The loop pursues the highest-priority target with an
unmet bullet and flips `- [ ]`→`- [x]` ONLY when a green,
non-`[UNVERIFIED-LIVE]` `CAPABILITIES.md` line whose check is a
`smoke:live`/`smoke:broad`/integration id exercising that bullet's
named user surface (never a unit-only test) delivers that exact
bullet end-to-end, annotated with the closing commit's short hash.
A bullet is too coarse for thin work to satisfy — that is the
point. The loop **may extend or reorder** bullets when its
best-practice judgement finds a stronger outward direction (record
why in `## Decisions`), and may **split** a bullet only if the
parent stays `[ ]` until ALL children are met (no flipping a
trivially-met sub-bullet to game the metric). It may NOT relabel
inward churn as a flip, weaken the outward test, or skip the check.

**P1 — Active messaging assistant** (drive to fully-delivered first)
- [ ] Proactively message the user on a wired channel when a real
  trigger fires (reminder / calendar / pattern / follow-up), with
  the why + a concrete suggested action.
- [ ] When the user replies in chat, run the full agent loop
  (tools, multi-step, approvals) and complete the task, replying
  with the result. The chat IS a Muse session.
- [ ] Thread context survives across turns and the ~20-min
  boundary.
- [ ] Risky actions get an in-chat approval prompt first.
- [ ] Provider-neutral over the messaging registry (Telegram /
  Slack / Discord / LINE — whatever is wired).

**P2 — Calendar / scheduling autonomy**
- [ ] Read AND write across Local / Google / CalDAV / macOS;
  create / move / cancel from chat or CLI.
- [ ] Anticipatory prep ("meeting in 15 min — here's the
  doc/thread"), surfaced proactively (ties to P1).

**P3 — Personal knowledge grounding (2nd brain)**
- [ ] Ingest + index notes / local files / a drive folder; answer
  grounded with citations.
- [ ] Act on the knowledge (file, summarise, link, de-dupe) — not
  just retrieve.

**P4 — Device / OS / home ambient awareness**
- [ ] Perceive screen / clipboard / active app / notifications as
  context unasked.
- [ ] Act locally where safe via the runner; ambient hints (ties
  to P1).

The loop extends this map itself when all targets are fully
delivered or when its judgement finds a stronger outward
direction. "Nothing to do" is impossible by construction.

<!-- IMMUTABLE-CORE:BEGIN -->
## Immutable core (the loop must NEVER edit — honesty machinery)

Direction is the loop's to choose. These are NOT, and exist so
autonomy can't decay into busywork:

- the north-star definition (proactive + instantly-responsive
  personal assistant; the loop never weakens it),
- the falsifiable-outward test, the banned-shapes list,
- the `CAPABILITIES.md` rules + the requirement that every goal
  ship a green surface-level (not unit-only) automated check,
- the cross-iteration falsification + 10-iter regression sweep,
- never stop / never ask a human / never complete.

A commit-msg hook (`scripts/guard-immutable.mjs`) rejects any
change to lines in this block without `[core-change: human]`.
Changing the immutable core is a human-only action.
<!-- IMMUTABLE-CORE:END -->

The loop's enforced freedom: extend/reorder targets and bullets,
never the lines between the IMMUTABLE-CORE markers.
