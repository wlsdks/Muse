import type { MessagingProviderRegistry } from "./registry.js";

/**
 * Structural shape of `@muse/agent-core`'s `ToolApprovalGate`
 * (kept here so `@muse/messaging` needs no agent-core dependency,
 * same duck-type approach as `InboundAgentRunner`). The agent
 * runtime calls this before every tool with a wider `toolCall`;
 * we only read `.name`.
 */
export interface ChannelApprovalGateInput {
  readonly toolCall: { readonly name: string; readonly arguments?: Record<string, unknown> };
  readonly risk: "read" | "write" | "execute";
  readonly userId?: string;
  readonly runId: string;
}

function clip(value: unknown, max = 60): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text === undefined) {
    return "";
  }
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

/**
 * A SHORT, channel-safe draft of what the tool would do, so the user
 * sees the content before approving (outbound-safety draft-first), not
 * just a tool name. Deliberately omits bulk/sensitive payloads (e.g. an
 * email body) — the recipient + subject is enough to decide, and the
 * full body shouldn't be echoed back into a chat transcript.
 */
export function summarizeToolDraft(name: string, args: Record<string, unknown> | undefined): string {
  if (!args) {
    return "";
  }
  switch (name) {
    case "email_send":
      return `to ${clip(args["to"], 40)}, subject "${clip(args["subject"], 50)}"`;
    case "web_action":
      return `${clip(args["method"] ?? "POST", 8)} ${clip(args["url"], 60)}`;
    case "home_action":
      return args["entity"] ? `${clip(args["service"], 40)} on ${clip(args["entity"], 40)}` : clip(args["service"], 40);
    default: {
      const parts = Object.entries(args)
        .filter(([, v]) => v !== undefined && v !== null && typeof v !== "object")
        .slice(0, 3)
        .map(([k, v]) => `${k}=${clip(v, 30)}`);
      return parts.join(", ");
    }
  }
}

export interface ChannelApprovalGateDecision {
  readonly allowed: boolean;
  readonly reason?: string;
}

export type ChannelApprovalGate = (
  input: ChannelApprovalGateInput
) => Promise<ChannelApprovalGateDecision>;

/**
 * Approval gate for tools triggered by an inbound channel message.
 * `read` tools pass untouched. A `write` / `execute` (risky) tool
 * is NOT executed: an in-chat approval prompt is posted back to the
 * originating channel and the gate denies this turn. Fail-closed —
 * if posting the prompt throws, the risky tool is still denied
 * (never let it through because the notice failed to send).
 */
export function createChannelApprovalGate(options: {
  readonly registry: MessagingProviderRegistry;
  readonly providerId: string;
  readonly source: string;
}): ChannelApprovalGate {
  return async ({ toolCall, risk }) => {
    if (risk === "read") {
      return { allowed: true };
    }
    const draft = summarizeToolDraft(toolCall.name, toolCall.arguments);
    const text =
      `🔒 Approval needed: Muse wants to run "${toolCall.name}" (${risk})`
      + (draft ? ` — ${draft}` : "")
      + ". It was NOT executed — reply to approve before it can run.";
    try {
      await options.registry.send(options.providerId, { destination: options.source, text });
    } catch {
      // Notice failed to send — still deny; a risky tool must never
      // run just because the approval prompt couldn't be delivered.
    }
    return {
      allowed: false,
      reason: `awaiting in-chat approval for "${toolCall.name}" (${risk})`
    };
  };
}
