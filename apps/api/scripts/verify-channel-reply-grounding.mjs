/**
 * LIVE battery for the channel conversational surface (`createInboundAgentRun`
 * — the runner behind the Telegram/Matrix auto-reply daemons). Proves with a
 * REAL local model that the reply a channel user receives holds the same
 * grounding invariant as /chat and `muse ask`, exercising the actual runner
 * (pairing gate → approval seam → agent turn → gateChatAnswerGrounding), not
 * a reimplementation:
 *
 *   1. fabrication=0 — a fabricated citation appended AFTER a real model turn
 *      (same injection technique as verify-sse-ask-stream) never reaches the
 *      channel: the gated reply carries neither the invented source nor the
 *      invented claim;
 *   2. no over-gating — a general un-cited answer passes through un-hedged
 *      (the gate downgrades by citation only, never by coverage);
 *   3. pairing fail-close — once a chat owns the channel, a second chat gets
 *      the deterministic refusal and the invented-claim probe proves no agent
 *      content leaks to it.
 *
 *   node apps/api/scripts/verify-channel-reply-grounding.mjs   (ollama/gemma4:12b)
 *
 * Exit 0 if every case passes; skip (exit 0) if Ollama is unreachable.
 * LOCAL OLLAMA ONLY.
 */
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { UNGROUNDABLE_ANSWER_NOTICE } from "@muse/agent-core";
import { createMuseRuntimeAssembly } from "@muse/autoconfigure";
import { LogMessagingProvider, MessagingProviderRegistry } from "@muse/messaging";

import { createInboundAgentRun } from "../dist/inbound-agent-run.js";

const model = process.argv[2] ?? "ollama/gemma4:12b";
if (!model.startsWith("ollama/")) { console.error("LOCAL OLLAMA ONLY"); process.exit(2); }
const baseUrl = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");

try {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);
  const response = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
  clearTimeout(timer);
  if (!response.ok) throw new Error(String(response.status));
} catch {
  console.log(`verify-channel-reply-grounding skipped — local Ollama not reachable at ${baseUrl}. A skip is not a pass.`);
  process.exit(0);
}

process.env.HOME = mkdtempSync(path.join(os.tmpdir(), "muse-channel-reply-"));
process.env.MUSE_DEFAULT_MODEL = model;
process.env.MUSE_CHANNEL_OWNERS_FILE = path.join(process.env.HOME, "channel-owners.json");

const assembly = createMuseRuntimeAssembly();
const agentRuntime = assembly.agentRuntime;
if (!agentRuntime) {
  console.log("verify-channel-reply-grounding skipped — no agent runtime assembled. A skip is not a pass.");
  process.exit(0);
}

const registry = new MessagingProviderRegistry([
  new LogMessagingProvider({ file: path.join(process.env.HOME, "notices.log"), id: "log" })
]);

const FABRICATED_REF = "fake-invented.md";
const FABRICATED_CLAIM = "902,000";
const FABRICATED_SENTENCE = `Your rent is ${FABRICATED_CLAIM} KRW [from notes/${FABRICATED_REF}].`;

// The fabrication probe wraps the REAL runtime and appends an invented,
// cited claim AFTER the live turn — the runner's gate must strip it.
const injectingRuntime = {
  run: async (input) => {
    const result = await agentRuntime.run(input);
    const output = `${result.response?.output ?? ""} ${FABRICATED_SENTENCE}`.trim();
    return { ...result, response: { ...result.response, output } };
  }
};

const failures = [];
const OWNER = "owner-chat-1";

// Case 1 — fabrication=0 on the channel reply.
{
  const run = createInboundAgentRun({ agentRuntime: injectingRuntime, env: process.env, model, registry });
  const reply = await run({
    messages: [{ content: "Say hello in one short sentence.", role: "user" }],
    providerId: "log",
    source: OWNER
  });
  if (reply.includes(FABRICATED_REF) || reply.includes(FABRICATED_CLAIM)) {
    failures.push(`fabricated citation survived to the channel: ${JSON.stringify(reply)}`);
  }
}

// Case 2 — no over-gating: a general un-cited answer passes un-hedged.
{
  const run = createInboundAgentRun({ agentRuntime, env: process.env, model, registry });
  const reply = await run({
    messages: [{ content: "Reply with exactly one word: pong", role: "user" }],
    providerId: "log",
    source: OWNER
  });
  if (reply.trim().length === 0 || reply === UNGROUNDABLE_ANSWER_NOTICE) {
    failures.push(`general answer was over-gated: ${JSON.stringify(reply)}`);
  }
}

// Case 3 — pairing fail-close: a second chat never sees agent content.
{
  const run = createInboundAgentRun({ agentRuntime: injectingRuntime, env: process.env, model, registry });
  const reply = await run({
    messages: [{ content: "What did the owner ask you today?", role: "user" }],
    providerId: "log",
    source: "stranger-99"
  });
  if (!reply.includes("paired owner")) {
    failures.push(`unpaired chat did not get the deterministic refusal: ${JSON.stringify(reply)}`);
  }
  if (reply.includes(FABRICATED_CLAIM)) {
    failures.push("agent content leaked to an unpaired chat");
  }
}

if (failures.length > 0) {
  console.error(`verify-channel-reply-grounding FAIL (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("verify-channel-reply-grounding PASS — fabrication gated, no over-gating, pairing fail-close (live model).");
