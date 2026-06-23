/**
 * Deterministic pre-call gate for tool execution.
 *
 * Lifecycle hooks (`beforeTool`) are fire-and-forget OBSERVERS — their
 * return value is swallowed so a hook can never block the loop. That
 * leaves no seam for a POLICY to deny a tool call before it runs (a
 * restricted sub-agent's tool allowlist, an environment that forbids a
 * destructive tool). This is that seam: a chain of synchronous,
 * deterministic predicates the runtime consults right before executing
 * each tool call. A guard, not a prompt instruction (architecture.md).
 *
 * Block-only by design: a middleware may VETO a call (with a reason the
 * model sees as the tool result) but not silently rewrite its
 * arguments — arg rewriting would desync the dedup signature and the
 * conflicting-write guard, and a silent mutation of what the model
 * asked for is its own hazard. An empty chain is a no-op: tool
 * execution is byte-identical when no middleware is registered.
 */

import type { ModelToolCall } from "@muse/model";

export type ToolCallMiddlewareDecision =
  | { readonly action: "allow" }
  | { readonly action: "block"; readonly reason: string };

export type ToolCallMiddleware = (toolCall: ModelToolCall) => ToolCallMiddlewareDecision;

/**
 * Run the middleware chain in order; the FIRST block wins and
 * short-circuits. Returns the block reason, or `null` when every
 * middleware allows (or the chain is empty).
 */
export function applyToolCallMiddleware(
  toolCall: ModelToolCall,
  middleware: readonly ToolCallMiddleware[]
): string | null {
  for (const mw of middleware) {
    const decision = mw(toolCall);
    if (decision.action === "block") {
      const reason = decision.reason.trim();
      return reason.length > 0 ? reason : "tool call blocked by policy";
    }
  }
  return null;
}
