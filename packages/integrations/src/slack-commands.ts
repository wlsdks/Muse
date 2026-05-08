/**
 * Slack slash-command + generic CommandRouter primitives extracted
 * from packages/integrations/src/index.ts.
 *
 * Owns the public `parseSlackSlashCommand` (Slack form-encoded body
 * → `CommandEnvelope`), `parseSlackUrlEncodedBody` (URL-encoded raw
 * body → `SlackSlashCommandPayload`), `toSlackCommandAck`
 * (`CommandResponse` → Slack `in_channel`/`ephemeral` ack with
 * mrkdwn-formatted text), `commandEnvelopeFromText` (synthetic
 * envelope for non-Slack callers), and the `CommandRouter` class
 * that dispatches command envelopes to registered handlers (with
 * fallback to a `*` wildcard handler).
 *
 * Re-exported from the integrations barrel for backwards compatibility.
 */

import { createRunId, type JsonObject } from "@muse/shared";
import { formatSlackMrkdwn } from "./slack-mrkdwn.js";
import type {
  CommandEnvelope,
  CommandHandler,
  CommandResponse,
  SlackCommandAckResponse,
  SlackSlashCommandPayload
} from "./index.js";

export function parseSlackSlashCommand(
  payload: SlackSlashCommandPayload,
  now: () => Date = () => new Date()
): CommandEnvelope {
  return {
    channelId: blankToUndefined(payload.channel_id),
    command: payload.command?.trim() || "/muse",
    id: payload.trigger_id?.trim() || createRunId("command"),
    metadata: Object.fromEntries(
      Object.entries(payload).filter(([_, value]) => value !== undefined)
    ) as JsonObject,
    receivedAt: now(),
    responseUrl: blankToUndefined(payload.response_url),
    source: "slack",
    text: payload.text?.trim() ?? "",
    userId: blankToUndefined(payload.user_id),
    workspaceId: blankToUndefined(payload.team_id)
  };
}

export function parseSlackUrlEncodedBody(rawBody: string): SlackSlashCommandPayload {
  const params = new URLSearchParams(rawBody);
  const payload: Record<string, string> = {};

  for (const [key, value] of params) {
    payload[key] = value;
  }

  return payload;
}

export function toSlackCommandAck(response: CommandResponse): SlackCommandAckResponse {
  return {
    response_type: response.visibility === "public" ? "in_channel" : "ephemeral",
    text: formatSlackMrkdwn(response.text)
  };
}

export function commandEnvelopeFromText(
  text: string,
  options: {
    readonly command?: string;
    readonly source?: string;
    readonly userId?: string;
    readonly workspaceId?: string;
    readonly now?: () => Date;
  } = {}
): CommandEnvelope {
  return {
    command: options.command ?? "muse",
    id: createRunId("command"),
    metadata: {},
    receivedAt: options.now?.() ?? new Date(),
    source: options.source ?? "generic",
    text,
    userId: options.userId,
    workspaceId: options.workspaceId
  };
}

export class CommandRouter implements CommandHandler {
  private readonly handlers = new Map<string, CommandHandler>();

  register(command: string, handler: CommandHandler): void {
    this.handlers.set(command, handler);
  }

  async handle(envelope: CommandEnvelope): Promise<CommandResponse> {
    const handler = this.handlers.get(envelope.command) ?? this.handlers.get("*");

    if (!handler) {
      return {
        text: `No handler registered for command: ${envelope.command}`,
        visibility: "ephemeral"
      };
    }

    return handler.handle(envelope);
  }
}

function blankToUndefined(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}
