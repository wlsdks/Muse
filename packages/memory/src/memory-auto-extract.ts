/**
 * `createUserMemoryAutoExtractHook` — afterComplete agent hook that
 * runs a small structured-output LLM call against the latest user
 * prompt + assistant response and persists any newly-stated facts /
 * preferences into the `UserMemoryStore`.
 *
 * Disabled by default (extra LLM call per turn = extra tokens). Wired
 * in by autoconfigure when `MUSE_USER_MEMORY_AUTO_EXTRACT=true`.
 *
 * Failure mode: fail-open. Any error in the extraction call (timeout,
 * malformed JSON, store write fail) is swallowed — the agent run that
 * triggered the hook still succeeds.
 */

import type { ModelMessage, ModelProvider, ModelResponse } from "@muse/model";
import type { JsonObject } from "@muse/shared";

import type { UserMemoryStore } from "./index.js";

// Structural duck-type of @muse/agent-core's HookStage / AgentRunContext.
// We avoid importing from agent-core because agent-core depends on
// @muse/memory (circular). Consumers (e.g. autoconfigure) treat the
// return value as a HookStage at the registration call site — TS
// structural typing makes that work without a runtime type tag.
interface AgentRunInputView {
  readonly messages: readonly ModelMessage[];
  readonly metadata?: JsonObject;
}

interface AgentRunContextView {
  readonly runId: string;
  readonly input: AgentRunInputView;
}

interface HookStageShape {
  readonly id: string;
  readonly afterComplete?: (context: AgentRunContextView, response: ModelResponse) => Promise<void>;
}

export interface UserMemoryAutoExtractOptions {
  readonly store: UserMemoryStore;
  readonly modelProvider: ModelProvider;
  readonly model: string;
  readonly maxFactsPerExchange?: number;
  readonly maxPreferencesPerExchange?: number;
  readonly maxKeyLength?: number;
  readonly maxValueLength?: number;
}

interface ExtractionPayload {
  readonly facts?: Readonly<Record<string, string>>;
  readonly preferences?: Readonly<Record<string, string>>;
}

const systemPrompt = `You analyse a single exchange (the latest user turn + assistant reply) and extract any NEW personal facts or preferences the user revealed. Output strict JSON of shape:
{
  "facts": { "<short_key>": "<value>" },
  "preferences": { "<short_key>": "<value>" }
}
Rules:
- Only include facts/preferences the user explicitly stated this turn (not inferred).
- Keys are snake_case ASCII, max 32 chars (e.g. spouse_name, favorite_drink).
- Values are concise strings, max 200 chars.
- If nothing new to record, output {"facts":{},"preferences":{}}.
- Output only the JSON object. No prose, no code fence.`;

export function createUserMemoryAutoExtractHook(options: UserMemoryAutoExtractOptions): HookStageShape {
  const maxFacts = Math.max(0, Math.trunc(options.maxFactsPerExchange ?? 5));
  const maxPreferences = Math.max(0, Math.trunc(options.maxPreferencesPerExchange ?? 5));
  const maxKey = Math.max(1, Math.trunc(options.maxKeyLength ?? 32));
  const maxValue = Math.max(1, Math.trunc(options.maxValueLength ?? 200));

  return {
    afterComplete: async (context, response) => {
      const userId = readUserId(context);
      if (!userId) {
        return;
      }
      const userPrompt = latestUserMessage(context);
      const assistantOutput = response.output?.trim() ?? "";
      if (!userPrompt || !assistantOutput) {
        return;
      }

      try {
        const payload = await runExtraction(options.modelProvider, options.model, userPrompt, assistantOutput);
        if (!payload) {
          return;
        }
        await persist(options.store, userId, payload, { maxFacts, maxKey, maxPreferences, maxValue });
      } catch {
        // fail-open
      }
    },
    id: "user-memory-auto-extract"
  };
}

function readUserId(context: AgentRunContextView): string | undefined {
  const candidate = context.input.metadata?.userId;
  return typeof candidate === "string" && candidate.trim().length > 0 ? candidate : undefined;
}

function latestUserMessage(context: AgentRunContextView): string | undefined {
  const messages = context.input.messages;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user" && typeof message.content === "string") {
      return message.content.trim();
    }
  }
  return undefined;
}

async function runExtraction(
  modelProvider: ModelProvider,
  model: string,
  userPrompt: string,
  assistantOutput: string
): Promise<ExtractionPayload | undefined> {
  const response = await modelProvider.generate({
    maxOutputTokens: 512,
    messages: [
      { content: systemPrompt, role: "system" },
      {
        content: `User turn:\n${userPrompt}\n\nAssistant reply:\n${assistantOutput}`,
        role: "user"
      }
    ],
    model,
    temperature: 0
  });

  if (!response.output) {
    return undefined;
  }

  const trimmed = response.output.trim();
  const stripped = trimmed.replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/iu, "");
  try {
    const parsed = JSON.parse(stripped) as ExtractionPayload;
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

interface PersistLimits {
  readonly maxFacts: number;
  readonly maxPreferences: number;
  readonly maxKey: number;
  readonly maxValue: number;
}

async function persist(
  store: UserMemoryStore,
  userId: string,
  payload: ExtractionPayload,
  limits: PersistLimits
): Promise<void> {
  const factEntries = sanitizeEntries(payload.facts, limits.maxFacts, limits.maxKey, limits.maxValue);
  const preferenceEntries = sanitizeEntries(
    payload.preferences,
    limits.maxPreferences,
    limits.maxKey,
    limits.maxValue
  );

  for (const [key, value] of factEntries) {
    await store.upsertFact(userId, key, value);
  }
  for (const [key, value] of preferenceEntries) {
    await store.upsertPreference(userId, key, value);
  }
}

function sanitizeEntries(
  source: Readonly<Record<string, string>> | undefined,
  maxCount: number,
  maxKey: number,
  maxValue: number
): readonly (readonly [string, string])[] {
  if (!source || typeof source !== "object" || maxCount === 0) {
    return [];
  }
  const out: (readonly [string, string])[] = [];
  for (const [rawKey, rawValue] of Object.entries(source)) {
    if (out.length >= maxCount) {
      break;
    }
    const key = normalizeKey(rawKey, maxKey);
    if (!key) {
      continue;
    }
    const value = typeof rawValue === "string" ? rawValue.trim().slice(0, maxValue) : "";
    if (value.length === 0) {
      continue;
    }
    out.push([key, value]);
  }
  return out;
}

function normalizeKey(raw: string, max: number): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, max);
  return cleaned.length > 0 ? cleaned : undefined;
}
