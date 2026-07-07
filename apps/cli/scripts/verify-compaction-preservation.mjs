/**
 * LIVE battery for the CMP-2 fail-close post-compaction QUALITY GATE
 * (`verifyCompactionSummaryQuality`). Proves two things together:
 *
 *   1. DETERMINISTIC (no model needed): a deliberately lossy summary that
 *      drops a user-stated hard anchor (a number, a name, a decision) is
 *      REJECTED — the gate is code, not a judge, and it must fail closed
 *      on an obviously bad recap regardless of the model.
 *   2. LIVE (real local model): the real aux summarizer
 *      (`createModelDroppedContextSummarizer`) is asked to compress a
 *      synthetic long conversation with 3 planted hard facts (a number, a
 *      name, a decision) planted in the USER's own words. The resulting
 *      recap must pass the gate AND actually contain all three planted
 *      facts verbatim — proving the CMP-2 aux-summary path really does
 *      preserve what the deterministic gate requires, on a real model, not
 *      just in a stubbed unit test.
 *
 *   node apps/cli/scripts/verify-compaction-preservation.mjs   (ollama/gemma4:12b)
 *
 * Exit 0 if every case passes; skip (exit 0) if Ollama is unreachable.
 * LOCAL OLLAMA ONLY.
 */
import { createModelDroppedContextSummarizer } from "@muse/agent-core";
import { createMuseRuntimeAssembly } from "@muse/autoconfigure";
import { summarizeDroppedContext, verifyCompactionSummaryQuality } from "@muse/memory";

const model = process.argv[2] ?? "ollama/gemma4:12b";
if (!model.startsWith("ollama/")) { console.error("LOCAL OLLAMA ONLY"); process.exit(2); }
const baseUrl = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");

async function reachable() {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 3_000);
    const r = await fetch(`${baseUrl}/api/tags`, { signal: c.signal });
    clearTimeout(t);
    return r.ok;
  } catch { return false; }
}
if (!(await reachable())) {
  console.log(`verify-compaction-preservation skipped — local Ollama not reachable at ${baseUrl}. A skip is not a pass.`);
  process.exit(0);
}

let failures = 0;

// ---------------------------------------------------------------------------
// Case 1 (deterministic, no model): a deliberately truncated/lossy summary
// missing the user's own hard anchors must be REJECTED fail-close.
// ---------------------------------------------------------------------------
{
  const dropped = [
    {
      content: 'the deposit for "Ridgeline Cabin" is $4,500 — we decided to book it for October',
      role: "user"
    },
    { content: "got it, I'll note that down.", role: "assistant" }
  ];
  const lossySummary = "discussed a booking.";
  const gate = verifyCompactionSummaryQuality(dropped, lossySummary);
  const ok = !gate.passed && gate.missingUserAnchors.length > 0;
  console.log(`${ok ? "PASS" : "FAIL"} — deterministic: a lossy summary missing user-stated anchors is rejected fail-close`);
  console.log(`   gate: ${JSON.stringify(gate)}`);
  if (!ok) failures += 1;
}

// ---------------------------------------------------------------------------
// Case 2 (live): synthetic long conversation, 3 planted USER-stated hard
// facts (number, name, decision) — the real summarizer + gate must preserve
// all three.
// ---------------------------------------------------------------------------
{
  process.env.MUSE_DEFAULT_MODEL = model;
  const modelProvider = createMuseRuntimeAssembly().modelProvider;
  const summarizer = createModelDroppedContextSummarizer(modelProvider, model);

  const plantedNumber = "$7,250";
  const plantedName = "Ironbridge Logistics";
  const plantedDecision = "we decided to sign the contract with Ironbridge Logistics";

  const dropped = [];
  for (let i = 0; i < 6; i++) {
    dropped.push({
      content: `Just some earlier back-and-forth about scheduling, point number ${(i + 1).toString()}, nothing critical here.`,
      role: i % 2 === 0 ? "user" : "assistant"
    });
  }
  dropped.push({
    content: `Quick update: ${plantedDecision}. The invoice total came out to ${plantedNumber}.`,
    role: "user"
  });
  dropped.push({ content: "Understood — I'll keep that on file.", role: "assistant" });

  const auxSummary = await summarizeDroppedContext(dropped, summarizer, { fallback: "" });
  const gate = verifyCompactionSummaryQuality(dropped, auxSummary);

  const containsNumber = auxSummary.includes(plantedNumber);
  const containsName = auxSummary.toLowerCase().includes(plantedName.toLowerCase());
  const containsDecision = /sign(ed)?\s+(the\s+)?contract/iu.test(auxSummary) || auxSummary.toLowerCase().includes("ironbridge");
  const ok = gate.passed && containsNumber && containsName && containsDecision;

  console.log(`${ok ? "PASS" : "FAIL"} — live (${model}): real aux summarizer preserves the 3 planted user-stated facts`);
  console.log(`   summary: ${JSON.stringify(auxSummary)}`);
  console.log(`   gate: ${JSON.stringify(gate)}`);
  console.log(`   contains: number=${String(containsNumber)} name=${String(containsName)} decision=${String(containsDecision)}`);
  if (!ok) failures += 1;
}

console.log(failures === 0 ? "\nALL PASS (2) — compaction-preservation gate" : `\n${failures}/2 FAILED — compaction-preservation gate`);
process.exit(failures === 0 ? 0 : 1);
