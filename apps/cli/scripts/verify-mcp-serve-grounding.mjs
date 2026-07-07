/**
 * LIVE battery for `muse mcp serve`'s `muse_recall` tool — proves the
 * grounding gate holds through the FULL MCP wire (initialize -> tools/call),
 * not just the underlying `runGroundedRecall` seam (already covered by
 * verify-grounded-recall-seam.mjs). Drives the REAL local model + REAL
 * embeddings, over a tiny temp notes corpus, through the SAME
 * `createMuseToolsMcpServer` + `buildMcpServeTools` wiring the CLI's
 * `muse mcp serve` production command uses, using the SDK `Client` class
 * (the same one `packages/mcp/src/transport.ts` uses) as the connecting agent.
 *
 *   1. answerable question -> a cited grounded answer (fabrication=0, checked
 *      on real model output) comes back through the `muse_recall` tool call;
 *   2. unanswerable question -> the honest "I'm not sure" / refusal framing,
 *      never a fabricated citation.
 *
 *   node apps/cli/scripts/verify-mcp-serve-grounding.mjs   (ollama/gemma4:12b)
 *
 * Exit 0 if both cases pass; skip (exit 0) if Ollama or an embed model is
 * unreachable. LOCAL OLLAMA ONLY.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMuseRuntimeAssembly } from "@muse/autoconfigure";
import { createMuseToolsMcpServer } from "@muse/mcp";
import { InMemoryUserMemoryStore } from "@muse/memory";
import { LocalDirNotesProvider } from "@muse/domain-tools";
import { embed, reindexNotes } from "@muse/recall";

import { buildMcpServeTools } from "../dist/mcp-serve-tools.js";

const model = process.argv[2] ?? "ollama/gemma4:12b";
if (!model.startsWith("ollama/")) { console.error("LOCAL OLLAMA ONLY"); process.exit(2); }
const baseUrl = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");

async function tags() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3_000);
    const response = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return undefined;
    const body = await response.json();
    return (body.models ?? []).map((m) => String(m.name ?? ""));
  } catch {
    return undefined;
  }
}

const available = await tags();
if (!available) {
  console.log(`verify-mcp-serve-grounding skipped — local Ollama not reachable at ${baseUrl}. A skip is not a pass.`);
  process.exit(0);
}
const embedModel = ["nomic-embed-text-v2-moe", "nomic-embed-text"]
  .find((m) => available.some((name) => name === m || name.startsWith(`${m}:`)));
if (!embedModel) {
  console.log("verify-mcp-serve-grounding skipped — no local embed model (nomic-embed-text[-v2-moe]) pulled. A skip is not a pass.");
  process.exit(0);
}

const tmpHome = mkdtempSync(path.join(os.tmpdir(), "muse-mcp-serve-grounding-"));
process.env.HOME = tmpHome;
process.env.MUSE_DEFAULT_MODEL = model;
const modelProvider = createMuseRuntimeAssembly().modelProvider;

const notesDir = path.join(tmpHome, "notes");
mkdirSync(notesDir, { recursive: true });
writeFileSync(path.join(notesDir, "vpn.md"), "The office VPN needs MTU 1380 on the wg0 interface.\n");
const notesIndexFile = path.join(tmpHome, "notes-index.json");
const baseUrlResolver = () => baseUrl;
const embedFn = (text, m) => embed(text, m, { baseUrlResolver });

const summary = await reindexNotes({ baseUrlResolver, dir: notesDir, indexPath: notesIndexFile, model: embedModel });
if (summary.embedded === 0) {
  console.log("verify-mcp-serve-grounding skipped — embedding produced no index (embed endpoint failing). A skip is not a pass.");
  process.exit(0);
}

const deps = {
  answerModel: model,
  answerTemperature: 0.2,
  embedFn,
  embedModel,
  modelProvider,
  notesDir,
  notesIndexFile,
  notesProvider: new LocalDirNotesProvider({ notesDir }),
  now: () => new Date(),
  userId: "verify-mcp-serve-grounding",
  userMemoryStore: new InMemoryUserMemoryStore()
};

const server = createMuseToolsMcpServer({ serverName: "muse", tools: buildMcpServeTools(deps) });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: "verify-mcp-serve-grounding", version: "1.0.0" });
await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

let failures = 0;
const fail = (m) => { console.log(`FAIL — ${m}`); failures += 1; };
const pass = (m) => console.log(`PASS — ${m}`);

async function callMuseRecall(question) {
  const result = await client.callTool({ arguments: { question }, name: "muse_recall" });
  const text = String((result.content ?? [])[0]?.text ?? "");
  if (result.isError === true) {
    return { error: text };
  }
  return JSON.parse(text);
}

// 1) Answerable, over the wire.
const answerable = await callMuseRecall("What MTU does the office VPN need?");
if (answerable.error) {
  fail(`muse_recall returned a tool error on an answerable question: ${answerable.error}`);
} else {
  console.log(`grounded answer: "${answerable.answer.slice(0, 140)}${answerable.answer.length > 140 ? "…" : ""}" (verdict ${answerable.verdict})`);
  const onlyRealSources = (answerable.citations ?? []).every((c) => (c.split("/").pop() ?? c) === "vpn.md");
  onlyRealSources
    ? pass(`every citation resolves to the real seeded note (${JSON.stringify(answerable.citations)})`)
    : fail(`a non-corpus citation survived the wire: ${JSON.stringify(answerable.citations)}`);
  answerable.answer.includes("1380")
    ? pass("the grounded fact (MTU 1380) is in the answer")
    : fail(`the answerable fact is missing from the answer: "${answerable.answer.slice(0, 200)}"`);
}

// 2) Unanswerable -> honest refusal framing, never a fabricated citation.
const unanswerable = await callMuseRecall("What is my aunt's cat's name?");
if (unanswerable.error) {
  fail(`muse_recall returned a tool error on an absent-info question: ${unanswerable.error}`);
} else {
  console.log(`absent-info answer: "${unanswerable.answer.slice(0, 140)}${unanswerable.answer.length > 140 ? "…" : ""}" (verdict ${unanswerable.verdict}, refusal ${String(unanswerable.refusal)})`);
  const noFabricatedCitation = (unanswerable.citations ?? []).length === 0;
  unanswerable.refusal === true && noFabricatedCitation
    ? pass("absent-info question returned an honest refusal with no fabricated citation")
    : fail(`absent-info question did not refuse cleanly: refusal=${String(unanswerable.refusal)} citations=${JSON.stringify(unanswerable.citations)}`);
}

await client.close();
await server.close();

console.log(failures === 0 ? "\nverify-mcp-serve-grounding: ALL PASS" : `\nverify-mcp-serve-grounding: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
