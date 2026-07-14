/**
 * Live battery for the rule-vs-rule conflict classifier (rule-conflict.ts) that
 * backs `selectBehaviouralRules`' stage-2 conflict resolution
 * (behavioural-rule-budget.ts).
 *
 * Embedding cosine CANNOT tell a rule conflict from a compatible pair — measured
 * on the real embedder (nomic-embed-text-v2-moe): contradictory pairs scored
 * 0.190-0.748 (mean 0.471), compatible pairs scored 0.152-0.378 (mean 0.243). The
 * ranges overlap and a genuine contradiction can score LOWER than a compatible
 * pair ("use bullet points" vs "write in flowing prose, no lists" = 0.190, while
 * "lead with the answer" vs "be concise" = 0.378). This battery proves the LLM
 * binary classifier that replaced it actually works, live, on the local model —
 * 5 genuine conflicts + 5 genuinely compatible pairs, each run
 * `MUSE_EVAL_REPEAT` times (default 3) and required to pass EVERY run
 * (pass^k) since the conflict edge this feeds gates a rule out of the prompt.
 *
 * LOCAL OLLAMA ONLY; skips (exit 0) when unreachable — a skip is not a pass.
 */
import { classifyRuleConflict } from "../../../packages/agent-core/dist/index.js";
import { OllamaProvider } from "../../../packages/model/dist/index.js";

const MODEL = process.env.MUSE_EVAL_MODEL ?? "gemma4:12b";
const OLLAMA_BASE = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/+$/u, "");
const REPEAT = Math.max(1, Math.trunc(Number(process.env.MUSE_EVAL_REPEAT ?? "3")));

async function ollamaHasModel() {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return false;
    const names = ((await res.json())?.models ?? []).map((m) => m?.name ?? "");
    return names.some((n) => n === MODEL || n.startsWith(`${MODEL}:`));
  } catch {
    return false;
  }
}

if (!(await ollamaHasModel())) {
  console.log(`eval:rule-conflict skipped — local model '${MODEL}' unavailable at ${OLLAMA_BASE} (a skip is not a pass).`);
  process.exit(0);
}

const modelProvider = new OllamaProvider({ baseUrl: OLLAMA_BASE });

// [a, b, expectConflict] — the measured cosine bands (module docstring) show
// these two populations OVERLAP on absolute cosine; only the pair's actual
// content decides the verdict, which is exactly what these cases probe.
const CASES = [
  ["use bullet points", "write in flowing prose, no lists", true],
  ["always confirm before scheduling anything", "just schedule it without asking me first", true],
  ["reply in Korean by default", "always reply in English only", true],
  ["keep answers under two sentences", "give thorough, detailed multi-paragraph answers", true],
  ["never suggest anything containing peanuts", "recommend peanut butter sandwiches for lunch", true],
  ["lead with the answer", "be concise", false],
  ["always cite the source note", "use bullet points for lists", false],
  ["address the user by their first name", "keep replies under two sentences", false],
  ["confirm before deleting a file", "use metric units for measurements", false],
  ["reply in Korean by default", "always cite the source note for any claim", false]
];

let failures = 0;
for (const [a, b, expectConflict] of CASES) {
  const runs = [];
  for (let i = 0; i < REPEAT; i += 1) {
    runs.push(await classifyRuleConflict(a, b, { model: MODEL, modelProvider }));
  }
  const allCorrect = runs.every((got) => got === expectConflict);
  const label = expectConflict ? "CONFLICT" : "OK";
  if (!allCorrect) failures += 1;
  console.log(
    `${allCorrect ? "PASS" : "FAIL"} exp=${label} got=[${runs.map((r) => (r === undefined ? "?" : r ? "CONFLICT" : "OK")).join(",")}] — "${a}" vs "${b}"`
  );
}

console.log(`\n${failures === 0 ? "ALL PASS" : "FAILED"} (${CASES.length - failures}/${CASES.length} cases, stable across ${REPEAT} runs each) on ${MODEL}`);
process.exit(failures === 0 ? 0 : 1);
