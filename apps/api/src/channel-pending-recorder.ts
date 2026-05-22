import { randomUUID } from "node:crypto";

import {
  recordPendingApproval as defaultRecordPendingApproval,
  type ChannelApprovalRefusal,
  type PendingApproval
} from "@muse/messaging";

const DEFAULT_PENDING_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Bridges the channel-approval gate's `recordRefusal` hook to the
 * pending-approval store: a risky tool an inbound channel message tried
 * to trigger (and the gate refused) is persisted as a live, expiring
 * worklist item carrying the structured `tool` + `arguments` needed to
 * re-run it once approved. Parallel to `createChannelRefusalRecorder`
 * (which writes the immutable audit log); both run on a refusal.
 */
export function createChannelPendingRecorder(deps: {
  readonly pendingFile: string;
  readonly providerId: string;
  readonly source: string;
  readonly ttlMs?: number;
  readonly recordPendingApproval?: (file: string, entry: PendingApproval) => Promise<void>;
  readonly now?: () => Date;
}): (refusal: ChannelApprovalRefusal) => Promise<void> {
  const record = deps.recordPendingApproval ?? defaultRecordPendingApproval;
  const now = deps.now ?? (() => new Date());
  const ttlMs = deps.ttlMs !== undefined && Number.isFinite(deps.ttlMs) && deps.ttlMs > 0
    ? deps.ttlMs
    : DEFAULT_PENDING_TTL_MS;
  return async (refusal) => {
    const at = now();
    await record(deps.pendingFile, {
      arguments: refusal.arguments,
      createdAt: at.toISOString(),
      draft: refusal.draft,
      expiresAt: new Date(at.getTime() + ttlMs).toISOString(),
      id: randomUUID(),
      providerId: deps.providerId,
      risk: refusal.risk,
      source: deps.source,
      tool: refusal.tool,
      ...(refusal.userId ? { userId: refusal.userId } : {})
    });
  };
}
