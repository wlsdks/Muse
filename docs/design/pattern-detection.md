# Pattern-driven goal detection

Status: **design-only.** Audit finding #24 (Tier 3).

## Why this matters

Muse already learns *when* the user is typically active (`muse routine
--apply` writes `routine_active_hours` / `routine_active_days` into
facts). The persona iter that landed surfaces it to the LLM. But
detection is one-shot, schedule-only, and never proposes the *what*.

JARVIS-class behaviour is "you usually journal at 9pm; want me to
open last night's note?" The agent has to:
- Identify a recurring activity pattern (not just hour-of-day)
- Recognise its current temporal slot
- Issue a non-spammy proactive suggestion the user can accept,
  decline, or veto for future fires

## Signals available today

- `~/.muse/activity.jsonl` — append-only log of chat-bearing surfaces
  per request (commands-status / commands-ask / commands-brief etc.
  all stamp it).
- `~/.muse/last-chat.jsonl` — REPL transcript with role + content.
- `~/.muse/tasks.json` — task creates / completes with timestamps.
- `~/.muse/notes/<path>.md` — file mtimes give "user edited this at X".

`muse routine --apply` already mines `activity.jsonl` into
`routine_active_hours` (CSV of 0-23 ints) + `routine_active_days`
(CSV of weekday labels). That's the floor; the ceiling is per-action
patterns.

## Pattern shapes worth detecting

Three categories, ranked by how reliably we can detect them:

1. **Time-of-day repeat actions.** "User opens `notes/journal/*.md`
   between 21:00–22:00 on weekdays."
   - Signal source: file mtimes in `~/.muse/notes/` + weekday cohort.
   - Trigger: now is in the slot AND no matching action in the last
     2 hours.
   - Suggestion: open the file from the same path family.

2. **Day-anchored task creation.** "User creates a 'standup notes'
   task every Monday morning."
   - Signal source: tasks.json createdAt + title-similarity cluster.
   - Trigger: matching weekday + missing task this week.
   - Suggestion: pre-create the task with the template title.

3. **Reactive: just-completed → next-step.** "User finished task A
   → tends to start task B within 30 minutes."
   - Signal source: tasks.json completedAt sequence.
   - Trigger: A just completed.
   - Suggestion: nudge toward B.

Categories 1 and 2 ship together as the v0 pass; category 3 needs a
proper sequence model and waits.

## Detector shape

`packages/memory/src/pattern-detector.ts`:

```ts
interface PatternDetector {
  detect(now: Date, signals: PatternSignals): readonly PatternMatch[];
}

interface PatternMatch {
  readonly id: string;            // stable hash so dedupe works
  readonly category: "time-of-day-action" | "weekly-task";
  readonly confidence: number;    // 0..1
  readonly suggestion: string;    // natural language
  readonly relatedPaths?: readonly string[];
}
```

Output flows to the proactive notice loop the same way calendar /
task imminence does, gated by a new `MUSE_PROACTIVE_PATTERN_ENABLED`
env (default false initially).

## Anti-spam

- Per-pattern cooldown (default 24h): a fired suggestion doesn't
  refire for the same id until the cooldown elapses.
- Per-pattern veto: user can `muse forget pattern:<id>` to drop a
  pattern permanently. Veto persists across detector rebuilds.
- Confidence floor: `MUSE_PROACTIVE_PATTERN_MIN_CONFIDENCE` env
  (default 0.7). A two-week-old cluster of two matches doesn't fire.

## Privacy & opt-in

Detector reads from local-only files. No upload. New patterns are
not added to user-memory automatically — they live in a separate
`~/.muse/patterns.json` file that the user can `cat` and audit.
`muse pattern list` + `muse pattern remove <id>` are CLI surfaces;
`muse pattern show <id>` shows the supporting signals that built
the cluster.

## Implementation order (3-4 iters)

1. **Signal aggregator** — `aggregateActivitySignals(env)` reading
   activity.jsonl / tasks.json / notes mtimes into a single
   `PatternSignals` envelope. Direct unit test.

2. **Time-of-day-action detector** (category 1). Stable id =
   sha256("tod:" + weekday + hour-band + path-family). Unit test
   with seed fixture.

3. **Weekly-task detector** (category 2). Same shape.

4. **Proactive integration** — gate behind env, fire through
   the existing notice channel; cooldown enforced via
   `~/.muse/patterns-fired.json` sidecar (mirror of
   `proactive-fired.json`).

## Out of scope

- Sequence-based patterns (category 3 above).
- Multi-day session reconstruction (today's activity log is
  request-level, not session-level).
- ML / embedding-based clustering — start with weekday +
  hour-band + path-family deterministic rules and only escalate
  if false-positive rate is unacceptable.
