import { describe, expect, it } from "vitest";

import { MessagingProviderRegistry, createChannelApprovalGate } from "../src/index.js";
import { summarizeToolDraft, type ChannelApprovalRefusal } from "../src/channel-approval-gate.js";
import type { MessagingProvider, OutboundMessage } from "../src/types.js";

// Coverage for the outbound-safety DRAFT-FIRST content (summarizeToolDraft was
// untested) plus the gate's refusal-RECORDING trail and fail-soft — the parts
// of createChannelApprovalGate the existing gate test did not exercise (it only
// drove tool names with NO arguments, so the draft was always empty).
//
// Two properties here are non-negotiable per outbound-safety.md:
//   - the draft shows ENOUGH to decide (recipient + subject) but must NOT echo
//     a bulk/sensitive payload (an email BODY) back into the chat transcript.
//   - a refused risky tool leaves a rationale-bearing trail (recordRefusal),
//     and a THROWING recorder must NOT flip the fail-closed deny.

describe("summarizeToolDraft", () => {
  it("returns an empty draft when there are no arguments", () => {
    expect(summarizeToolDraft("email_send", undefined)).toBe("");
    expect(summarizeToolDraft("anything", {})).toBe("");
  });

  it("email_send: shows recipient + subject and OMITS the body (no sensitive payload in chat)", () => {
    const draft = summarizeToolDraft("email_send", {
      body: "CONFIDENTIAL contract terms the user never agreed to echo back",
      subject: "Lunch?",
      to: "alice@example.com"
    });
    expect(draft).toBe('to alice@example.com, subject "Lunch?"');
    expect(draft).not.toContain("CONFIDENTIAL"); // the body must never reach the transcript
  });

  it("web_action: method + url, defaulting the method to POST", () => {
    expect(summarizeToolDraft("web_action", { method: "DELETE", url: "https://api.x.com/orders/42" }))
      .toBe("DELETE https://api.x.com/orders/42");
    expect(summarizeToolDraft("web_action", { url: "https://api.x.com/p" })).toBe("POST https://api.x.com/p");
  });

  it("home_action: service alone, or service on entity when an entity is given", () => {
    expect(summarizeToolDraft("home_action", { entity: "lock.front_door", service: "lock" })).toBe("lock on lock.front_door");
    expect(summarizeToolDraft("home_action", { service: "scene.movie_night" })).toBe("scene.movie_night");
  });

  it("default: the first 3 SCALAR fields as k=v, skipping object/array payloads", () => {
    const args = { title: "Buy milk", meta: { a: 1 }, priority: 3, when: "today", extra: "dropped-4th" };
    expect(summarizeToolDraft("tasks.create", args)).toBe("title=Buy milk, priority=3, when=today"); // meta skipped (object), extra is the dropped 4th scalar
  });

  it("clips long values to an ellipsis and collapses internal whitespace", () => {
    const draft = summarizeToolDraft("email_send", {
      subject: "multi   line\n  subject   here that is quite long indeed yes",
      to: `${"a".repeat(60)}@example.com`
    });
    expect(draft).toBe('to aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa…, subject "multi line subject here that is quite long indeed…"');
  });
});

const capturingProvider = (sent: OutboundMessage[]): MessagingProvider => ({
  describe: () => ({ configured: true, displayName: "Fake", id: "fake" }),
  id: "fake",
  send: async (message: OutboundMessage) => { sent.push(message); }
}) as unknown as MessagingProvider;

describe("createChannelApprovalGate — refusal recording + draft surfaced", () => {
  it("hands each refused risky tool to recordRefusal with the draft + arguments, and includes the draft in the posted prompt", async () => {
    const sent: OutboundMessage[] = [];
    const refusals: ChannelApprovalRefusal[] = [];
    const gate = createChannelApprovalGate({
      providerId: "fake",
      recordRefusal: async (r) => { refusals.push(r); },
      registry: new MessagingProviderRegistry([capturingProvider(sent)]),
      source: "chat-1"
    });

    const args = { subject: "Lunch?", to: "alice@example.com" };
    const decision = await gate({ risk: "write", runId: "r1", toolCall: { arguments: args, name: "email_send" }, userId: "u-7" });

    expect(decision.allowed).toBe(false);
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toMatchObject({
      arguments: args, // kept so a later approval can re-run it
      draft: 'to alice@example.com, subject "Lunch?"',
      risk: "write",
      tool: "email_send",
      userId: "u-7"
    });
    expect(sent[0]?.text).toContain('to alice@example.com, subject "Lunch?"'); // draft surfaced to the user
    expect(sent[0]?.text).toContain("NOT executed");
  });

  it("fail-SOFT: a THROWING recordRefusal never flips the deny (a wedged log can't let a risky tool through)", async () => {
    const sent: OutboundMessage[] = [];
    const gate = createChannelApprovalGate({
      providerId: "fake",
      recordRefusal: async () => { throw new Error("disk wedged"); },
      registry: new MessagingProviderRegistry([capturingProvider(sent)]),
      source: "chat-1"
    });

    const decision = await gate({ risk: "execute", runId: "r2", toolCall: { arguments: { url: "https://x" }, name: "web_action" } });
    expect(decision.allowed).toBe(false); // still denied despite the recorder throwing
    expect(sent).toHaveLength(1); // the prompt still posted
  });

  it("read tools never record a refusal or post a prompt", async () => {
    const sent: OutboundMessage[] = [];
    const refusals: ChannelApprovalRefusal[] = [];
    const gate = createChannelApprovalGate({
      providerId: "fake",
      recordRefusal: async (r) => { refusals.push(r); },
      registry: new MessagingProviderRegistry([capturingProvider(sent)]),
      source: "chat-1"
    });

    const decision = await gate({ risk: "read", runId: "r3", toolCall: { arguments: { query: "x" }, name: "knowledge_search" } });
    expect(decision.allowed).toBe(true);
    expect(refusals).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });
});
