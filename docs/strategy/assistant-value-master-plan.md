# Assistant-Value Master Plan — 2026-07-13

Origin: a 5-lens fable5 audit of Muse's system prompt and product, commissioned to
answer three questions: (1) is the system prompt at/above openclaw+hermes level,
(2) beyond security, does Muse perform its *assistant value* well — disposition,
AX, personalization, (3) can we answer "so what can you actually DO with Muse?"
and does self-improvement really work like hermes. Every finding below is
code-grounded (file:line in the source reports) and framed **model-agnostic** —
Muse must be top-tier on any model plugged in (small local → frontier cloud), not
tuned for gemma4.

## The one-line diagnosis

**Muse is a deep, well-engineered product whose value is hidden.** The machinery
(deterministic register/brevity/mirror layers, grounded proactivity, a real
self-improvement loop, 102 commands, working actuators/channels) is at or above
openclaw/hermes. What loses is **surfacing and defaults**: placeholder prompts on
the flagship surface, learned personalization demoted on live surfaces, a
self-description that covers ~5% of the product, and self-improvement that ships
half-off behind opt-in flags. Engine: a Ferrari. State: parked with the cover on.

## Four seams where value leaks

1. **Prompt quality** — the flagship `chat` surface role was a dev placeholder
   (`"(agent runtime)…"`); the `ask` role asserted a wrong engine (`via local
   Qwen`, a model-agnostic violation); the default personality layer never runs
   on a fresh install; the empty-memory `/api/chat` path carried no abstention
   line. (Lenses A, B)
2. **Personalization on live surfaces** — `buildMusePersona`'s rich learned model
   (vetoes absolute, caution marks) reaches only the CLI. Web/Telegram get
   `renderUserMemorySection`, which says "treat as soft hints, not directives"
   (inverting the veto contract), keeps the OLDEST N entries (`.slice(0, max)` —
   drops newly-learned facts), and strips vetoes/caution-marks. "Learns you"
   is betrayed exactly where a phone user lives. (Lens C)
3. **Value legibility** — ~80% of the "what can you do?" problem. Every
   self-description surface (`META_RESPONSE`, desktop meta, `--help`, onboarding,
   demo) describes only the notes-citation slice; Telegram has no meta path at
   all. The product grew 10× while the static strings froze. (Capability audit)
4. **Self-improvement defaults** — the loop is REAL and more honestly verified
   than hermes (live cross-session A/B, 0-false-contradict decay, 563 tests + 13
   live cases green), but unattended decay/consolidation, preference inference,
   and episodic capture all ship behind `MUSE_SELFLEARN_ENABLED`/flags default
   OFF. hermes's edge is DEFAULTS, not machinery. (Self-improvement audit)

## Tiered plan (value-ranked; shipped items marked)

### Shipped this session
- ✓ Injection provenance S1–S3 (deterministic source→sink taint on outbound-send
  + execute actuators — a wedge no rival has).
- ✓ Drift-gate blind-spot fix (mixed EN+KO identity strings now caught;
  `MUSE_IDENTITY_LEAD` single-sources the channel fast-path).
- ✓ user-model gap2 S1 (learned-slot vocabulary single-sourced in `@muse/recall`).
- ✓ SURFACE_ROLES: `chat` placeholder → real assistant contract (knows-you,
  lead-with-answer, clarify-vs-assume, abstain+offer, action-confirmation echo,
  once-only anticipation); `ask` model-agnostic. Live identity battery 12/12;
  behavioral probes confirm abstain+offer / no-false-done / lead-with-answer.
- ✓ **T1-① Value legibility** — one deterministic, env-aware, job-grouped
  capability describer (`@muse/prompts/capability-describer.ts`) answers "what
  can you do?" on ALL meta surfaces (CLI ask + chat + NEW Telegram parity),
  replacing three notes-only strings. Honest ("connected" vs "available — set X"),
  drift-locked to COMMAND_STUBS, scope-disciplined (group turns never leak the
  owner's armed-integration config).
- ✓ **T1-② API/channel user-model fix** — the live `[User Memory]` block no longer
  demotes the learned model: "soft hints, not directives" → honour prefs / steer
  to goals / NEVER propose vetoed + a data-firewall line; `.slice(0,max)` →
  `.slice(-max)` (stops dropping newly-learned facts); veto/goal split into their
  own lists; every value escaped. Slot vocab moved down to `@muse/agent-core`
  (recall re-exports). Live-verified: a stored veto:coffee → no coffee suggested.
- ✓ **T2-⑤ Default personality layer wired** — a fresh install (no persona.md) now
  gets Muse's warm bluebird character instead of a blank voice; identity battery
  12/12 with it active.

### Remaining (ranked; NOT shipped this session)
- ✓ **T2-③ Self-improvement defaults — SHIPPED (a8c92ab87, 진안 approved 2026-07-13).**
  And the audit's premise was WRONG in an important way: the machinery was NOT
  merely "real but off". Live measurement (new `eval:playbook-credit`) found the
  credit-assignment floors (0.55/0.62) sat ABOVE the genuine cue→strategy band —
  a feedback cue and an imperative strategy are different text distributions, so
  they score 0.30–0.58, not paraphrase-high. Credit fired on 3/13 real feedback
  cues and **decay on 0/13 (dead code)**. Redesigned to argmax + low absolute
  floor + a MARGIN gate (the absolute bands OVERLAP with no-match feedback; the
  margins do not): credit 10/13, decay 9/13, mis-credits 0. Only THEN was the
  default flipped ON (brakes unchanged: probation-until-reinforce, subtractive-
  only decay, learning-pause kill switch, channel notice; opt out with
  `MUSE_SELFLEARN_ENABLED=false`). eval:self-improving 39/39.
- **T2-④ `muse auth gmail`** — guided OAuth + refresh-token store (encrypted
  secrets store exists) to unlock the already-built email/triage/sync domain. A
  large new surface (OAuth loopback flow) — scoped as its own future slice.
- Follow-up (flagged): `buildPersonaSnapshot` (the compaction-summary path) still
  uses `slice(0,)` and doesn't split/escape vetoes — the T1-② twin, not yet done.

### Tier 3 — polish / follow-on
- Cross-domain chain v1 (conflict → propose reschedule → draft message).
- user-model gap2 S2–S4 (top-K relevance + provenance tags, style accumulator,
  honesty-wall + cross-session eval).
- Vetoes on the channel fast-path snapshot; "act on what you know" action line;
  cross-session continuity line.
- identity-core vendor-denial dedup + one calm-competence line — CAVEATED: ship
  only if the live identity battery stays green on a local AND a cloud adapter.
- Injection S3b (write-risk actuators) + S4 (exfil); help grouped by job; 3-beat
  `muse demo`; jobs-first README/onboarding.

## Non-negotiable gates (every slice)
Live identity battery stays 12/12 (MODEL_LEAK=0, SYCOPHANT=0); fabrication=0;
IMMUTABLE-CORE untouched; each prompt change verified with the lens's live probe
on the real `/api/chat`, not code-only; independent adversarial gate before ship;
model-agnostic (no change may help one model tier and harm another).
