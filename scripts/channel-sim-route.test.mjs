// Deterministic unit tests for channel-sim's pure route classifier.
// Run: node --test scripts/channel-sim-route.test.mjs   (zero deps, no Ollama)

import assert from "node:assert/strict";
import { test } from "node:test";

import { classifyRoute, UNPAIRED_NOTICE } from "./channel-sim-route.mjs";

function base(overrides = {}) {
  return {
    casualMatch: false,
    channelIntentIsChat: false,
    isApproval: false,
    isVeto: false,
    replies: [],
    ...overrides
  };
}

test("no replies at all → silent", () => {
  assert.equal(classifyRoute(base()), "silent");
});

test("final reply is the unpaired notice → unpaired", () => {
  const replies = [{ atMs: 1, kind: "final", text: UNPAIRED_NOTICE }];
  assert.equal(classifyRoute(base({ replies })), "unpaired");
});

test("approval reply with a muse-approvals ack → approval-ack", () => {
  const replies = [{ atMs: 1, kind: "final", text: "Got it — approve with `muse approvals approve pending-1`." }];
  assert.equal(classifyRoute(base({ isApproval: true, replies })), "approval-ack");
});

test("veto phrase with the veto confirmation suffix → veto", () => {
  const replies = [{ atMs: 1, kind: "final", text: "알겠어 — 이런 종류의 알림은 이제 안 보낼게. 되돌리려면: muse proactive keep pattern-firing" }];
  assert.equal(classifyRoute(base({ isVeto: true, replies })), "veto");
});

test("veto phrase but the reply is NOT the veto confirmation (fell through) → not veto", () => {
  const replies = [{ atMs: 1, kind: "final", text: "some unrelated agent answer" }];
  assert.notEqual(classifyRoute(base({ isVeto: true, replies })), "veto");
});

test("casual byte-match → casual, even when other signals are also present", () => {
  const replies = [{ atMs: 1, kind: "final", text: "Hi! I answer from your own notes…" }];
  assert.equal(classifyRoute(base({ casualMatch: true, channelIntentIsChat: true, replies })), "casual");
});

test("ack + final → ack+run (delegation)", () => {
  const replies = [
    { atMs: 1, kind: "ack", text: "on it — I'll report back" },
    { atMs: 2, kind: "final", text: "done." }
  ];
  assert.equal(classifyRoute(base({ replies })), "ack+run");
});

test("ack with no final (empty agent output) → ack-only-silent", () => {
  const replies = [{ atMs: 1, kind: "ack", text: "on it — I'll report back" }];
  assert.equal(classifyRoute(base({ replies })), "ack-only-silent");
});

test("final only + channel intent classified as chat → chat", () => {
  const replies = [{ atMs: 1, kind: "final", text: "아이고 피곤하겠다! 얼른 쉬어~" }];
  assert.equal(classifyRoute(base({ channelIntentIsChat: true, replies })), "chat");
});

test("final only + not chat-classified → run (plain full agent turn, e.g. ack composer unavailable)", () => {
  const replies = [{ atMs: 1, kind: "final", text: "your rent is 900,000 KRW [from rent.md]." }];
  assert.equal(classifyRoute(base({ replies })), "run");
});

test("gate-ordering: unpaired notice wins even when the text also happens to look like a veto/approval word", () => {
  const replies = [{ atMs: 1, kind: "final", text: UNPAIRED_NOTICE }];
  assert.equal(classifyRoute(base({ isApproval: true, isVeto: true, replies })), "unpaired");
});
