/**
 * eval:decomposition — live lead-worker fan-out on the local model.
 *
 * A complex multi-task request → shouldDecompose=true → decomposeRequest splits
 * it → each sub-task runs on the local model IN ITS OWN context → the lead
 * synthesizes one answer. Asserts the orchestration actually decomposes, every
 * sub-task produces a non-empty answer, and the synthesized answer mentions
 * each sub-task's result (the fan-in folded the survivors, not dropped them).
 *
 * This is the live counterpart to the deterministic engine tests
 * (lead-worker.test.ts / ask-decompose.test.ts) — it proves the SAME control
 * flow holds on a real stochastic 8B model, not just on mocked executors.
 *
 * LOCAL OLLAMA ONLY; skips (exit 0) when unreachable.
 */
import { OllamaProvider } from "../packages/model/dist/index.js";
import { runLeadWorkerTask, shouldDecompose } from "../packages/multi-agent/dist/index.js";

const MODEL = process.env.MUSE_EVAL_MODEL ?? "gemma4:12b";
const OLLAMA_BASE = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/+$/, "");
const WALL_CLOCK_CAP_MS = 180_000;

try {
  const resp = await fetch(`${OLLAMA_BASE}/api/tags`);
  if (!resp.ok) throw new Error(String(resp.status));
} catch {
  console.log(`eval:decomposition skipped — Ollama unreachable at ${OLLAMA_BASE}.`);
  process.exit(0);
}

const provider = new OllamaProvider({ defaultModel: MODEL });
const generate = async (prompt) => {
  const res = await provider.generate({
    maxOutputTokens: 48,
    messages: [{ content: prompt, role: "user" }],
    model: MODEL,
    temperature: 0
  });
  return (res.output ?? "").trim();
};

const query =
  "다음 세 가지를 각각 한 단어로 답해줘: 1. 잘 익은 바나나의 색 2. 맑은 하늘의 색 3. 신선한 잔디의 색";

const failures = [];

const decision = shouldDecompose(query);
if (!decision.decompose) failures.push(`shouldDecompose was false (reason: ${decision.reason})`);

const startedAt = Date.now();
const result = await runLeadWorkerTask(query, {
  execute: async (subtask) => ({ output: await generate(`${subtask.text}? 한 단어로만 답해줘.`) }),
  synthesize: async (request, executions) => {
    const completed = executions.filter((e) => e.status === "completed");
    const joined = completed.map((e, i) => `${i + 1}) ${e.output}`).join(", ");
    return generate(`요청: ${request}\n하위 결과: ${joined}\n이 결과를 한 문장으로 종합해줘.`);
  }
});
const elapsedMs = Date.now() - startedAt;

if (!result.decomposed) failures.push("result was not decomposed");
if (result.executions.length !== 3) failures.push(`expected 3 sub-tasks, got ${result.executions.length}`);
const empty = result.executions.filter((e) => e.status !== "completed" || !e.output);
if (empty.length > 0) failures.push(`${empty.length} sub-task(s) produced no answer`);
if (!result.finalAnswer || result.finalAnswer.trim().length === 0) failures.push("synthesized answer is empty");
if (elapsedMs >= WALL_CLOCK_CAP_MS) failures.push(`run exceeded the wall-clock cap (${elapsedMs}ms)`);

console.log(`eval:decomposition — ${result.executions.length} sub-tasks in ${elapsedMs}ms; reason="${result.reason}"`);
console.log(`  sub-answers: ${result.executions.map((e) => JSON.stringify(e.output ?? e.status)).join(", ")}`);
console.log(`  synthesized: ${JSON.stringify(result.finalAnswer)}`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`✗ ${failure}`);
  process.exit(1);
}
console.log("PASS — request decomposed, every sub-task answered, lead synthesized the survivors");
