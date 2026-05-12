#!/usr/bin/env node
/**
 * Profile the gap between raw ModelProvider.generate and Muse
 * `/api/chat` for the same prompt. The local-LLM dogfood surfaced
 * an 11-second overhead on qwen2.5:7b — this script narrows down
 * where that time goes (raw model, agent-runtime hook pipeline,
 * tool registry, response decoration).
 *
 * Output: per-stage timing in ms.
 *
 * Usage:
 *   node scripts/profile-chat-overhead.mjs <ollama-model>
 */
import { performance } from "node:perf_hooks";

const model = (process.argv[2] ?? "").trim();
if (!model) {
  console.error("usage: profile-chat-overhead <ollama-tag>");
  process.exit(2);
}

process.env.MUSE_MODEL = `ollama/${model}`;
process.env.MUSE_MODEL_PROVIDER_ID = "ollama";

const ROOT = new URL("../", import.meta.url);
const { buildServer } = await import(new URL("./apps/api/dist/server.js", ROOT).href);
const { createMuseRuntimeAssembly, createApiServerOptions } = await import(
  new URL("./packages/autoconfigure/dist/index.js", ROOT).href
);

const PROMPT = "한 문장으로 답해줘. 1 + 1은 몇이야?";

// ── Layer 1: raw ModelProvider.generate ──────────────────────────────
const assembly = createMuseRuntimeAssembly();
if (!assembly.modelProvider) {
  console.error("No modelProvider in assembly. Set MUSE_MODEL.");
  process.exit(2);
}

// Warm-up so steady-state numbers don't include model load.
await assembly.modelProvider.generate({
  messages: [{ content: "ok", role: "user" }],
  model: `ollama/${model}`
});

console.log(`profile — model=ollama/${model}`);
const layers = [];

async function time(label, fn) {
  const start = performance.now();
  const result = await fn();
  const ms = performance.now() - start;
  layers.push({ label, ms: Math.round(ms) });
  console.log(`  ${label.padEnd(40)} ${ms.toFixed(0).padStart(6)} ms`);
  return result;
}

await time("layer1: raw provider.generate (no tools)", () => assembly.modelProvider.generate({
  messages: [{ content: PROMPT, role: "user" }],
  model: `ollama/${model}`
}));

await time("layer2: raw provider.generate WITH tools", () => assembly.modelProvider.generate({
  messages: [{ content: PROMPT, role: "user" }],
  model: `ollama/${model}`,
  tools: assembly.toolRegistry.list().map((tool) => ({
    description: tool.definition.description,
    inputSchema: tool.definition.inputSchema,
    name: tool.definition.name
  }))
}));

if (!assembly.agentRuntime) {
  console.error("FAIL: no agentRuntime");
  process.exit(1);
}

await time("layer3: agentRuntime.run (full pipeline)", () => assembly.agentRuntime.run({
  messages: [{ content: PROMPT, role: "user" }],
  model: `ollama/${model}`
}));

await time("layer3b: agentRuntime.run with maxTools:0", () => assembly.agentRuntime.run({
  messages: [{ content: PROMPT, role: "user" }],
  metadata: { maxTools: 0 },
  model: `ollama/${model}`
}));

// ── Layer 4: through fastify /api/chat ───────────────────────────────
const options = createApiServerOptions();
const server = buildServer(options);

await time("layer4: HTTP /api/chat (in-process inject)", async () => {
  const r = await server.inject({
    body: JSON.stringify({
      message: PROMPT,
      metadata: { sessionId: `profile-${Date.now()}`, userId: "profile" }
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
    url: "/api/chat"
  });
  if (r.statusCode !== 200) throw new Error(`status ${r.statusCode}`);
});

await server.close();

console.log("---");
console.log("Breakdown (layer N - layer N-1 = added overhead):");
for (let i = 1; i < layers.length; i += 1) {
  const delta = layers[i].ms - layers[i - 1].ms;
  const sign = delta >= 0 ? "+" : "";
  console.log(`  ${layers[i - 1].label.slice(0, 6)} → ${layers[i].label.slice(0, 6)}: ${sign}${delta} ms`);
}
