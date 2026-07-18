import { createHash } from "node:crypto";

import type {
  AttunementState,
  ContinuityInteractionAnchor,
  ContinuityInteractionReceipt,
  ContinuityOutcome
} from "./types.js";

export interface ContinuityTaskInteractionSource {
  readonly artifactId: string;
  readonly createdAt: string;
  readonly status: "open" | "done";
  readonly updatedAt: string;
}

export type ContinuityTaskInteractionSourceResolver = (
  artifactId: string
) => Promise<ContinuityTaskInteractionSource | undefined>;

export interface ContinuityInteractionProjectionItem {
  readonly deliveryId: string;
  readonly explicitOutcome?: ContinuityOutcome;
  readonly interaction: {
    readonly receipt?: ContinuityInteractionReceipt;
    readonly reason?: string;
    readonly state: "exact" | "none" | "unavailable";
  };
  readonly openedAt: string;
  readonly runId?: string;
  readonly threadId: string;
}

export function fingerprintContinuityTaskState(input: {
  readonly artifactId: string;
  readonly status: "open" | "done";
  readonly updatedAt: string;
}): string {
  return createHash("sha256").update(JSON.stringify({
    artifactId: input.artifactId,
    status: input.status,
    updatedAt: input.updatedAt
  })).digest("hex");
}

/** Read-only projection. Explicit outcomes and factual interactions never collapse into one signal. */
export async function buildContinuityInteractionProjection(
  state: AttunementState,
  resolveCurrentTask: ContinuityTaskInteractionSourceResolver
): Promise<readonly ContinuityInteractionProjectionItem[]> {
  const receipts = new Map(state.interactionReceipts.map((receipt) => [receipt.deliveryId, receipt]));
  return Promise.all(state.deliveries
    .slice()
    .sort((left, right) => right.openedAt.localeCompare(left.openedAt) || left.id.localeCompare(right.id))
    .map(async (delivery): Promise<ContinuityInteractionProjectionItem> => {
      const base = {
        deliveryId: delivery.id,
        ...(delivery.outcome ? { explicitOutcome: delivery.outcome.outcome } : {}),
        openedAt: delivery.openedAt,
        ...(delivery.runId ? { runId: delivery.runId } : {}),
        threadId: delivery.threadId
      };
      const receipt = receipts.get(delivery.id);
      if (receipt) return { ...base, interaction: { receipt, state: "exact" } };
      const anchor = delivery.interactionAnchor;
      if (!anchor || !delivery.runId) {
        return { ...base, interaction: { reason: "delivery has no interaction anchor or run id", state: "unavailable" } };
      }
      const thread = state.threads.find((entry) => entry.id === delivery.threadId);
      const link = thread?.links.find((entry) => exactAnchorLink(entry, anchor));
      if (!link) {
        return { ...base, interaction: { reason: "exact user-authored local next-step link is unavailable", state: "unavailable" } };
      }
      try {
        const current = await resolveCurrentTask(anchor.artifactId);
        if (!current || current.artifactId !== anchor.artifactId) {
          return { ...base, interaction: { reason: "exact local task is unavailable", state: "unavailable" } };
        }
        const expectedOpenStateFingerprint = fingerprintContinuityTaskState({
          artifactId: current.artifactId,
          status: "open",
          updatedAt: current.createdAt
        });
        if (expectedOpenStateFingerprint !== anchor.openStateFingerprint) {
          return { ...base, interaction: { reason: "exact local task identity no longer matches the delivery anchor", state: "unavailable" } };
        }
        return { ...base, interaction: { state: "none" } };
      } catch {
        return { ...base, interaction: { reason: "exact local task cannot be read or validated", state: "unavailable" } };
      }
    }));
}

function exactAnchorLink(
  link: AttunementState["threads"][number]["links"][number],
  anchor: ContinuityInteractionAnchor
): boolean {
  return link.artifactId === anchor.artifactId
    && link.artifactType === "task"
    && link.linkedAt === anchor.linkedAt
    && link.linkedBy === "user"
    && link.providerId === "local"
    && link.role === "next-step";
}
