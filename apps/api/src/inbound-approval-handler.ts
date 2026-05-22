import { clearPendingApproval, isApprovalReply, listPendingApprovals, type PendingApproval } from "@muse/messaging";

/**
 * Handle an inbound channel message that reads as a bare approval
 * ("yes") of a pending refusal. Returns the reply string when handled,
 * or `undefined` to fall through to the normal agent run (not an
 * approval, or nothing pending for this channel).
 *
 * Two modes:
 *   - DEFAULT (no `autoRun`): a deterministic ack pointing at the
 *     working CLI completion (`muse approvals approve <id>`). Safe — the
 *     send still requires the deliberate CLI confirm.
 *   - OPT-IN (`autoRun` supplied, i.e. MUSE_INBOUND_AUTO_APPROVE on):
 *     when EXACTLY ONE un-expired approval is pending, re-run it in-chat
 *     (the reply is the explicit confirm of the already-shown draft —
 *     outbound-safety draft-first), clearing it on success
 *     (replay-guard). Multiple pending is ambiguous → fall back to the
 *     ack-by-id list rather than guess which "yes" meant.
 */
export async function handleInboundApprovalReply(opts: {
  readonly text: string;
  readonly providerId: string;
  readonly source: string;
  readonly pendingFile: string;
  readonly now?: () => Date;
  readonly listPending?: (
    file: string,
    now?: () => Date,
    scope?: { readonly providerId: string; readonly source: string }
  ) => Promise<readonly PendingApproval[]>;
  readonly autoRun?: (entry: PendingApproval) => Promise<{ readonly ran: boolean; readonly detail?: string }>;
  readonly clearPending?: (file: string, id: string, now?: () => Date) => Promise<boolean>;
}): Promise<string | undefined> {
  if (!isApprovalReply(opts.text)) {
    return undefined;
  }
  const list = opts.listPending ?? listPendingApprovals;
  const pending = await list(opts.pendingFile, opts.now, { providerId: opts.providerId, source: opts.source });
  if (pending.length === 0) {
    return undefined;
  }

  if (opts.autoRun && pending.length === 1) {
    const entry = pending[0]!;
    const outcome = await opts.autoRun(entry);
    if (outcome.ran) {
      await (opts.clearPending ?? clearPendingApproval)(opts.pendingFile, entry.id, opts.now);
      return `Done — ran ${entry.tool} (${entry.draft}).`;
    }
    return (
      `Couldn't run ${entry.tool}${outcome.detail ? `: ${outcome.detail}` : ""}. It's still pending — `
      + `approve from your machine with \`muse approvals approve ${entry.id}\`.`
    );
  }

  if (pending.length > 1) {
    return (
      `You have ${pending.length.toString()} pending approvals — approve one by id: `
      + `${pending.map((e) => `\`muse approvals approve ${e.id}\` (${e.tool})`).join(", ")}.`
    );
  }

  const latest = pending[0]!;
  return (
    `Got it — "${latest.tool}: ${latest.draft}" is awaiting your approval. `
    + `Approve it with \`muse approvals approve ${latest.id}\`, or \`muse approvals clear ${latest.id}\` to dismiss.`
  );
}
