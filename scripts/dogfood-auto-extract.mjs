#!/usr/bin/env node
/**
 * Dogfood: verify MUSE_USER_MEMORY_AUTO_EXTRACT=true (the recent
 * default flip) actually populates `UserMemoryStore` from a real
 * LLM round-trip.
 *
 * Boots an ephemeral API server against the configured provider,
 * sends a chat that contains a clearly extractable fact, waits for
 * the afterComplete hook to run, then asserts the in-process memory
 * store reflects the new fact.
 *
 * Designed to live alongside scripts/smoke-live-llm.mjs — same
 * harness shape, same ephemeral-port pattern, runs against whatever
 * provider key is present.
 */

import { setTimeout as sleep } from "node:timers/promises";

const ROOT = new URL("../", import.meta.url);
const { buildServer } = await import(new URL("./apps/api/dist/server.js", ROOT).href);
const autoconfigure = await import(new URL("./packages/autoconfigure/dist/index.js", ROOT).href);
const { createApiServerOptions } = autoconfigure;

function pickProvider() {
  if (process.env.GEMINI_API_KEY) {
    return { id: "gemini", model: "gemini/gemini-2.0-flash" };
  }
  if (process.env.OPENAI_API_KEY) {
    return { id: "openai", model: "openai/gpt-4o-mini" };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return { id: "anthropic", model: "anthropic/claude-haiku-4-5-20251001" };
  }
  return null;
}

const provider = pickProvider();
if (!provider) {
  console.error("No provider key found. Set GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY.");
  process.exit(2);
}

process.env.MUSE_MODEL = provider.model;
process.env.MUSE_USER_MEMORY_AUTO_EXTRACT = "true";
process.env.MUSE_USER_MEMORY_AUTO_EXTRACT_MODEL = provider.model;

console.log(`dogfood:auto-extract — using ${provider.model}`);

const options = createApiServerOptions();
if (!options.agentRuntime) {
  console.error("FAIL — agentRuntime is not configured (model resolution failed).");
  process.exit(2);
}
const server = buildServer(options);

const USER_ID = "dogfood-user";
const TURN = `dogfood:auto-extract:${Date.now()}`;

// Inject a fact-rich user turn. The extractor's prompt asks for
// facts/preferences/vetoes/goals; "My name is Stark and I prefer
// concise replies" should produce facts.name + preferences.replyStyle
// (or similar slot ids — the extractor model picks).
const chatPayload = {
  message: "Hi! Quick intro — my name is Stark and I prefer concise replies. Acknowledge and ask one short question.",
  metadata: { userId: USER_ID, sessionId: TURN }
};

const chatResponse = await server.inject({
  body: JSON.stringify(chatPayload),
  headers: { "content-type": "application/json" },
  method: "POST",
  url: "/api/chat"
});

let chatOk = chatResponse.statusCode === 200;
let chatBody;
try {
  chatBody = chatResponse.json();
} catch {
  chatBody = null;
}
if (!chatOk || !chatBody || chatBody.success !== true) {
  console.error(`FAIL /api/chat — status=${chatResponse.statusCode} body=${JSON.stringify(chatBody)?.slice(0, 200)}`);
  await server.close();
  process.exit(1);
}
console.log(`  /api/chat ok — content="${(chatBody.content ?? "").slice(0, 80)}..."`);

// afterComplete hooks run async; the auto-extract hook waits on a
// generate() call that can take a few seconds against a slower
// provider. Poll the user-memory snapshot endpoint until the
// extraction lands (or we time out).
const deadline = Date.now() + 30_000;
let extracted = null;
while (Date.now() < deadline) {
  await sleep(500);
  const snapResponse = await server.inject({
    method: "GET",
    url: `/api/user-memory/${encodeURIComponent(USER_ID)}`
  });
  if (snapResponse.statusCode !== 200) {
    continue;
  }
  const snap = snapResponse.json();
  const factCount = Object.keys(snap?.facts ?? {}).length;
  const prefCount = Object.keys(snap?.preferences ?? {}).length;
  if (factCount + prefCount > 0) {
    extracted = snap;
    break;
  }
}

await server.close();

if (!extracted) {
  console.error("FAIL — auto-extract did not populate facts/preferences within 30s.");
  process.exit(1);
}

console.log(`  user-memory snapshot for ${USER_ID}:`);
const factKeys = Object.keys(extracted.facts ?? {});
const prefKeys = Object.keys(extracted.preferences ?? {});
console.log(`    facts (${factKeys.length}): ${factKeys.join(", ")}`);
console.log(`    preferences (${prefKeys.length}): ${prefKeys.join(", ")}`);
for (const [key, value] of Object.entries(extracted.facts ?? {})) {
  console.log(`      facts.${key} = ${JSON.stringify(value)}`);
}
for (const [key, value] of Object.entries(extracted.preferences ?? {})) {
  console.log(`      preferences.${key} = ${JSON.stringify(value)}`);
}

if (factKeys.length + prefKeys.length === 0) {
  console.error("FAIL — extractor returned an empty memory state.");
  process.exit(1);
}

console.log("---");
console.log("PASS  auto-extract populated user memory from a real LLM round-trip.");
