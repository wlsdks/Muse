/**
 * Privacy-tiered cloud routing for `muse chat` — extracted verbatim from
 * `chat-repl.ts` (behavior-preserving decomposition: same exports, same
 * bodies, only the file boundary moved). This cluster answers ONE question —
 * "should THIS turn go to a cloud model, and if so, with what request" — and
 * is the enforcement point for the structural no-leak guarantee
 * `buildCloudTurnRequest` documents below. `chat-repl.ts` re-exports these so
 * every existing importer (`chat-ink-run.ts`, the privacy-routing tests)
 * keeps working unchanged.
 */

import { createModelProviderFor, resolveAnswerTemperature } from "@muse/autoconfigure";
import type { ModelProvider, ModelRequest, ModelResponse } from "@muse/model";
import { findPii, resolvePrivacyRoutedModel, type PrivacyRoutedModelResult } from "@muse/policy";

import { formatCurrentContextLine } from "@muse/recall";

/** Keep only the named keys from a fact map (preserving values). */
export function filterFactsToKeys(facts: Readonly<Record<string, string>>, keys: readonly string[]): Record<string, string> {
  const allow = new Set(keys);
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(facts)) {
    if (allow.has(key)) {
      filtered[key] = value;
    }
  }
  return filtered;
}

/**
 * Whether THIS turn's local payload counts as "personal context" for
 * privacy-tiered routing (`resolvePrivacyRoutedModel`): a persona block was
 * built (durable memory facts injected) or grounding retrieval actually
 * matched something in the user's notes/episodes. Conversation history is
 * deliberately NOT folded in here — `buildCloudTurnRequest` below never
 * forwards `priorHistory` to a cloud-routed request regardless of its
 * content, so there is nothing about history to classify.
 */
export function chatHasPersonalContext(userMemoryBlock: string, groundingBlock: string): boolean {
  return userMemoryBlock.length > 0 || groundingBlock.length > 0;
}

/**
 * Resolve THIS chat turn's privacy route — wraps `resolvePrivacyRoutedModel`
 * with the exact local/cloud signal `runLocalChat` computes: persona/
 * grounding presence, a PII hit in the raw message (`findPii`), and whether
 * the message references a remembered fact BY VALUE (a contact's name, not
 * just its key — `matchedMemoryValue` inside the policy needs values).
 */
export function resolveChatRouting(args: {
  readonly message: string;
  readonly userMemoryBlock: string;
  readonly groundingBlock: string;
  readonly memoryFacts?: Readonly<Record<string, string>>;
  readonly defaultModel: string;
  readonly env: Readonly<Record<string, string | undefined>>;
}): PrivacyRoutedModelResult {
  return resolvePrivacyRoutedModel({
    defaultModel: args.defaultModel,
    env: args.env,
    hasPersonalContext: chatHasPersonalContext(args.userMemoryBlock, args.groundingBlock),
    memoryValues: args.memoryFacts ? Object.values(args.memoryFacts) : undefined,
    piiDetected: findPii(args.message).length > 0,
    query: args.message
  });
}

/**
 * The model request for a CLOUD-routed turn — deliberately narrow: no
 * parameter accepts persona text, grounding evidence, or prior turns, so it
 * is structurally impossible for this function to forward them. Only the
 * raw message plus a non-personal system line (reply-language directive +
 * the current clock/timezone, the same line every chat surface always sends
 * regardless of routing) goes out.
 */
export function buildCloudTurnRequest(
  message: string,
  model: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
  now: Date = new Date()
): ModelRequest {
  const korean = /[가-힣]/u.test(message);
  const languageDirective = korean
    ? "사용자는 한국어를 씁니다. 사용자에게 보이는 텍스트 답변만 한국어로 작성하세요."
    : "";
  const system = [languageDirective, formatCurrentContextLine(now)].filter((part) => part.length > 0).join("\n\n");
  return {
    messages: [
      { content: system, role: "system" },
      { content: message, role: "user" }
    ],
    model,
    temperature: resolveAnswerTemperature(env)
  };
}

/**
 * Display-only marker on a cloud-routed answer — "Muse shows its work": the
 * user can always tell a context-free reply left the device, and which model
 * answered it. Never persisted to history (matches every other display-only
 * cue `finalizeGatedChatAnswer` / the weakness nudge appends in this file).
 */
export function formatCloudRouteMarker(korean: boolean, model: string): string {
  return korean ? `\n\n☁️ 클라우드 (개인 정보 없음) — ${model}` : `\n\n☁️ cloud (context-free) — ${model}`;
}

/**
 * The privacy-tiered routing cloud leg as a reusable closure — `runLocalChat`
 * below and the interactive Ink chat (`chat-ink-run.ts`) both need "resolve
 * this turn's route, and if it's cloud, run it" as one call. ANY failure
 * (routing off/personal, no provider, throw, or an empty completion) resolves
 * to `undefined` so the caller's only job is "fall back to local" — a cloud
 * hiccup must never become a chat-facing error.
 */
export function createChatCloudTurn(args: {
  readonly defaultModel: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly memoryFacts: () => Readonly<Record<string, string>> | undefined;
  readonly cloudProviderFactory?: (model: string, env: Readonly<Record<string, string | undefined>>) => ModelProvider | undefined;
}): (message: string, userMemoryBlock: string, groundingBlock: string) => Promise<{ readonly response: ModelResponse; readonly model: string; readonly marker: string } | undefined> {
  const cloudProviderFactory = args.cloudProviderFactory ?? createModelProviderFor;
  return async (message, userMemoryBlock, groundingBlock) => {
    const routing = resolveChatRouting({
      defaultModel: args.defaultModel,
      env: args.env,
      groundingBlock,
      memoryFacts: args.memoryFacts(),
      message,
      userMemoryBlock
    });
    if (routing.route !== "cloud") return undefined;
    try {
      const cloudProvider = cloudProviderFactory(routing.model, args.env);
      if (!cloudProvider) return undefined;
      const response = await cloudProvider.generate(buildCloudTurnRequest(message, routing.model, args.env));
      if (response.output.trim().length === 0) return undefined;
      return { marker: formatCloudRouteMarker(/[가-힣]/u.test(message), routing.model), model: routing.model, response };
    } catch {
      return undefined;
    }
  };
}
