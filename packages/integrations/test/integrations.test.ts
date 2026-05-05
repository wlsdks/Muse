import { describe, expect, it } from "vitest";
import {
  CommandRouter,
  FetchSlackResponseUrlTransport,
  SlackSignatureVerifier,
  WebhookDispatcher,
  parseSlackSlashCommand,
  parseSlackUrlEncodedBody,
  signSlackRequestBody,
  signWebhookPayload,
  toSlackCommandAck,
  verifySlackSignature,
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

  it("parses urlencoded Slack payloads and formats ack responses", () => {
    const raw = "command=%2Fmuse&text=hello+world&user_id=user-1&channel_id=channel-1";
    const payload = parseSlackUrlEncodedBody(raw);

    expect(payload).toMatchObject({
      channel_id: "channel-1",
      command: "/muse",
      text: "hello world",
      user_id: "user-1"
    });
    expect(toSlackCommandAck({ text: "ok", visibility: "public" })).toEqual({
      response_type: "in_channel",
      text: "ok"
    });
  });

  it("verifies Slack signatures and rejects replayed timestamps", () => {
    const raw = "command=%2Fmuse&text=hello";
    const timestamp = "1770000000";
    const signature = signSlackRequestBody(raw, timestamp, "signing-secret");
    const verifier = new SlackSignatureVerifier({
      nowSeconds: () => 1_770_000_010,
      signingSecret: "signing-secret"
    });

    expect(verifySlackSignature(raw, timestamp, signature, "signing-secret")).toBe(true);
    expect(verifier.verify(timestamp, signature, raw)).toEqual({ ok: true });
    expect(verifier.verify("1769990000", signature, raw)).toMatchObject({ ok: false });
    expect(verifier.verify(timestamp, "v0=bad", raw)).toMatchObject({ ok: false });
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

  it("posts Slack response_url payloads as JSON", async () => {
    const posts: Array<{ body: string | undefined; headers: HeadersInit | undefined; url: string }> = [];
    const transport = new FetchSlackResponseUrlTransport(async (url, init) => {
      posts.push({
        body: typeof init?.body === "string" ? init.body : undefined,
        headers: init?.headers,
        url: String(url)
      });

      return new Response(null, { status: 204 });
    });

    await expect(transport.post("https://example.invalid/respond", { text: "ok" })).resolves.toEqual({
      statusCode: 204
    });
    expect(posts).toEqual([
      {
        body: "{\"text\":\"ok\"}",
        headers: { "content-type": "application/json" },
        url: "https://example.invalid/respond"
      }
    ]);
  });
});
