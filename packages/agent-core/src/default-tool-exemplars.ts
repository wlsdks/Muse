import { RUN_TOOL_PLAN_EXEMPLAR_BANK } from "./tool-plan-exemplars.js";
import type { ToolExemplar } from "./tool-exemplars.js";

/**
 * Default few-shot bank used by production tool-selection turns.
 *
 * The established PTC exemplars remain the prefix so callers importing
 * `RUN_TOOL_PLAN_EXEMPLAR_BANK` keep their exact contract. The adjacent pairs
 * below teach two repeatedly measured confusable boundaries. They are
 * canonical paraphrases rather than copies of eval prompts so a passing eval
 * still measures generalisation instead of literal prompt recall.
 */
export const DEFAULT_TOOL_EXEMPLAR_BANK: readonly ToolExemplar[] = [
  ...RUN_TOOL_PLAN_EXEMPLAR_BANK,
  { prompt: "열린 페이지에 있는 차트가 무엇을 보여주는지 알려줘", tool: "browser_look" },
  { prompt: "현재 페이지 본문 텍스트만 읽어줘", tool: "browser_read" },
  { prompt: "Someday I might add Alex to Contacts, but I am only thinking about it", tool: null },
  { prompt: "Find the phone or email for existing contact Alex in Contacts", tool: "mac_app_read" }
];
