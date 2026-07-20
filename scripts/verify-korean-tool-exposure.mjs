#!/usr/bin/env node
/**
 * A tool the user cannot REACH is not a capability, however good its handler.
 *
 * `isToolRelevantToPrompt` hard-BLOCKS a tool that declares `keywords` when none
 * of them match the prompt — it is not a down-rank. So an English-only keyword
 * list makes a tool invisible to a Korean prompt, and the six exposure slots
 * fill up with keyword-less tools that are "always relevant" but useless here.
 * Measured on the real 104-tool production registry before this guard existed:
 * "제인한테 메일 보내줘" exposed neither email_send nor any messaging tool.
 *
 * This runs the REAL registry through the REAL exposure policy — no fixtures —
 * and fails closed when a listed prompt cannot see the tool that must serve it.
 * English rows sit alongside the Korean ones so a fix for one language cannot
 * silently regress the other.
 *
 * Scope: this measures REACHABILITY only. The spaced/unspaced Korean matcher and
 * the write-intent vocabulary are pinned by unit tests in
 * packages/tools/test/tool-exposure-policy.test.ts — a tool usually has several
 * keywords, so removing either mechanism still leaves these rows green.
 */

import process from "node:process";

/** prompt → the tool that MUST be among the exposed set. */
const CASES = [
  // Korean — the language the owner actually types.
  { prompt: "제인한테 메일 보내줘", tool: "email_send" },
  { prompt: "이 메일 답장 좀 써줘", tool: "email_reply" },
  { prompt: "지금 몇 시야?", tool: "time_now" },
  { prompt: "이번주 뭐 있어?", tool: "week_agenda" },
  { prompt: "다음주 일정 알려줘", tool: "week_agenda" },
  { prompt: "오늘 날씨 어때?", tool: "weather" },
  { prompt: "지안 연락처 찾아줘", tool: "find_contact" },
  { prompt: "지안 번호 010-1234-5678 저장해줘", tool: "add_contact" },
  { prompt: "런던은 지금 몇 시야?", tool: "world_time" },
  { prompt: "내가 최근에 뭐 했지?", tool: "recent_actions" },
  { prompt: "작년 오늘 무슨 노트 썼지?", tool: "on_this_day_notes" },
  { prompt: "이번주 생일인 사람 있어?", tool: "upcoming_birthdays" },

  // English — the same capabilities must not regress.
  { prompt: "Email Jane that I am running late", tool: "email_send" },
  { prompt: "What time is it?", tool: "time_now" },
  { prompt: "What is on my calendar this week?", tool: "week_agenda" },
  { prompt: "What is the weather today?", tool: "weather" },
  { prompt: "Find Jane's contact details", tool: "find_contact" },
  { prompt: "What time is it in London?", tool: "world_time" },
];

const MAX_TOOLS = 6;

async function main() {
  const { createMuseRuntimeAssembly } = await import("../packages/autoconfigure/dist/index.js");
  const assembly = createMuseRuntimeAssembly({ env: { ...process.env } });
  const registry = assembly.toolRegistry;

  // A tool this machine has no credentials for is simply absent — reporting
  // that as an exposure defect would be a false failure, and a guard that cries
  // wolf stops being read. Skips are counted and printed, never scored as pass.
  const registered = new Set((registry.list?.() ?? []).map((t) => t.definition?.name ?? t.name));

  const failures = [];
  const skipped = [];
  for (const { prompt, tool } of CASES) {
    if (!registered.has(tool)) {
      skipped.push({ prompt, tool });
      console.log(`  SKIP ${tool.padEnd(20)} ${prompt}  [not registered in this environment]`);
      continue;
    }
    const plan = registry.planForContext({ localMode: true, maxTools: MAX_TOOLS, prompt });
    const exposed = (plan.exposed ?? plan.selected ?? plan.tools ?? []).map((t) => t.name ?? t.definition?.name);
    if (exposed.includes(tool)) {
      console.log(`  OK   ${tool.padEnd(20)} ${prompt}`);
      continue;
    }
    // Naming WHY it is missing is the difference between an actionable failure
    // and "the model just didn't pick it": blocked-as-irrelevant means the
    // keyword list is wrong, while a full slate means it lost the ranking.
    const block = (plan.blocked ?? []).find((b) => b.toolName === tool);
    const why = block ? block.code : "evicted_by_maxTools";
    failures.push({ exposed, prompt, tool, why });
    console.error(`  FAIL ${tool.padEnd(20)} ${prompt}  [${why}]  exposed: ${exposed.join(", ") || "(none)"}`);
  }

  const scored = CASES.length - skipped.length;
  console.log(`\n--- ${scored - failures.length}/${scored} scored prompts can reach their tool (${skipped.length.toString()} skipped, not counted as pass)`);
  if (failures.length > 0) {
    console.error(`verify-korean-tool-exposure FAILED — ${failures.length.toString()} prompt(s) cannot reach their tool`);
    process.exit(1);
  }
  console.log("verify-korean-tool-exposure PASSED");
}

await main();
