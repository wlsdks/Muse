/**
 * Pure compile seam for `POST /api/flows/draft` (코파일럿 초안): prompt
 * construction + response parsing, no Fastify, no model call. Kept separate
 * from `flows-draft-routes.ts` so the prompt shape and the parse/validate
 * contract are unit-tested without a fake HTTP server, mirroring
 * `flow-edit-compile.ts`'s "compile seam" pattern on the web side.
 *
 * The model must answer with ONLY a JSON object matching `FlowDraftPayload`;
 * everything else here is deterministic validation against the REAL
 * scheduler contract (`@muse/scheduler`'s `validateCronExpression` /
 * `computeNextRunAt`) — never a second, looser grammar.
 */

import { extractFirstJsonObject } from "@muse/agent-core";
import { computeNextRunAt } from "@muse/scheduler";

export interface FlowDraftPayload {
  readonly name: string;
  readonly cronExpression: string;
  readonly prompt: string;
  readonly notifyChannel: string | null;
  readonly retry: boolean;
}

export interface FlowDraftPrompt {
  readonly system: string;
  readonly user: string;
}

const RESPONSE_SCHEMA_LINE =
  'Respond with ONLY a single JSON object, no prose, no code fence: {"name": string, "cronExpression": string (5-field cron: minute hour day month weekday), "prompt": string, "notifyChannel": string|null, "retry": boolean}.';

const FEW_SHOT_EXAMPLES = `Example 1
Input: 매일 아침 9시에 일정 요약해서 알려줘
Output: {"name": "아침 일정 요약", "cronExpression": "0 9 * * *", "prompt": "오늘 일정을 요약해서 알려줘", "notifyChannel": null, "retry": false}

Example 2
Input: every monday at 9am summarize my week and send it to telegram:555
Output: {"name": "Weekly summary", "cronExpression": "0 9 * * 1", "prompt": "Summarize my week", "notifyChannel": "telegram:555", "retry": false}`;

/** The system+user pair for the FIRST generation attempt. */
export function buildFlowDraftPrompt(text: string): FlowDraftPrompt {
  return {
    system: `You turn a one-line description of a recurring automation into a scheduled-job draft.\n${RESPONSE_SCHEMA_LINE}\n\n${FEW_SHOT_EXAMPLES}`,
    user: `Input: ${text}\nOutput:`
  };
}

/** The system+user pair for the ONE deterministic repair retry after an
 * invalid first response — re-prompts with the exact validation failure so
 * the model corrects the specific field, not a fresh guess. */
export function buildFlowDraftRepairPrompt(text: string, previousRaw: string, validationError: string): FlowDraftPrompt {
  const base = buildFlowDraftPrompt(text);
  return {
    system: base.system,
    user: `Input: ${text}\nYour previous answer was invalid: ${validationError}\nPrevious answer: ${previousRaw}\nReturn ONLY the corrected JSON object matching the schema above.\nOutput:`
  };
}

const REVISION_FEW_SHOT_EXAMPLES = `Example 1
Current draft: {"name": "아침 브리핑", "cronExpression": "0 9 * * *", "prompt": "오늘 일정을 요약해서 알려줘", "notifyChannel": null, "retry": false}
User request: 8시 반으로 바꿔줘
Output: {"name": "아침 브리핑", "cronExpression": "30 8 * * *", "prompt": "오늘 일정을 요약해서 알려줘", "notifyChannel": null, "retry": false}

Example 2
Current draft: {"name": "Weekly summary", "cronExpression": "0 9 * * 1", "prompt": "Summarize my week", "notifyChannel": null, "retry": false}
User request: also send it to telegram:123
Output: {"name": "Weekly summary", "cronExpression": "0 9 * * 1", "prompt": "Summarize my week", "notifyChannel": "telegram:123", "retry": false}`;

const REVISION_SYSTEM = `Here is the current draft JSON for a scheduled-job automation. Apply the user's requested change and return the FULL updated JSON — all 5 fields, in the same shape — changing ONLY what the user asked and leaving every other field EXACTLY as it was.\n${RESPONSE_SCHEMA_LINE}\n\n${REVISION_FEW_SHOT_EXAMPLES}`;

/** The system+user pair for a REVISION turn — the user keeps talking after
 * an earlier draft ("아니 8시 반으로 바꿔줘") and the model must return the
 * SAME 5-field shape with only the requested field(s) changed. */
export function buildFlowDraftRevisionPrompt(text: string, currentDraft: FlowDraftPayload): FlowDraftPrompt {
  return {
    system: REVISION_SYSTEM,
    user: `Current draft: ${JSON.stringify(currentDraft)}\nUser request: ${text}\nOutput:`
  };
}

/** The one deterministic repair retry for a revision turn — same discipline
 * as `buildFlowDraftRepairPrompt`, echoing the current draft again so the
 * model doesn't lose track of which fields must stay unchanged. */
export function buildFlowDraftRevisionRepairPrompt(
  text: string,
  currentDraft: FlowDraftPayload,
  previousRaw: string,
  validationError: string
): FlowDraftPrompt {
  return {
    system: REVISION_SYSTEM,
    user: `Current draft: ${JSON.stringify(currentDraft)}\nUser request: ${text}\nYour previous answer was invalid: ${validationError}\nPrevious answer: ${previousRaw}\nReturn ONLY the corrected JSON object matching the schema above, with ALL 5 fields.\nOutput:`
  };
}

export type FlowDraftParseResult =
  | { readonly ok: true; readonly value: FlowDraftPayload }
  | { readonly ok: false; readonly error: string };

const CRON_FIELD_SHAPE_RE = /^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/u;

const DRAFT_FIELD_NAMES = ["name", "cronExpression", "prompt", "notifyChannel", "retry"] as const;

export interface ParseFlowDraftResponseOptions {
  /** Revision turns must echo back ALL 5 fields (notifyChannel may be
   * `null` but the key must be present) — a dropped field is never silently
   * defaulted, since that would silently discard the user's earlier
   * preference (e.g. a previously-set notify channel). */
  readonly requireAllFields?: boolean;
}

/** Parses + validates a raw model completion against `FlowDraftPayload`.
 * Never throws — every failure returns a human-readable `error` describing
 * exactly what failed, which the route re-feeds into the repair retry (or,
 * on a second failure, returns verbatim in the 422 body). */
export function parseFlowDraftResponse(raw: string, options?: ParseFlowDraftResponseOptions): FlowDraftParseResult {
  const candidate = extractFirstJsonObject(raw);
  if (!candidate) {
    return { error: "model response did not contain a JSON object", ok: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return { error: "model response's JSON object failed to parse", ok: false };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: "model response was not a JSON object", ok: false };
  }

  const record = parsed as Record<string, unknown>;

  if (options?.requireAllFields) {
    for (const field of DRAFT_FIELD_NAMES) {
      if (!Object.hasOwn(record, field)) {
        return { error: `revision response is missing required field '${field}'`, ok: false };
      }
    }
  }

  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (name.length === 0) {
    return { error: "name must be a non-empty string", ok: false };
  }

  const cronExpression = typeof record.cronExpression === "string" ? record.cronExpression.trim() : "";
  if (!CRON_FIELD_SHAPE_RE.test(cronExpression)) {
    return { error: "cronExpression must be a 5-field cron expression (minute hour day month weekday)", ok: false };
  }
  try {
    computeNextRunAt({ cronExpression, timezone: "UTC" });
  } catch {
    return { error: `cronExpression is not a valid cron expression: ${cronExpression}`, ok: false };
  }

  const prompt = typeof record.prompt === "string" ? record.prompt.trim() : "";
  if (prompt.length === 0) {
    return { error: "prompt must be a non-empty string", ok: false };
  }

  const notifyChannel = record.notifyChannel === null || record.notifyChannel === undefined
    ? null
    : typeof record.notifyChannel === "string" && record.notifyChannel.trim().length > 0
      ? record.notifyChannel.trim()
      : null;

  const retry = typeof record.retry === "boolean" ? record.retry : false;

  return { ok: true, value: { cronExpression, name, notifyChannel, prompt, retry } };
}

/** Validates the client-supplied `currentDraft` on a revision turn — the
 * EXACT whitelisted 5-field shape, nothing more. This is untrusted input (an
 * injection surface, same discipline as every tool-argument boundary in this
 * repo): an unknown field or a wrong-typed field is rejected with a 400
 * BEFORE the request ever reaches the model, never silently stripped and
 * passed through. */
export function parseCurrentDraftInput(value: unknown): FlowDraftParseResult {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { error: "currentDraft must be a JSON object", ok: false };
  }

  const record = value as Record<string, unknown>;

  const unknownFields = Object.keys(record).filter(
    (key) => !(DRAFT_FIELD_NAMES as readonly string[]).includes(key)
  );
  if (unknownFields.length > 0) {
    return { error: `currentDraft has unknown field(s): ${unknownFields.join(", ")}`, ok: false };
  }

  for (const field of DRAFT_FIELD_NAMES) {
    if (!Object.hasOwn(record, field)) {
      return { error: `currentDraft is missing required field '${field}'`, ok: false };
    }
  }

  if (typeof record.name !== "string" || record.name.trim().length === 0) {
    return { error: "currentDraft.name must be a non-empty string", ok: false };
  }

  if (typeof record.cronExpression !== "string" || !CRON_FIELD_SHAPE_RE.test(record.cronExpression.trim())) {
    return { error: "currentDraft.cronExpression must be a 5-field cron expression (minute hour day month weekday)", ok: false };
  }
  const cronExpression = record.cronExpression.trim();
  try {
    computeNextRunAt({ cronExpression, timezone: "UTC" });
  } catch {
    return { error: `currentDraft.cronExpression is not a valid cron expression: ${cronExpression}`, ok: false };
  }

  if (typeof record.prompt !== "string" || record.prompt.trim().length === 0) {
    return { error: "currentDraft.prompt must be a non-empty string", ok: false };
  }

  if (record.notifyChannel !== null && typeof record.notifyChannel !== "string") {
    return { error: "currentDraft.notifyChannel must be a string or null", ok: false };
  }
  const notifyChannel = typeof record.notifyChannel === "string" && record.notifyChannel.trim().length > 0
    ? record.notifyChannel.trim()
    : null;

  if (typeof record.retry !== "boolean") {
    return { error: "currentDraft.retry must be a boolean", ok: false };
  }

  return {
    ok: true,
    value: {
      cronExpression,
      name: record.name.trim(),
      notifyChannel,
      prompt: record.prompt.trim(),
      retry: record.retry
    }
  };
}
