import type { ToolApprovalGate } from "@muse/agent-core";
import { summarizeToolDraft } from "@muse/messaging";

/**
 * A write/execute tool the direct `/api/chat` surface tried to run and the
 * gate captured for draft-first approval. Held in-memory for one run; the
 * caller persists it to the pending-approval store AFTER the run resolves, so
 * a run the model abandons never leaves a stray pending item on disk.
 */
export interface ChatPendingDraft {
  readonly tool: string;
  readonly risk: "write" | "execute";
  readonly draft: string;
  readonly arguments: Record<string, unknown>;
  readonly userId?: string;
}

/**
 * A pending write the run PERSISTED, carrying the `id` a later
 * `POST /api/chat/approvals/:id/approve` needs. Surfaced on the chat response so
 * the client can render a confirm affordance — the text notice alone has no id.
 */
export interface PersistedApproval {
  readonly id: string;
  readonly tool: string;
  readonly draft: string;
}

/**
 * The code-appended notice listing the write/execute actions Muse captured but
 * did NOT run — one line each. Appended AFTER the grounding/honest-action gates
 * (it is code text, not model output) so it can never be dropped as fabricated.
 */
export function formatApprovalNotice(drafts: readonly ChatPendingDraft[]): string {
  const lines = drafts.map((draft) => `- ${draft.tool}${draft.draft ? `: ${draft.draft}` : ""}`).join("\n");
  return `\n\n🔒 These actions need your approval before I run them:\n${lines}`;
}

/**
 * Draft-first approval gate for the direct `/api/chat` write path
 * (outbound-safety.md). Read tools pass; a write/execute tool is NEVER
 * executed — its draft is captured on `sink` and the gate denies this turn.
 * Unlike the channel gate it sends nothing anywhere: capture-only, so the
 * caller decides what to persist and surface after the run.
 */
export function createChatApprovalGate(sink: ChatPendingDraft[]): ToolApprovalGate {
  return ({ toolCall, risk, userId, egressWarning, egressBlocked }) => {
    // Before the read fast-path so `risk` narrows to write/execute below, and
    // so a model-composed URL is denied regardless of the tool's risk class.
    if (egressBlocked) {
      return {
        allowed: false,
        reason: `egress denied: ${egressWarning ?? "URL was not observed anywhere this run"}`
      };
    }
    if (risk === "read") {
      return { allowed: true };
    }
    const draft = summarizeToolDraft(toolCall.name, toolCall.arguments);
    sink.push({
      arguments: toolCall.arguments ?? {},
      draft,
      risk,
      tool: toolCall.name,
      ...(userId ? { userId } : {})
    });
    return {
      allowed: false,
      reason: `awaiting your approval for "${toolCall.name}"${draft ? ` — ${draft}` : ""}`
    };
  };
}
