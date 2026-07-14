/**
 * Rule-vs-rule conflict detection for the behavioural-rule budget
 * (behavioural-rule-budget.ts). Runs ONLY at LEARN time (when a strategy is
 * distilled/recorded), never per-turn — O(n) model calls once, versus O(n^2)
 * pairwise calls if this ran in the hot path on every ask.
 *
 * Embedding cosine cannot carry this decision — measured on the real embedder
 * (nomic-embed-text-v2-moe): contradictory pairs scored 0.190-0.748 (mean
 * 0.471), compatible pairs scored 0.152-0.378 (mean 0.243). The ranges
 * overlap and a genuine contradiction ("use bullet points" vs "write in
 * flowing prose, no lists" = 0.190) can score LOWER than a compatible pair
 * ("lead with the answer" vs "be concise" = 0.378) — no threshold separates
 * them, because cosine measures TOPIC, not AGREEMENT (the same lesson that
 * has now bitten this repo three times; see the cosine-prior audit).
 *
 * A binary LLM classifier DOES work — measured pass^3 = 10/10 on gemma4:12b,
 * temperature 0, 4 output tokens: 5/5 contradictions caught, 5/5 compatible
 * pairs left alone, stable on every case. Same shape as the existing
 * `selectCreditTargetLlm` (correction-distiller.ts): one short binary
 * question, fail-soft on any error or unparsable reply.
 */

import type { ModelMessage } from "@muse/model";
import { redactSecretsInText } from "@muse/shared";

const RULE_CONFLICT_SYSTEM_PROMPT =
  `You compare two standing instructions a user gave an assistant.
Answer CONFLICT if following one would mean disobeying the other.
Answer OK if both can be followed at the same time.
Different topics are always OK. Reply with exactly one word: CONFLICT or OK.`;

export interface ClassifyRuleConflictOptions {
  readonly model: string;
  readonly modelProvider: { generate(request: { messages: readonly ModelMessage[]; model: string; maxOutputTokens?: number; temperature?: number }): Promise<{ output?: string }> };
  readonly redact?: (text: string) => string;
}

/**
 * Binary conflict classifier for one rule pair. Returns `true` (CONFLICT),
 * `false` (OK), or `undefined` on any model error / empty input / unparsable
 * reply — fail-soft, so a broken classifier never suppresses a rule on a guess.
 */
export async function classifyRuleConflict(
  a: string,
  b: string,
  options: ClassifyRuleConflictOptions
): Promise<boolean | undefined> {
  if (a.trim().length === 0 || b.trim().length === 0) {
    return undefined;
  }
  const redact = options.redact ?? redactSecretsInText;
  const messages: readonly ModelMessage[] = [
    { content: RULE_CONFLICT_SYSTEM_PROMPT, role: "system" },
    { content: `A: ${redact(a)}\nB: ${redact(b)}`, role: "user" }
  ];
  let output: string;
  try {
    const response = await options.modelProvider.generate({ maxOutputTokens: 4, messages, model: options.model, temperature: 0 });
    output = (response.output ?? "").trim().toUpperCase();
  } catch {
    return undefined;
  }
  if (output.includes("CONFLICT")) {
    return true;
  }
  if (output.includes("OK")) {
    return false;
  }
  return undefined;
}

/**
 * Find which EXISTING injectable rules a freshly-distilled strategy conflicts
 * with. O(n) — one classification per existing rule, run ONCE at learn time.
 * A per-pair classifier failure (model down, unparsable reply) skips just that
 * pair; it never aborts the rest and never records a conflict on a guess.
 */
export async function findConflictingRuleIds(
  newRuleText: string,
  existing: readonly { readonly id: string; readonly text: string }[],
  options: ClassifyRuleConflictOptions
): Promise<readonly string[]> {
  const conflicts: string[] = [];
  for (const candidate of existing) {
    const verdict = await classifyRuleConflict(newRuleText, candidate.text, options);
    if (verdict === true) {
      conflicts.push(candidate.id);
    }
  }
  return conflicts;
}
