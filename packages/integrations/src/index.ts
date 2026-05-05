import { createHmac, timingSafeEqual } from "node:crypto";
import { createRunId, type JsonObject } from "@muse/shared";

export type Awaitable<T> = T | Promise<T>;
export type IntegrationEventType = "before_start" | "after_complete" | "on_error" | "before_tool" | "after_tool";

export interface CommandEnvelope {
  readonly id: string;
  readonly source: string;
  readonly command: string;
  readonly text: string;
  readonly userId?: string;
  readonly channelId?: string;
  readonly workspaceId?: string;
  readonly responseUrl?: string;
  readonly metadata: JsonObject;
  readonly receivedAt: Date;
}

export interface CommandResponse {
  readonly text: string;
  readonly visibility?: "ephemeral" | "public";
  readonly metadata?: JsonObject;
}

export interface CommandHandler {
  handle(command: CommandEnvelope): Awaitable<CommandResponse>;
}

export interface SlackSlashCommandPayload {
  readonly command?: string;
  readonly text?: string;
  readonly user_id?: string;
  readonly channel_id?: string;
  readonly team_id?: string;
  readonly response_url?: string;
  readonly trigger_id?: string;
  readonly [key: string]: string | undefined;
}

export interface WebhookEvent {
  readonly id: string;
  readonly type: IntegrationEventType;
  readonly runId: string;
  readonly payload: JsonObject;
  readonly createdAt: Date;
}

export interface WebhookEndpoint {
  readonly id: string;
  readonly url: string;
  readonly events: readonly IntegrationEventType[];
  readonly secret?: string;
  readonly enabled: boolean;
}

export interface WebhookDelivery {
  readonly endpointId: string;
  readonly eventId: string;
  readonly status: "delivered" | "failed" | "skipped";
  readonly statusCode?: number;
  readonly error?: string;
}

export interface WebhookTransport {
  post(url: string, body: JsonObject, headers: Record<string, string>): Awaitable<{ readonly statusCode: number }>;
}

export interface WebhookDispatcherOptions {
  readonly endpoints?: readonly WebhookEndpoint[];
  readonly transport: WebhookTransport;
  readonly now?: () => Date;
  readonly idFactory?: () => string;
}

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

export class WebhookDispatcher {
  private readonly endpoints = new Map<string, WebhookEndpoint>();
  private readonly transport: WebhookTransport;
  private readonly now: () => Date;
  private readonly idFactory: () => string;

  constructor(options: WebhookDispatcherOptions) {
    for (const endpoint of options.endpoints ?? []) {
      this.endpoints.set(endpoint.id, endpoint);
    }

    this.transport = options.transport;
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? (() => createRunId("webhook_event"));
  }

  register(endpoint: WebhookEndpoint): void {
    this.endpoints.set(endpoint.id, endpoint);
  }

  unregister(endpointId: string): void {
    this.endpoints.delete(endpointId);
  }

  listEndpoints(): readonly WebhookEndpoint[] {
    return [...this.endpoints.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  async dispatch(input: Omit<WebhookEvent, "createdAt" | "id"> & { readonly id?: string }): Promise<readonly WebhookDelivery[]> {
    const event: WebhookEvent = {
      createdAt: this.now(),
      id: input.id ?? this.idFactory(),
      payload: input.payload,
      runId: input.runId,
      type: input.type
    };
    const deliveries: WebhookDelivery[] = [];

    for (const endpoint of this.endpoints.values()) {
      if (!endpoint.enabled || !endpoint.events.includes(event.type)) {
        deliveries.push({ endpointId: endpoint.id, eventId: event.id, status: "skipped" });
        continue;
      }

      try {
        const body = eventToPayload(event);
        const headers = createWebhookHeaders(body, endpoint.secret);
        const response = await this.transport.post(endpoint.url, body, headers);
        deliveries.push({
          endpointId: endpoint.id,
          eventId: event.id,
          status: response.statusCode >= 200 && response.statusCode < 300 ? "delivered" : "failed",
          statusCode: response.statusCode
        });
      } catch (error) {
        deliveries.push({
          endpointId: endpoint.id,
          error: error instanceof Error ? error.message : "unknown webhook failure",
          eventId: event.id,
          status: "failed"
        });
      }
    }

    return deliveries;
  }
}

export function createWebhookHeaders(body: JsonObject, secret: string | undefined): Record<string, string> {
  const serialized = JSON.stringify(body);
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };

  if (secret) {
    headers["x-muse-signature"] = signWebhookPayload(serialized, secret);
  }

  return headers;
}

export function signWebhookPayload(payload: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

export function verifyWebhookSignature(payload: string, signature: string | undefined, secret: string): boolean {
  if (!signature) {
    return false;
  }

  const expected = Buffer.from(signWebhookPayload(payload, secret));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function eventToPayload(event: WebhookEvent): JsonObject {
  return {
    createdAt: event.createdAt.toISOString(),
    id: event.id,
    payload: event.payload,
    runId: event.runId,
    type: event.type
  };
}

function blankToUndefined(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}
