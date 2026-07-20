/**
 * Pure helpers lifted out of `agent-runtime.ts`. Every function here is
 * `this`-free by construction — it was already module-level in the runtime
 * file — so this module is a LEAF: `agent-runtime.ts` imports it and it
 * imports nothing back.
 */

import type { ModelMessage, ModelToolCall } from "@muse/model";
import { COMPACTION_SUMMARY_PREFIX } from "@muse/memory";
import type { EgressAuthority } from "@muse/tools";
import {
  checkActuatorProvenance,
  describeProvenanceExfil,
  describeProvenanceTaint,
  isFirstPartyReadTool,
  EXECUTE_SINK_ARG_NAMES,
  OUTBOUND_SEND_SINK_ARG_NAMES,
  OUTBOUND_SEND_TOOL_NAMES,
  WRITE_SINK_ARG_NAMES
} from "./actuator-provenance-gate.js";
import type { AgentRunContext } from "./types.js";
import { joinUserMessages } from "./internals.js";

// A non-finite (NaN / Infinity) limit must fall back to the safe
// default, not disable the bound. Preserves the prior semantics
// (explicit 0 → 0, negative → 0, fractional truncates) and only
// changes the NaN/Infinity → default behaviour.
export function clampRunLimit(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : fallback;
}

export function normalizeExemplarCount(value: number | undefined): number {
  const defaultCount = 3;
  const maximumCount = 10;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= maximumCount
    ? value
    : defaultCount;
}

/** The single PTC orchestrator tool name (defined as a MuseTool in `@muse/tools`). */
export const RUN_TOOL_PLAN_TOOL_NAME = "run_tool_plan";

/**
 * Seed the run's egress authority from the FULLY ASSEMBLED transcript (after
 * `prepareInvocation`, so the system message already carries recall/notes/
 * calendar — the taint ledger never saw that, but egress needs it as a
 * TRUSTED source per S5). Only `user`/`system` roles feed trusted-observed
 * URLs directly; a `tool` message feeds trusted ONLY when it came from a
 * first-party store (mirrors the taint ledger's own first-party split), else
 * untrusted-observed. `assistant` content is NEVER scanned — an authorizing
 * role must never be the model's own prose, or it could compose a URL in
 * turn 1 and "quote" it in turn 2 (self-laundering). Called on every run
 * (including a 2nd+ turn, since a fresh `run()` gets a fresh, re-seeded
 * authority) so history carries forward correctly without special-casing.
 */
export function seedEgressAuthorityFromMessages(
  egressAuthority: EgressAuthority | undefined,
  messages: readonly ModelMessage[]
): void {
  if (!egressAuthority) {
    return;
  }
  for (const message of messages) {
    if (message.role === "assistant") {
      continue;
    }
    if (message.role === "tool" && !isFirstPartyReadTool(message.name ?? "")) {
      egressAuthority.recordUntrustedText(message.content);
      continue;
    }
    egressAuthority.recordTrustedText(message.content);
  }
}

/**
 * Forward an agent run's opt-in logprobs request onto the ModelRequest. Absent
 * → `{}` so the wire is byte-identical to before (no `logprobs` field). Pulled
 * out + structurally typed so both the generate and stream seams stay in sync.
 */
export function logprobsFromInput(
  input: { readonly logprobs?: boolean; readonly topLogprobs?: number }
): { logprobs?: true; topLogprobs?: number } {
  if (!input.logprobs) {
    return {};
  }
  return {
    logprobs: true,
    ...(input.topLogprobs !== undefined ? { topLogprobs: input.topLogprobs } : {})
  };
}

export function deepCloneAndFreeze<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== "object" || Object.isFrozen(candidate)) return;
    for (const nested of Object.values(candidate)) freeze(nested);
    Object.freeze(candidate);
  };
  freeze(clone);
  return clone;
}

const DEFAULT_TOOL_OPPORTUNITY_OBSERVER_TIMEOUT_MS = 1_000;
const MAX_TOOL_OPPORTUNITY_OBSERVER_TIMEOUT_MS = 10_000;

export function normalizeToolOpportunityObserverTimeout(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(MAX_TOOL_OPPORTUNITY_OBSERVER_TIMEOUT_MS, Math.max(1, Math.trunc(value)))
    : DEFAULT_TOOL_OPPORTUNITY_OBSERVER_TIMEOUT_MS;
}

export async function settleWithin(promise: Promise<unknown>, timeoutMs: number): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      promise,
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Append an auxiliary-model dropped-context summary to the
 * deterministic `[Conversation summary …]` system message, preserving the
 * deterministic floor (the `[Key details]`/pinned-entity blocks). Returns
 * the array unchanged when `aux` is blank or no compaction-summary message
 * is present (e.g. a turn that didn't compact). Pure.
 */
export function augmentCompactionSummary(
  messages: readonly ModelMessage[],
  aux: string
): readonly ModelMessage[] {
  const trimmed = aux.trim();
  if (trimmed.length === 0) {
    return messages;
  }
  const idx = messages.findIndex(
    (message) =>
      message.role === "system" &&
      typeof message.content === "string" &&
      message.content.startsWith(COMPACTION_SUMMARY_PREFIX)
  );
  if (idx === -1) {
    return messages;
  }
  const target = messages[idx]!;
  const augmented = { ...target, content: `${target.content}\n[Dropped-context summary: ${trimmed}]` };
  return messages.map((message, i) => (i === idx ? augmented : message));
}

/**
 * Provenance warning for an actuator call whose sink args derive from
 * untrusted tool output (the run's taint ledger) rather than the user's own
 * messages this run. Covers two actuator classes: OUTBOUND-SEND tools (sink =
 * recipient/subject/body/url) and EXECUTE-risk tools (sink = the command/code
 * payload) — a poisoned tool result must not silently supply a send's
 * recipient nor an RCE command. Execute-risk tools are already always gated,
 * so this only enriches that confirm. Returns `undefined` for read/write
 * non-send tools, when the ledger is empty/absent, or when no sink arg is
 * tainted — so ordinary calls carry no extra friction.
 */
export function actuatorProvenanceWarning(
  context: AgentRunContext,
  toolCall: ModelToolCall,
  risk: "read" | "write" | "execute"
): string | undefined {
  const ledger = context.taintLedger;
  if (!ledger) {
    return undefined;
  }
  const isOutboundSend = OUTBOUND_SEND_TOOL_NAMES.includes(toolCall.name);
  const isExecute = risk === "execute";
  const isWrite = risk === "write";
  if (!isOutboundSend && !isExecute && !isWrite) {
    return undefined;
  }
  const sinkArgNames = [
    ...(isOutboundSend ? OUTBOUND_SEND_SINK_ARG_NAMES : []),
    ...(isExecute ? EXECUTE_SINK_ARG_NAMES : []),
    ...(isWrite ? WRITE_SINK_ARG_NAMES : [])
  ];
  // The write class — and ONLY it — trusts the user's own stores as an origin:
  // a task built from the user's own note is not third-party-derived, while a
  // send/execute keeps the strict user-messages-only haystack (a note can quote
  // a poisoned page; broadening there would weaken the higher-blast-radius
  // gates). Purely additive — no existing class changes behaviour.
  const trustedHaystack = isOutboundSend || isExecute
    ? joinUserMessages(context.input.messages)
    : `${joinUserMessages(context.input.messages)}\n${ledger.firstPartyHaystack()}`;
  const check = checkActuatorProvenance({
    args: toolCall.arguments ?? {},
    ledger,
    sinkArgNames,
    trustedHaystack,
    // The confidentiality axis applies to content LEAVING the box or being
    // executed — not to a write into the user's own stores (S3b already trusts
    // first-party content there, and warning that "your note contains your
    // note" would be noise).
    ...(isOutboundSend || isExecute ? { privateHaystack: ledger.firstPartyHaystack() } : {})
  });
  // Two DIFFERENT harms, and until now they read identically: a send built from
  // a poisoned web page and a send built from the user's own note both said
  // "traces to untrusted tool:X". That trains the user to click through the one
  // warning that matters. Name them separately — injection (third-party content
  // steering an action) and exfiltration (the user's private content leaving in
  // words they never typed).
  const notes: string[] = [];
  if (check.untrustedDerived) {
    notes.push(describeProvenanceTaint(check));
  }
  if (check.privateDerived) {
    notes.push(describeProvenanceExfil(check));
  }
  return notes.length > 0 ? notes.join(" · ") : undefined;
}
