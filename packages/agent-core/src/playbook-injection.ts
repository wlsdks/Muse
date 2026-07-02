import { renderPlaybookSection, sanitizeInline } from "./playbook-model.js";
import type { PlaybookProvider, PlaybookStrategy } from "./playbook-model.js";
import { rankPlaybookStrategies } from "./playbook-ranking.js";
import { appendSystemSection, metadataString } from "./runtime-helpers.js";
import type { AgentRunContext, AgentRunInput } from "./types.js";

function latestUserText(messages: readonly { readonly role: string; readonly content: string }[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && message.role === "user" && typeof message.content === "string") {
      return message.content;
    }
  }
  return "";
}

/**
 * Inject the user's learned strategies as a `[Learned Strategies]` system
 * block so the agent applies what past corrections taught (ACE's evolving
 * playbook). Conservative + opt-out-safe: no provider, no `metadata.userId`,
 * or zero strategies ⇒ input returned unchanged (smoke:live unaffected).
 * Fail-open: a throwing provider degrades to no-op.
 */
export async function applyPlaybook(
  context: AgentRunContext,
  provider: PlaybookProvider | undefined
): Promise<AgentRunInput> {
  if (!provider) {
    return context.input;
  }
  const userId = metadataString(context.input.metadata, "userId");
  if (!userId) {
    return context.input;
  }
  let strategies: readonly PlaybookStrategy[];
  try {
    strategies = await provider.listStrategies(userId);
  } catch {
    return context.input;
  }
  // ReasoningBank (arXiv 2509.25140): inject only the strategies relevant to
  // this turn, ranked by the latest user message — not the whole bank.
  // D-UCB (arXiv:0805.3415): pass nowMs so stale reinforcements fade.
  const ranked = rankPlaybookStrategies(strategies, latestUserText(context.input.messages), undefined, Date.now());
  const rendered = renderPlaybookSection(ranked);
  if (!rendered) {
    return context.input;
  }
  // Record WHICH strategies made the rendered block (same non-empty-text filter
  // as renderPlaybookSection) so session-end reinforcement credit targets an
  // actually-injected strategy. Entries without a store id are unrecordable.
  const injectedIds = ranked
    .filter((s) => sanitizeInline(s.text).length > 0)
    .map((s) => s.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  return {
    ...context.input,
    messages: appendSystemSection(context.input.messages, rendered, "playbook"),
    metadata: {
      ...context.input.metadata,
      playbookApplied: true,
      ...(injectedIds.length > 0 ? { playbookInjectedIds: injectedIds } : {})
    }
  };
}

/**
 * The `playbookInjectedIds` recorded by {@link applyPlaybook}, or `undefined`
 * when absent/malformed. Non-string members are dropped, never coerced.
 */
export function playbookInjectedIdsFromMetadata(metadata: Record<string, unknown> | undefined): readonly string[] | undefined {
  const raw = metadata?.playbookInjectedIds;
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const ids = raw.filter((id): id is string => typeof id === "string" && id.length > 0);
  return ids.length > 0 ? ids : undefined;
}
