#!/usr/bin/env node
/**
 * Dogfood: verify proactive Phase D agent-synthesized notice text
 * really produces a JARVIS-style heads-up against a real LLM.
 *
 * Uses the same task-due-soon fixture `muse proactive scan` shows,
 * runs runDueProactiveNotices with a fake messaging registry +
 * real activity tracker pointing at "right now", and asserts:
 *
 *   1. The delivered text is NOT the flat "📋 <title> due in N min".
 *   2. It contains the task title.
 *   3. It's short enough to fit in a chat notification (≤ 300 chars).
 *
 * The dedupe sidecar lives in a tmp dir so re-runs always fire.
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("../", import.meta.url);
const mcp = await import(new URL("./packages/mcp/dist/index.js", ROOT).href);
const autoconfigure = await import(new URL("./packages/autoconfigure/dist/index.js", ROOT).href);

const { runDueProactiveNotices } = mcp;
const { createMuseRuntimeAssembly } = autoconfigure;

async function pickProvider() {
  // MUSE_DOGFOOD_MODEL lets you force a specific provider for this
  // dogfood (useful for "prove local-Ollama also synthesises a
  // JARVIS-style heads-up", not just cloud). Falls through to the
  // existing env-key precedence when unset.
  const forced = (process.env.MUSE_DOGFOOD_MODEL ?? "").trim();
  if (forced) return forced;
  if (process.env.GEMINI_API_KEY) return "gemini/gemini-2.0-flash";
  if (process.env.OPENAI_API_KEY) return "openai/gpt-4o-mini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic/claude-haiku-4-5-20251001";
  // Last resort: probe Ollama. If a model is loaded locally, use the
  // highest-tier one already on disk.
  try {
    const tags = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(1000) });
    const data = await tags.json();
    const installed = (data.models ?? []).map((m) => m.name);
    for (const candidate of ["qwen2.5:7b-instruct", "qwen2.5:3b", "qwen2.5:1.5b-instruct"]) {
      if (installed.includes(candidate)) return `ollama/${candidate}`;
    }
  } catch { /* no ollama */ }
  return null;
}

const modelId = await pickProvider();
if (!modelId) {
  console.error("No provider key and no local Ollama model. Set GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY, or pull a model with `ollama pull qwen2.5:1.5b-instruct`.");
  process.exit(2);
}
process.env.MUSE_MODEL = modelId;
// ollama/* needs the explicit provider id so the autoconfigure factory
// routes to OllamaProvider instead of falling back to OpenAI-compat.
if (modelId.startsWith("ollama/")) {
  process.env.MUSE_MODEL_PROVIDER_ID = "ollama";
}
console.log(`dogfood:phase-d — using ${modelId}`);

const assembly = createMuseRuntimeAssembly();
if (!assembly.agentRuntime) {
  console.error("agentRuntime is undefined — model resolution failed.");
  process.exit(2);
}
if (!assembly.defaultModel) {
  console.error("defaultModel undefined.");
  process.exit(2);
}

// Seed a synthetic task due soon in a tmp tasks file so we don't
// stomp on the user's real ~/.muse/tasks.json.
const dir = mkdtempSync(join(tmpdir(), "muse-dogfood-phase-d-"));
const tasksFile = join(dir, "tasks.json");
const sidecarFile = join(dir, "proactive-fired.json");
const historyFile = join(dir, "proactive-history.json");

const now = new Date();
const dueAt = new Date(now.getTime() + 5 * 60_000); // 5 min from now
writeFileSync(tasksFile, JSON.stringify({
  tasks: [{
    createdAt: now.toISOString(),
    dueAt: dueAt.toISOString(),
    id: "dogfood-task-1",
    status: "open",
    title: "Send the Q3 budget memo to Finance"
  }]
}), "utf8");

// Fake messaging registry — captures the delivered text.
const sent = [];
const fakeRegistry = {
  send: async (providerId, message) => {
    sent.push({ destination: message.destination, providerId, text: message.text });
    return { destination: message.destination, messageId: "dogfood-stub", providerId };
  }
};

// Activity tracker reports "right now" so the active-session window
// matches and Phase D synthesis fires.
const activitySource = { lastActivityMs: () => Date.now() };

// Prefer the raw modelProvider path — synthesis is one-shot text
// generation, the agent runtime's tool registry causes ≤ 3B local
// models to emit tool-call JSON instead of prose.
const summary = await runDueProactiveNotices({
  activeSessionWindowMs: 60_000,
  activitySource,
  agentModel: assembly.defaultModel,
  ...(assembly.modelProvider
    ? { modelProvider: assembly.modelProvider }
    : { agentRuntime: assembly.agentRuntime }),
  destination: "@dogfood",
  historyFile,
  leadMinutes: 10,
  messagingRegistry: fakeRegistry,
  providerId: "telegram",
  sidecarFile,
  tasksFile
});

console.log(`  summary: imminent=${summary.imminent} fired=${summary.fired} errors=${summary.errors.length}`);

if (summary.fired !== 1) {
  console.error(`FAIL — expected fired=1, got ${summary.fired}. errors=${JSON.stringify(summary.errors)}`);
  process.exit(1);
}

const delivered = sent[0]?.text ?? "";
const flatExpected = "📋 Send the Q3 budget memo to Finance due in 5 min";
console.log(`  delivered text: ${delivered}`);

let failures = 0;
if (delivered === flatExpected) {
  console.error(`FAIL — text is the flat fallback, agent synthesis did not fire.`);
  failures += 1;
}
if (!delivered.includes("Q3") && !delivered.toLowerCase().includes("budget") && !delivered.toLowerCase().includes("finance")) {
  console.error(`FAIL — synthesized text doesn't reference the task ('${delivered}').`);
  failures += 1;
}
// Tighter assertion: the delivered text MUST be prose, not a
// tool-call JSON envelope. Small local models (≤ 3B) leak the
// muse.tasks.add payload otherwise; the synthesis path now drops
// back to flat text when this happens.
const proseStripped = delivered.replace(/^[^\w{[]+/, "");
const looksLikeJson = proseStripped.startsWith("{") || proseStripped.startsWith("[");
if (looksLikeJson) {
  console.error(`FAIL — synthesized text is JSON-shaped, not prose ('${delivered.slice(0, 120)}...').`);
  failures += 1;
}
if (delivered.length > 300) {
  console.error(`FAIL — synthesized text is ${delivered.length} chars (cap suggested ≤ 300).`);
  failures += 1;
}

// Verify the history sidecar captured the delivered text (not the flat one).
const { readProactiveHistory } = mcp;
const entries = await readProactiveHistory(historyFile);
console.log(`  history entries: ${entries.length}`);
if (entries.length !== 1) {
  console.error(`FAIL — expected 1 history entry, got ${entries.length}.`);
  failures += 1;
} else {
  const e = entries[0];
  console.log(`    status=${e.status} kind=${e.kind} title='${e.title}' text='${e.text.slice(0, 80)}...'`);
  if (e.text !== delivered) {
    console.error(`FAIL — history.text doesn't match delivered ('${e.text}' vs '${delivered}').`);
    failures += 1;
  }
}

if (failures > 0) {
  process.exit(1);
}

console.log("---");
console.log("PASS  Phase D agent synthesis produced a contextual JARVIS-style heads-up.");
