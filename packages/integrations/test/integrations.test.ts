import { describe, expect, it } from "vitest";
import {
  CommandRouter,
  WebhookDispatcher,
  parseSlackSlashCommand,
  signWebhookPayload,
  verifyWebhookSignature
} from "../src/index.js";

describe("Slack command parsing", () => {
  it("normalizes slash command payloads into command envelopes", () => {
    const envelope = parseSlackSlashCommand(
      {
        channel_id: "channel-1",
        command: "/muse",
        response_url: "https://example.invalid/respond",
        team_id: "workspace-1",
        text: " summarize status ",
        trigger_id: "trigger-1",
        user_id: "user-1"
      },
      () => new Date("2026-05-05T00:00:00.000Z")
    );

    expect(envelope).toMatchObject({
      channelId: "channel-1",
      command: "/muse",
      id: "trigger-1",
      source: "slack",
      text: "summarize status",
      userId: "user-1",
      workspaceId: "workspace-1"
    });
  });
});

describe("CommandRouter", () => {
  it("routes commands and falls back to wildcard handlers", async () => {
    const router = new CommandRouter();
    router.register("*", {
      handle: (command) => ({ text: `handled:${command.text}`, visibility: "ephemeral" })
    });

    await expect(router.handle(parseSlackSlashCommand({ text: "hello" }))).resolves.toMatchObject({
      text: "handled:hello"
    });
  });
});

describe("WebhookDispatcher", () => {
  it("dispatches matching lifecycle events with signatures", async () => {
    const posts: Array<{ headers: Record<string, string>; url: string }> = [];
    const dispatcher = new WebhookDispatcher({
      endpoints: [
        {
          enabled: true,
          events: ["after_complete"],
          id: "endpoint-1",
          secret: "secret-1",
          url: "https://example.invalid/webhook"
        },
        {
          enabled: true,
          events: ["on_error"],
          id: "endpoint-2",
          url: "https://example.invalid/error"
        }
      ],
      idFactory: () => "event-1",
      now: () => new Date("2026-05-05T00:00:00.000Z"),
      transport: {
        post: async (url, _body, headers) => {
          posts.push({ headers, url });
          return { statusCode: 204 };
        }
      }
    });

    const deliveries = await dispatcher.dispatch({
      payload: { output: "ok" },
      runId: "run-1",
      type: "after_complete"
    });

    expect(deliveries).toEqual([
      { endpointId: "endpoint-1", eventId: "event-1", status: "delivered", statusCode: 204 },
      { endpointId: "endpoint-2", eventId: "event-1", status: "skipped" }
    ]);
    expect(posts[0]?.headers["x-muse-signature"]).toMatch(/^sha256=/u);
  });

  it("verifies webhook signatures with constant-time comparison", () => {
    const signature = signWebhookPayload("{\"ok\":true}", "secret-1");

    expect(verifyWebhookSignature("{\"ok\":true}", signature, "secret-1")).toBe(true);
    expect(verifyWebhookSignature("{\"ok\":false}", signature, "secret-1")).toBe(false);
  });
});
