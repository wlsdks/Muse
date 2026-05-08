/**
 * fetch-based Slack outbound transports extracted from
 * packages/integrations/src/index.ts.
 *
 * Owns `FetchSlackResponseUrlTransport` (POSTs mrkdwn-formatted
 * payloads to a `response_url` for slash-command and interaction
 * follow-ups) and `FetchSlackWebApiMessageTransport` (Slack Web API
 * `chat.postMessage` + `assistant.threads.setStatus` with bot-token
 * auth, mrkdwn formatting, and the `{ok,statusCode,error,ts}`
 * envelope shape consumers expect).
 *
 * Re-exported from the integrations barrel for backwards compatibility.
 */

import type { JsonObject } from "@muse/shared";
import { formatSlackPayload } from "./slack-mrkdwn.js";
import type {
  SlackAssistantThreadStatusInput,
  SlackAssistantThreadStatusResult,
  SlackAssistantThreadStatusTransport,
  SlackMessagePostInput,
  SlackMessageTransport,
  SlackResponseUrlTransport
} from "./index.js";

export class FetchSlackResponseUrlTransport implements SlackResponseUrlTransport {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async post(url: string, body: JsonObject): Promise<{ readonly statusCode: number }> {
    const slackBody = formatSlackPayload(body);
    const response = await this.fetchImpl(url, {
      body: JSON.stringify(slackBody),
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    });

    return { statusCode: response.status };
  }
}

export class FetchSlackWebApiMessageTransport
  implements SlackMessageTransport, SlackAssistantThreadStatusTransport
{
  constructor(
    private readonly botToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly apiBaseUrl = "https://slack.com/api"
  ) {}

  async postMessage(input: SlackMessagePostInput): Promise<{
    readonly ok: boolean;
    readonly statusCode: number;
    readonly error?: string;
    readonly ts?: string;
  }> {
    if (this.botToken.trim().length === 0) {
      return { error: "slack_bot_token_missing", ok: false, statusCode: 0 };
    }

    const body = formatSlackPayload({
      channel: input.channelId,
      text: input.text,
      ...(input.threadTs ? { thread_ts: input.threadTs } : {})
    });
    const response = await this.fetchImpl(`${this.apiBaseUrl}/chat.postMessage`, {
      body: JSON.stringify(body),
      headers: {
        authorization: `Bearer ${this.botToken}`,
        "content-type": "application/json; charset=utf-8"
      },
      method: "POST"
    });
    const parsed = await readSlackApiResponse(response);

    return {
      error: parsed.error,
      ok: response.ok && parsed.ok !== false,
      statusCode: response.status,
      ts: parsed.ts
    };
  }

  async setStatus(input: SlackAssistantThreadStatusInput): Promise<SlackAssistantThreadStatusResult> {
    if (this.botToken.trim().length === 0) {
      return { error: "slack_bot_token_missing", ok: false, statusCode: 0 };
    }

    const response = await this.fetchImpl(`${this.apiBaseUrl}/assistant.threads.setStatus`, {
      body: JSON.stringify({
        channel_id: input.channelId,
        thread_ts: input.threadTs,
        status: input.status
      }),
      headers: {
        authorization: `Bearer ${this.botToken}`,
        "content-type": "application/json; charset=utf-8"
      },
      method: "POST"
    });
    const parsed = await readSlackApiResponse(response);

    return {
      error: parsed.error,
      ok: response.ok && parsed.ok !== false,
      statusCode: response.status
    };
  }
}

async function readSlackApiResponse(response: Response): Promise<{
  readonly ok?: boolean;
  readonly error?: string;
  readonly ts?: string;
}> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return {};
  }

  const value = await response.json().catch(() => undefined);

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;

  return {
    error: typeof record.error === "string" ? record.error : undefined,
    ok: typeof record.ok === "boolean" ? record.ok : undefined,
    ts: typeof record.ts === "string" ? record.ts : undefined
  };
}
