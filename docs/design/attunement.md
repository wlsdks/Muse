---
title: Attunement architecture and data contract
audience: [engineering, product, security, agents]
purpose: Define the closed loop, privacy boundary, and implementation seams for Attunement
status: roadmap
updated: 2026-07-13
related: [../strategy/attunement.md, ../goals/attunement-implementation-plan.md, ../privacy-and-data.md]
---

# Attunement architecture and data contract

This document specifies a roadmap. The full Attunement loop is **not shipped**. Existing
components named below are reusable substrates; their presence must not be presented as
end-to-end behavior.

In plain language: start with an unfinished life or work thread the user chooses, build a
small “where was I?” pack from explicitly linked items, record whether it helped, and change
the next pack in only a few allowed ways. Observation is added later to improve timing—not
to guess what part of the user's life an app belongs to.

## System boundary

```text
chosen PersonalThread + explicitly linked items
  → Continuity Pack → outcome → allowed policy update → next pack

opt-in observation (later)
  → safer timing / rhythm evidence ───────────────────────┘
```

The LLM may phrase an explanation or summarize a Continuity Pack. It does not decide
consent, retention, interruption budgets, evidence sufficiency, or action approval.

## Reusable current seams

| Concern | Existing seam | Honest limitation |
|---|---|---|
| Ambient input | `packages/proactivity/src/macos-ambient-source.ts`, `windows-ambient-source.ts`, `ambient-notice-loop.ts` | Produces snapshots; it does not persist dwell, transitions, or personal activity sequences. API/CLI source wiring is not yet symmetric. |
| Context safety | `packages/agent-core/src/ambient-context.ts` | Bounds and redacts untrusted context, but is not an Observe store. |
| Pattern primitives | `packages/memory/src/pattern-signals.ts`, `pattern-detector.ts`, `pattern-orchestration.ts` | Primarily note/task timing and limited CLI activity—not a cross-domain personal rhythm. |
| Intervention control | `packages/proactivity/src/interruption-gate.ts`, `packages/stores/src/proactive-trust-ledger.ts` | Budgets, digest, keep/acted/veto exist; pattern outcomes are not connected end to end. |
| Browser actuator | `packages/browser/src/controller.ts`, `browser-tools.ts`, `matcher.ts` | Strong semantic target observation and fail-close matching; no equivalent generic desktop action tree. |
| Audit/resume | `packages/runtime-state/src/run-history.ts`, `file-checkpoint-store.ts`, CLI `.muse/runs/*.jsonl` | Useful for Muse-run friction; some run history is in-memory without PostgreSQL. |

## Personal-thread contract

Muse must know which part of the user's life they mean before it combines a task, note,
reminder, calendar event, contact, run, or browser visit. The first version gets that binding
from the user or an existing deterministic link. An LLM may summarize linked evidence; it
may not invent the association.

```ts
interface PersonalThreadLink {
  threadId: string;
  artifactType:
    | "task"
    | "note"
    | "reminder"
    | "calendar-event"
    | "contact"
    | "muse-run"
    | "checkpoint"
    | "browser-visit";
  artifactId: string;
  linkedBy: "user" | "deterministic-rule";
  linkedAt: string;
}
```

## Minimal observation contract

The first persisted unit is an app session transition, not a raw screen sample:

```ts
interface ObservationEvent {
  id: string;
  source: "active-app" | "muse-run" | "browser-history";
  threadId?: string;
  appId?: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  consentVersion: number;
}
```

`threadId` is present only while the user has an explicit thread active. App identity alone
never decides whether an activity belongs to work, health, family, travel, or anything else.

Required envelope fields include provenance, source-specific retention, redaction result,
and a stable evidence ID. Window titles, selected text, clipboard contents, keystrokes, and
screenshots are not stored in the default profile. Browser history remains a separate,
explicit opt-in corroborating source.

## State and evidence

The Personal Rhythm Model v0 uses deterministic aggregates: dwell distributions by app
and time bucket, stable-block length, transition counts, and rapid-switch episodes. These
are hypotheses, not diagnoses.

Every friction candidate contains:

- evidence IDs and time range;
- deterministic rule/version and confidence;
- minimum recurrence threshold;
- user label: `normal`, `exploring`, `stuck`, or `unknown`;
- suppression state and expiry.

No user-facing claim is allowed without resolvable evidence. A `normal` or `exploring`
correction suppresses that candidate immediately.

## Intervention and outcome contract

An intervention records its evidence, policy decision, chosen form, offered action, and
delivery boundary. The canonical outcome enum is `used`, `adjusted`, `ignored`, or
`rejected`. `openedAt` is a separate delivery event, not an outcome. A permanent veto is a
`rejected` outcome with an explicit suppression instruction. Later stable dwell is a
separate behavioral observation, not proof of causality.

Adaptation may change:

- the focus threshold;
- evidence/recurrence threshold;
- quiet/surface boundary;
- intervention form (`silent-context`, `one-line-offer`, `digest`);
- source or candidate suppression.

It may not silently widen observed sources, retention, action permissions, recipients, or
third-party effects.

## Privacy and permission gates

Observe follows five testable properties:

1. **Local-first:** observation state is an owner-only local store; cloud use follows the
   existing provider choice and must never silently receive observation data.
2. **Visible:** status shows enabled sources, fields, retention, last sample, and derived
   hypotheses.
3. **Pausable:** pause stops OS reads by the next tick; disabled means zero source polling.
4. **Inspectable:** every hypothesis resolves to redacted evidence and rule version.
5. **Forgettable:** delete by event, time range, source, or all; derived state is rebuilt.

Per-app deny lists, private-window exclusion, atomic writes, `0600` permissions, TTL tests,
and source-level consent versioning are release gates. Observe must not ship before pause,
inspect, and forget work.

## Computer-use boundary

The near-term actuator is browser-only plus Muse-local notes/tasks. It reuses semantic
snapshots, stable refs, ambiguous-target refusal, approval, action budgets, prompt-injection
defanging, and checkpoints. No automatic form submission, third-party send, purchase, or
arbitrary desktop control is part of the first loop.

## Observability

Trace each observation decision, feature version, candidate evidence, intervention policy,
outcome, adaptation, and deletion cascade. Product metrics must be derivable without storing
raw content. The implementation gates are defined in the
[implementation plan](../goals/attunement-implementation-plan.md).
