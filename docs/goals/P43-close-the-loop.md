# P43 — Close the loop: continuous + autonomous + reliable

Human-directed frontier (2026-06-03, Jinan). Rationale + the 129-capability
map: `docs/strategy/capability-map.md`. The four P43 bullets in
`OUTWARD-TARGETS.md` are deliberately UN-SLICEABLE — each flips only when the
whole behaviour is proven end-to-end by a live battery. This file decomposes
them into the vertical slices the loop ships across iterations; a slice landing
does NOT flip the bullet.

## P43-1 — Autonomous self-development daemon (THE #1 lever)

**The gap, measured (not assumed).** The self-development mechanisms already
exist, but only as (a) **manual CLI** (`muse playbook distill`, `playbook
consolidate`, `skills consolidate`, `episode consolidate`, `reflections`) and
(b) the **`apps/api` server tick** (`tick-daemons.ts` wires `startConsolidateTick`
+ `distillQueuedCorrections`). The process the user actually runs on their Mac —
**`muse daemon` (`apps/cli/src/commands-daemon.ts`)** — drove proactive /
reminder / followup / ambient / web-watch / objectives / briefing / *reflection*
ticks but **NO learning-from-corrections tick**. So a correction Jinan makes is
enqueued (`enqueueLearnEvent`) at correction time and then sits there until he
manually runs `muse playbook distill`. The loop is open exactly where it most
needs to be closed.

**The arc (slices → flip).** Each slice keeps the grounding floor (probation
writes, brake-first, no fabrication) and is proven live where it touches the
model.

- **Slice 1 — distill corrections on the daemon tick. ✅ DELIVERED.** Move the
  grounding-fenced queue-drain (`distillQueuedCorrections`) into `@muse/autoconfigure`
  (the one package that depends on BOTH `@muse/agent-core` and `@muse/mcp`, so the
  api tick AND the CLI daemon share one implementation; `apps/api` re-exports it,
  byte-identical). Wire a `selfLearnTick` into `muse daemon`'s `runTick`, mirroring
  the reflection tick: gated by `MUSE_SELFLEARN_ENABLED` (+ a resolved model),
  interval-throttled (`MUSE_SELFLEARN_INTERVAL_MS`, default 5 min), brake-first
  (the learning-pause kill switch is honoured inside the drain), one distill per
  tick, every write on PROBATION until a reinforce graduates it. Proof:
  `commands-daemon.test.ts` — distills a queued correction with no manual command
  (drains the queue), the BRAKE leaves the queue intact when paused, the gate is
  off by default, `--status` reports it; api `distill-queue` suite still green
  against the re-export.
- **Slice 2 — consolidate + reinforce/decay on the daemon tick.** Wire skill /
  playbook consolidation and `adjustPlaybookReward` reinforce-on-reuse +
  decay-on-correction into the same idle tick, brake-first, on a slower cadence.
- **Slice 3 — graduate probation autonomously.** A strategy distilled
  unattended (probation) is GRADUATED (becomes injectable) only after a real
  later reuse/reinforce — so the daemon's own writes can't self-confirm.
- **FLIP slice — the 2-session live battery.** An `eval:self-improving`-style
  battery: session A makes a correction; the daemon distills + graduates it
  unattended; session B measurably reflects the learned strategy with NO manual
  command. When that is green end-to-end on local Qwen, **P43-1 flips**.

## P43-2 / P43-3 / P43-4

Decomposed when reached (see the bullet text in `OUTWARD-TARGETS.md`). P43-2 =
plan-execute verify-each-step + replan + all-actuator retry; P43-3 = one live
stream syncing into the citable corpus with persisted offset state; P43-4 =
absence/anomaly anticipation + evening recap.
