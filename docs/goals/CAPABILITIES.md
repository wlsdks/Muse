# Capabilities — the loop's only success metric

Append-only inventory of **real, user-exercisable** Muse
capabilities. One line per capability: what the user can do, the
exact command/surface, and the executable check that proves it.

Rules (enforced by `.claude/rules/iteration-loop.md`):

- Every shipped outward goal MUST append exactly one new line here.
  The `<check>` MUST be a concrete automated test or smoke id that
  actually runs green under `pnpm check` / `pnpm smoke:broad` /
  `pnpm smoke:live` and asserts the *capability* end-to-end (not
  that code compiles). Prose with no runnable id is not a check.
- **Cross-time falsification:** every iteration's first action is
  to run the newest line's check and prove it still passes. A
  faked/broken line = the next iteration's whole job is to fix it.
- **Regression sweep:** every 10th iteration re-runs ALL checks;
  any regression = next iteration must restore it.
- A request/response-path capability whose `smoke:live` did NOT
  actually run is tagged `[UNVERIFIED-LIVE]`; it does not count
  until a later iteration runs the live check and drops the tag.
- Append-only. Never delete or weaken a line.
- **The success metric is NOT this line count.** It is
  `OUTWARD-TARGETS.md` bullets flipped `[ ]`→`[x]`. A line here is
  the *evidence* for a flip (cite the bullet it delivers); a line
  that adds no bullet flip is thin and does not satisfy the metric.
  No bullet flipped in the last 5 iterations ⇒ next iteration's
  sole mandate is to flip one end-to-end. Flat bullets =
  degeneration; act on it — never stop, never ask a human.

Format: `- [<axis>] <capability> — <command/surface> — <runnable check id> — P<n> bullet`
axis ∈ Reach | Anticipation | Autonomy | Presence

## Inventory

P0–P21's full verified ledger is preserved in
`archive/CAPABILITIES-through-2026-05-27.md` (human reset
2026-05-27 to keep the loop-facing file lean — history intact, not
deleted). The lines below are the delivered foundation that the
active P22 target extends; new P22 lines append here.

- [Anticipation] Proactive notice loop (upcoming events / reminders) — `apps/api` proactive daemon tick — `apps/api` proactive-tick tests
- [Anticipation] Self-queued follow-up promises fire later — followups daemon tick — `runDueFollowups` tests
- [Autonomy] Standing-objective evaluation fires its actuator — objectives daemon tick — `runDueObjectives` tests
- [Anticipation] Ambient OS signal drives a proactive notice — `runAmbientNoticeTick` + `MacOsActiveWindowSource` — ambient-notice-loop tests
- [Anticipation] Page-change web-watch fires an edge-triggered notice — `createWebWatchRunner` (HTTP + Chrome source) — web-watch-runner / web-watch-chrome tests
- [Anticipation] Proactive notice delivered to a real channel — `ProactiveNoticeSink` over the messaging registry (Telegram) — `sendWithRetry` + proactive-notice-loop tests
- [Anticipation] One-process daemon launcher fires a real proactive tick — `muse daemon --once` — `apps/cli/src/commands-daemon.test.ts` (imminent task delivered to a contract-faithful messaging sink; quiet tick sends nothing; unknown provider fails closed) — P22-1a bullet
- [Presence] Episode forgetting is now importance-aware — a pivotal old session resists being vacuumed away while a trivial recent one fades (FadeMem, arXiv 2601.18642: biologically-inspired forgetting, decay modulated by importance) — `vacuumEpisodes` dropped purely-oldest-by-`endedAt` at the cap; now `computeEpisodeRetention` scores each episode `exp(-ageDays / (halfLife·(1 + w·importance/10)))` so importance EXTENDS the half-life (importance-10 ⇒ ~3× slower fade), and `selectRetainedEpisodes` keeps the highest-retention `cap` (newest-then-id tie-break). Back-compatible: an UNSCORED corpus reduces to recency ordering, so chronological vacuum is byte-identical until importance is present — `@muse/mcp` episode-retention.test.ts (age decay; importance slows fade; unscored→recency; unparseable→0; importance tips comparable ages: a 35-day importance-10 session out-retains a 25-day importance-1 one at the cap; deterministic ties) + existing vacuum suite stays green (unscored episodes still pruned oldest-first) — research-applied slice (no new dep, deterministic/local; builds on the importance arc)
- [Presence] Auto-extracted memory now resolves each fact with an explicit operation instead of blind-overwriting (Mem0, arXiv 2504.19413: per-candidate ADD/UPDATE/DELETE/NOOP) — `classifyMemoryOperation(existing, incoming)` is deterministic over the extractor's output (no extra model call): NOOP when a value re-confirms what's stored → SKIPS the redundant write + provenance entry (a re-mention no longer logs a fresh "learned" event); DELETE when the value is a no-value/retraction token (none/n/a/unknown/없음/모름/…) → the key is FORGOTTEN via the store's `forget` instead of storing junk like "unknown"; ADD/UPDATE upsert + record provenance as before; the auto-extract persist reads existing memory once and routes each fact/preference through it — `@muse/memory` memory-operation.test.ts (classifier: add/noop/update/delete EN+KO tokens; auto-extract integration: re-confirm → no new provenance, changed → upsert+provenance, retraction → key forgotten) + full memory suite 213 green (new facts still ADD as before, back-compatible) — research-applied slice (arXiv id cited in code; deterministic, no new dep, no extra LLM call)
- [Reach] A natural-language tool-selection path is available + measured against the native one (Natural Language Tools, arXiv 2510.14453: stating the tool choice in prose + parsing it deterministically beats forcing JSON on small/open-weight models) — `parseNaturalLanguageToolSelection(text, toolNames)` deterministically maps a model's prose answer to one known tool (earliest-named wins; whole-token match so `time_now` ≠ `my_time_now_helper`; explicit no-tool/none/없음 → none) and `pnpm eval:tools:nl` compares NATIVE (Hermes JSON tool-call) vs NL one-shot accuracy on the confusable time set — `@muse/tools` nl-tool-selection.test.ts (single pick, "use A not B"→A, no-tool EN+KO, embedded-name not matched, empty) + LIVE qwen3:8b: native 7/7 (100%) AND NL 7/7 (100%) on the confusable time set — verified finding: Muse's tuned tool names are ALREADY at the selection ceiling, so the NL path is kept as a reusable parser + comparison gate rather than wired (evidence-based: add NL complexity only when a confusable set's native accuracy drops below ceiling) — research-applied slice (arXiv id cited in code; no new dep, core tool path untouched)
- [Presence] Muse applies LEARNED STRATEGIES from past feedback, not just avoidances — a self-improving playbook (ACE — Agentic Context Engineering, arXiv 2510.04618: a frozen model improves by accumulating small strategy deltas in an evolving context, no fine-tuning) — the POSITIVE counterpart to veto-avoidance: `applyPlaybook` injects a `[Learned Strategies]` system block (mirrors the veto-avoidance seam; conservative — zero strategies/no userId ⇒ exact no-op; fail-open) wired into the live agent-runtime context pipeline behind a duck-typed `PlaybookProvider`; the durable `~/.muse/playbook.json` store (`@muse/mcp`, atomic/tolerant/capped) is adapted by `buildPlaybookProvider` (MUSE_PLAYBOOK default-on) and populated via `muse playbook add|list|remove` — `@muse/agent-core` playbook.test.ts (conservative/fail-open/inject + injection-collapse + LIVE-runtime wiring: a recorded strategy reaches a real createAgentRuntime run's system prompt, none → no-op) + LIVE qwen3:8b EFFECT MEASUREMENT: with the strategy "answer in at most 6 words" injected, a question that drew a long multi-paragraph reply WITHOUT it returned a 7-word "Paris. Famous for art, fashion, and culture." WITH it — the learned strategy measurably changed the model's output — research-applied slice (arXiv id cited in code; no new dep; mirrors the proven veto-avoidance pattern end-to-end)
- [Anticipation] The daemon launcher also fires due follow-ups in the same process — `muse daemon --once` (proactive + followup ticks) — `apps/cli/src/commands-daemon.test.ts` (a DUE followup is synthesized + delivered to a contract-faithful sink alongside the proactive tick; proactive-only cases stay hermetic) — P22-1b bullet
- [Anticipation] The daemon launcher also fires ambient (perception) rule matches in the same process — `muse daemon --once` (proactive + followup + ambient ticks) — `apps/cli/src/commands-daemon.test.ts` (a matching ambient rule delivers a notice to a contract-faithful sink; ambient skipped cleanly when no MUSE_AMBIENT_RULES) — P22-1c bullet
- [Anticipation] The daemon launcher also runs read-only web-watch polling in the same process — `muse daemon --once` (proactive + followup + ambient + web-watch ticks) — `apps/cli/src/commands-daemon.test.ts` (an "appears" trigger over an injected fetch delivers a notice to a contract-faithful sink; web-watch skipped cleanly when no MUSE_WEB_WATCH_CONFIG) — P22-1d bullet
- [Autonomy] The daemon launcher also re-evaluates standing objectives + notifies on met in the same process — `muse daemon --once` (now all five ticks: proactive + followup + ambient + web-watch + objectives) — `apps/cli/src/commands-daemon.test.ts` (a MET objective notifies the user via a contract-faithful sink; objectives skipped cleanly when no model resolves) — P22-1e bullet
- [Anticipation] The daemon foreground loop shuts down cleanly on a stop signal — `muse daemon` (ctrl-c) — `apps/cli/src/commands-daemon.test.ts` runDaemonLoop suite (stops on signal + returns tick count, a throwing tick doesn't stop the loop, the interruptible sleep resolves immediately on stop instead of waiting out the interval) — P22-1f bullet
