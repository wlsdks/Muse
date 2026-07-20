/**
 * Untrusted-input parsing for the API surface: the ParseResult/ApiError
 * envelopes every route speaks, plus the parsers that turn a raw body into a
 * typed AgentRunInput / AgentSpecInput / RuntimeSetting / credentials.
 *
 * A LEAF relative to the chat runners in `server-helpers.ts` — those import
 * these parsers, never the other way round.
 */

import type { AgentSpecInput } from "@muse/agent-specs";
import type { AgentRunInput } from "@muse/agent-core";
import type { RuntimeSettingType } from "@muse/runtime-settings";
import type { JsonObject, JsonValue } from "@muse/shared";

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly error: ApiError; readonly ok: false };

export interface ApiError {
  readonly code: string;
  readonly message: string;
}

const RESERVED_UNTRUSTED_AGENT_METADATA_KEYS = new Set([
  "allowedtoolnames",
  "approvalgate",
  "approvalreceipt",
  "authority",
  "capabilityprofile",
  "capabilityprofileid",
  "forbiddentoolnames",
  "localmode",
  "maxtools",
  "profile",
  "profileid",
  "receipt",
  "toolapprovalgate",
  "toolapprovalreceipt",
  "toolauthority",
  "toolexposureauthority",
  "workapprovalreceipt"
]);

function sanitizeUntrustedAgentMetadata(metadata: Record<string, JsonValue>): JsonObject {
  const sanitized: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const normalizedKey = key.replace(/[-_]/gu, "").toLowerCase();
    if (!RESERVED_UNTRUSTED_AGENT_METADATA_KEYS.has(normalizedKey)) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}



export function parseMultipartChatBody(value: unknown): ParseResult<JsonObject> {
  if (!isRecord(value) || !isRecord(value.fields) || !Array.isArray(value.files)) {
    return invalid("INVALID_MULTIPART_CHAT_REQUEST", "Body must be multipart form-data");
  }

  const message = optionalString(value.fields.message);

  if (!message) {
    return invalid("INVALID_MULTIPART_CHAT_REQUEST", "Multipart request must include message");
  }

  return {
    ok: true,
    value: {
      message,
      metadata: {
        channel: "web",
        media: value.files.filter(isJsonObject),
        ...(optionalString(value.fields.personaId) ? { personaId: optionalString(value.fields.personaId) } : {}),
        ...(optionalString(value.fields.sessionId) ? { sessionId: optionalString(value.fields.sessionId) } : {}),
        ...(optionalString(value.fields.userId) ? { userId: optionalString(value.fields.userId) } : {})
      },
      ...(optionalString(value.fields.model) ? { model: optionalString(value.fields.model) } : {}),
      ...(optionalString(value.fields.sessionId) ? { runId: optionalString(value.fields.sessionId) } : {}),
      ...(optionalString(value.fields.systemPrompt)
        ? { messages: [{ content: optionalString(value.fields.systemPrompt) ?? "", role: "system" }, { content: message, role: "user" }] }
        : {})
    }
  };
}

export function parseAgentRunInput(value: unknown, defaultModel: string, authUserId?: string): ParseResult<AgentRunInput> {
  if (!isRecord(value)) {
    return invalid("INVALID_CHAT_REQUEST", "Body must be an object");
  }

  const messages = parseMessages(value.messages, value.message, value.systemPrompt);

  if (!messages) {
    return invalid("INVALID_CHAT_REQUEST", "Body must include message or messages");
  }

  const metadata = compatChatMetadata(value, authUserId);

  return {
    ok: true,
    value: {
      messages,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      model: typeof value.model === "string" && value.model.trim().length > 0 ? value.model : defaultModel,
      runId: typeof value.runId === "string" && value.runId.trim().length > 0 ? value.runId : undefined
    }
  };
}

function parseMessages(
  messages: unknown,
  message: unknown,
  systemPrompt: unknown
): AgentRunInput["messages"] | undefined {
  if (Array.isArray(messages)) {
    const parsed = messages.flatMap((item) => {
      if (!isRecord(item) || typeof item.content !== "string" || !isModelRole(item.role)) {
        return [];
      }

      const toolCalls = parseToolCalls(item.toolCalls);

      if (item.toolCalls !== undefined && !toolCalls) {
        return [];
      }

      return [{
        content: item.content,
        name: optionalString(item.name),
        role: item.role,
        toolCallId: optionalString(item.toolCallId),
        toolCalls
      }];
    });

    if (parsed.length !== messages.length || parsed.length === 0) {
      return undefined;
    }

    return prependSystemPrompt(parsed, systemPrompt);
  }

  if (typeof message !== "string" || message.trim().length === 0) {
    return undefined;
  }

  return prependSystemPrompt([{ content: message, role: "user" }], systemPrompt);
}

function prependSystemPrompt(
  messages: AgentRunInput["messages"],
  systemPrompt: unknown
): AgentRunInput["messages"] {
  if (typeof systemPrompt !== "string" || systemPrompt.trim().length === 0) {
    return messages;
  }

  return messages[0]?.role === "system"
    ? messages
    : [{ content: systemPrompt, role: "system" }, ...messages];
}

function compatChatMetadata(value: Record<string, unknown>, authUserId?: string): JsonObject {
  const entries: Record<string, JsonValue> = isJsonObject(value.metadata) ? { ...value.metadata } : {};
  const userId = optionalString(value.userId) ?? optionalString(entries.userId) ?? authUserId;
  const personaId = optionalString(value.personaId);
  const promptTemplateId = optionalString(value.promptTemplateId);
  const responseFormat = optionalString(value.responseFormat);
  const responseSchema = optionalString(value.responseSchema);

  if (userId) {
    entries.userId = userId;
  }

  if (personaId) {
    entries.personaId = personaId;
  }

  if (promptTemplateId) {
    entries.promptTemplateId = promptTemplateId;
  }

  if (responseFormat) {
    entries.responseFormat = responseFormat;
  }

  if (responseSchema) {
    entries.responseSchema = responseSchema;
  }

  if (Array.isArray(value.mediaUrls)) {
    const mediaUrls = value.mediaUrls.filter(isJsonObject);

    if (mediaUrls.length === value.mediaUrls.length) {
      entries.mediaUrls = mediaUrls;
    }
  }

  return sanitizeUntrustedAgentMetadata(entries);
}

function isModelRole(value: unknown): value is AgentRunInput["messages"][number]["role"] {
  return value === "system" || value === "user" || value === "assistant" || value === "tool";
}

function parseToolCalls(value: unknown): AgentRunInput["messages"][number]["toolCalls"] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  if (value.length === 0) {
    return [];
  }

  const parsed = value.flatMap((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.name !== "string" ||
      !isJsonObject(item.arguments)
    ) {
      return [];
    }

    return [{
      arguments: item.arguments,
      id: item.id,
      name: item.name
    }];
  });

  return parsed.length === value.length ? parsed : undefined;
}

export function parseAgentSpecInput(value: unknown): ParseResult<AgentSpecInput> {
  if (!isRecord(value) || typeof value.name !== "string" || value.name.trim().length === 0) {
    return invalid("INVALID_AGENT_SPEC", "Body must include a non-empty name");
  }

  return {
    ok: true,
    value: {
      description: optionalString(value.description),
      enabled: optionalBoolean(value.enabled),
      independentExecution: optionalBoolean(value.independentExecution),
      keywords: optionalStringArray(value.keywords),
      mode:
        value.mode === "standard" || value.mode === "plan_execute" || value.mode === "react"
          ? value.mode
          : undefined,
      name: value.name,
      systemPrompt: optionalNullableString(value.systemPrompt),
      toolNames: optionalStringArray(value.toolNames)
    }
  };
}

export function parseRuntimeSettingInput(
  key: string,
  value: unknown
): ParseResult<{
  readonly category?: string;
  readonly description?: string | null;
  readonly key: string;
  readonly type?: RuntimeSettingType;
  readonly updatedBy?: string | null;
  readonly value: string;
}> {
  if (!isRecord(value) || typeof value.value !== "string") {
    return invalid("INVALID_RUNTIME_SETTING", "Body must include a string value");
  }

  return {
    ok: true,
    value: {
      category: optionalString(value.category),
      description: optionalNullableString(value.description),
      key,
      type: parseRuntimeSettingType(value.type),
      updatedBy: optionalNullableString(value.updatedBy),
      value: value.value
    }
  };
}

export function parseAuthCredentials(
  value: unknown,
  mode: "login" | "register"
): ParseResult<{ readonly email: string; readonly name: string; readonly password: string }> {
  if (!isRecord(value) || typeof value.email !== "string" || typeof value.password !== "string") {
    return invalid("INVALID_AUTH_REQUEST", "Body must include email and password strings");
  }

  if (value.email.trim().length === 0 || value.password.length === 0) {
    return invalid("INVALID_AUTH_REQUEST", "Email and password must not be blank");
  }

  if (mode === "register" && (typeof value.name !== "string" || value.name.trim().length === 0)) {
    return invalid("INVALID_AUTH_REQUEST", "Registration requires a non-empty name");
  }

  return {
    ok: true,
    value: {
      email: value.email,
      name: typeof value.name === "string" ? value.name : value.email,
      password: value.password
    }
  };
}

function invalid(code: string, message: string): ParseResult<never> {
  return {
    error: { code, message },
    ok: false
  };
}

// ---------------------------------------------------------------------------
// Generic input util — implementation in `./server-input-utils.js`.
// Imported here for the rest of `server-helpers.ts` to use AND
// re-exported so the existing import sites across the API package
// keep working without import-site edits.
// ---------------------------------------------------------------------------
import {
  isJsonObject,
  isRecord,
  optionalBoolean,
  optionalNullableString,
  optionalString,
  optionalStringArray,
  parseResponseLocales,
  parseRuntimeSettingType
} from "./server-input-utils.js";

export {
  isRecord,
  parseResponseLocales
};
