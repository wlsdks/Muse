import {
  MessagingProviderError,
  MessagingValidationError,
  type MessagingProviderRegistry
} from "@muse/messaging";
import type { JsonObject, JsonValue } from "@muse/shared";

import { errorMessage, readString } from "./loopback-helpers.js";
import type { LoopbackMcpServer } from "./loopback.js";

/**
 * `muse.messaging` loopback MCP server.
 *
 * Phase 3 of the messenger plan (see `docs/design/messaging.md`).
 * Once registered, the agent can call:
 *
 *   - `muse.messaging.providers` (read) — list providers the user
 *     has wired up (Telegram / Discord / Slack / LINE).
 *   - `muse.messaging.send` (write) — push a plain-text message
 *     through one of those providers, e.g. for "remind me on
 *     Telegram when the deploy finishes" or "send this brief to
 *     Slack".
 *
 * The server only registers when the runtime assembly's
 * `MessagingProviderRegistry` already has at least one provider —
 * we don't want the LLM to discover a tool that always errors with
 * "no providers configured".
 */
export interface MessagingMcpServerOptions {
  readonly registry: MessagingProviderRegistry;
}

export function createMessagingMcpServer(options: MessagingMcpServerOptions): LoopbackMcpServer {
  const { registry } = options;

  return {
    description:
      "Outbound messengers (Telegram / Discord / Slack / LINE). Send plain-text messages through any configured provider.",
    name: "muse.messaging",
    tools: [
      {
        description:
          "List the messaging providers the user has wired up. Each entry has `id` (use it for `send`), " +
          "`displayName`, and a free-form `description`. Empty array means no provider is configured.",
        execute: async (): Promise<JsonObject> => {
          const providers = registry.describe();
          return { providers: providers as unknown as JsonValue };
        },
        inputSchema: {
          additionalProperties: false,
          properties: {},
          type: "object"
        },
        name: "providers",
        risk: "read"
      },
      {
        description:
          "Send a plain-text message through a configured provider. " +
          "`providerId` is one of the ids returned by `providers` (telegram | discord | slack | line). " +
          "`destination` is platform-native: chat_id for Telegram (e.g. \"@username\" or \"123456789\"), " +
          "channel id for Discord (numeric snowflake), channel/user id for Slack (Cxxx / Uxxx), " +
          "userId/groupId/roomId for LINE. " +
          "`text` is the message body (≤4096 chars). Returns the platform message id when available.",
        execute: async (args): Promise<JsonObject> => {
          const providerId = readString(args, "providerId")?.trim();
          const destination = readString(args, "destination")?.trim();
          const text = readString(args, "text");
          if (!providerId) {
            return { error: "providerId is required" };
          }
          if (!destination) {
            return { error: "destination is required" };
          }
          if (text === undefined || text.length === 0) {
            return { error: "text is required" };
          }
          try {
            const receipt = await registry.send(providerId, { destination, text });
            return {
              destination: receipt.destination,
              messageId: receipt.messageId,
              providerId: receipt.providerId
            };
          } catch (error) {
            if (error instanceof MessagingValidationError) {
              return { error: `${error.field}: ${error.message}` };
            }
            if (error instanceof MessagingProviderError) {
              return {
                error: error.message,
                providerErrorCode: error.code,
                ...(error.status !== undefined ? { upstreamStatus: error.status } : {})
              };
            }
            return { error: errorMessage(error) };
          }
        },
        inputSchema: {
          additionalProperties: false,
          properties: {
            destination: {
              description:
                "Platform-native chat / channel / user id. See tool description for per-provider examples.",
              type: "string"
            },
            providerId: {
              description: "Provider id from `providers` (telegram | discord | slack | line).",
              type: "string"
            },
            text: { description: "Plain-text message body (≤4096 chars).", type: "string" }
          },
          required: ["providerId", "destination", "text"],
          type: "object"
        },
        name: "send",
        risk: "write"
      }
    ]
  };
}
