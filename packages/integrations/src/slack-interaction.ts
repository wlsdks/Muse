/**
 * Slack interaction-payload + Socket Mode primitives extracted from
 * packages/integrations/src/index.ts.
 *
 * Owns the `SlackInteractionDispatcher` (matches `actionId` / dotted
 * prefix / underscore prefix to a `SlackInteractionHandler` and
 * dispatches with try/handler-rejected fallback), the
 * `SlackSocketModeGateway` (acks envelopes, deduplicates by
 * `envelope_id` with a per-instance memory cap, lifts `app_mention`
 * / `message` events into `CommandEnvelope`s for the configured
 * `commandHandler`), and the public `parseSlackInteractionPayload`
 * (block_actions / view_submission JSON → typed payload).
 *
 * Re-exported from the integrations barrel for backwards compatibility.
 */

import { createRunId, type JsonObject } from "@muse/shared";
import type {
  CommandEnvelope,
  SlackInteractionDispatchResult,
  SlackInteractionHandler,
  SlackInteractionPayload,
  SlackSocketModeEnvelope,
  SlackSocketModeGatewayOptions
} from "./index.js";

export class SlackInteractionDispatcher {
  constructor(private readonly handlers: readonly SlackInteractionHandler[]) {}

  async dispatch(input: unknown): Promise<SlackInteractionDispatchResult> {
    const payload = parseSlackInteractionPayload(input);

    if (!payload) {
      return { dispatched: false, reason: "parse_failed" };
    }

    const prefix = payload.actionId.includes(".")
      ? payload.actionId.slice(0, payload.actionId.indexOf("."))
      : payload.actionId;
    const matched = this.handlers.filter((handler) =>
      handler.actionIdPrefix === prefix || payload.actionId.startsWith(`${handler.actionIdPrefix}_`)
    );

    if (matched.length === 0) {
      return { dispatched: false, payload, reason: "no_handler" };
    }

    for (const handler of matched) {
      try {
        if (await handler.handle(payload)) {
          return { dispatched: true, payload };
        }
      } catch {
        continue;
      }
    }

    return { dispatched: false, payload, reason: "handler_rejected" };
  }
}

export class SlackSocketModeGateway {
  private readonly envelopeIds = new Set<string>();
  private readonly maxRememberedEnvelopeIds: number;
  private readonly now: () => Date;

  constructor(private readonly options: SlackSocketModeGatewayOptions) {
    this.maxRememberedEnvelopeIds = Math.max(1, options.maxRememberedEnvelopeIds ?? 10_000);
    this.now = options.now ?? (() => new Date());
  }

  async handleEnvelope(envelope: SlackSocketModeEnvelope): Promise<void> {
    if (envelope.envelope_id) {
      await this.options.transport.send({ envelope_id: envelope.envelope_id });

      if (this.rememberedEnvelope(envelope.envelope_id)) {
        return;
      }
    }

    const command = socketEnvelopeToCommand(envelope.payload, this.now);

    if (command) {
      await this.options.commandHandler.handle(command);
    }
  }

  private rememberedEnvelope(envelopeId: string): boolean {
    if (this.envelopeIds.has(envelopeId)) {
      return true;
    }

    this.envelopeIds.add(envelopeId);

    while (this.envelopeIds.size > this.maxRememberedEnvelopeIds) {
      const oldest = this.envelopeIds.values().next().value as string | undefined;

      if (!oldest) {
        break;
      }

      this.envelopeIds.delete(oldest);
    }

    return false;
  }
}

export function parseSlackInteractionPayload(input: unknown): SlackInteractionPayload | undefined {
  const json = parseSlackInteractionJson(input);

  if (!json) {
    return undefined;
  }

  const type = readString(json, "type");

  if (type !== "block_actions" && type !== "view_submission") {
    return undefined;
  }

  const action = type === "block_actions"
    ? readRecordArray(json, "actions")[0]
    : readRecord(json, "view");

  if (!action) {
    return undefined;
  }

  const actionId = type === "view_submission"
    ? readString(action, "callback_id")
    : readString(action, "action_id");

  if (!actionId) {
    return undefined;
  }

  const viewState = type === "view_submission" ? readRecord(readRecord(action, "state") ?? {}, "values") : undefined;

  return {
    actionId,
    channelId: readString(readRecord(json, "channel") ?? {}, "id"),
    messageTs: readString(readRecord(json, "message") ?? {}, "ts"),
    privateMetadata: type === "view_submission" ? readString(action, "private_metadata") : undefined,
    responseUrl: readString(json, "response_url"),
    triggerId: readString(json, "trigger_id"),
    type,
    userId: readString(readRecord(json, "user") ?? {}, "id") ?? "",
    value: readString(action, "value"),
    viewValues: viewState as JsonObject | undefined
  };
}

function socketEnvelopeToCommand(payload: unknown, now: () => Date): CommandEnvelope | undefined {
  if (!isJsonRecord(payload) || payload.type !== "event_callback" || !isJsonRecord(payload.event)) {
    return undefined;
  }

  const event = payload.event;
  const type = readString(event, "type");

  if (type !== "app_mention" && type !== "message") {
    return undefined;
  }

  const text = stripBotMention(readString(event, "text") ?? "");
  const ts = readString(event, "ts") ?? createRunId("socket_event");

  return {
    channelId: blankToUndefined(readString(event, "channel")),
    command: type,
    id: ts,
    metadata: {
      eventTs: ts,
      socketMode: true,
      type
    },
    receivedAt: now(),
    source: "slack_socket_mode",
    text,
    userId: blankToUndefined(readString(event, "user")),
    workspaceId: blankToUndefined(readString(event, "team") ?? readString(payload, "team_id"))
  };
}

function stripBotMention(value: string): string {
  return value.replace(/^<@[^>]+>\s*/u, "").trim();
}

function parseSlackInteractionJson(input: unknown): Record<string, unknown> | undefined {
  if (typeof input === "string") {
    return parseJsonObject(input);
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const record = input as Record<string, unknown>;
  const payload = record.payload;

  if (typeof payload === "string") {
    return parseJsonObject(payload);
  }

  return record;
}

function parseJsonObject(value: string): Record<string, unknown> | undefined {
  const parsed = safeJsonParse(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : undefined;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function readRecord(value: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const candidate = value[key];
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? candidate as Record<string, unknown>
    : undefined;
}

function readRecordArray(value: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
  const candidate = value[key];

  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.filter((item): item is Record<string, unknown> =>
    Boolean(item) && typeof item === "object" && !Array.isArray(item)
  );
}

function readString(value: Record<string, unknown>, key: string): string | undefined {
  const candidate = value[key];
  return typeof candidate === "string" && candidate.trim().length > 0 ? candidate.trim() : undefined;
}

function blankToUndefined(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
