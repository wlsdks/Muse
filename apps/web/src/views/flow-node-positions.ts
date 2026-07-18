/**
 * Per-flow node-position persistence for the Builder canvas. Positions are
 * ephemeral UI state (never sent to the server — the flow's semantics live
 * in the job), but a layout the user dragged into shape should survive a
 * reload, otherwise dragging is busywork. Storage-injected + fail-safe so
 * the contract is unit-testable and a corrupt entry can never break the
 * canvas (worst case: default layout).
 */

export interface NodePosition {
  readonly x: number;
  readonly y: number;
}

export type NodePositionMap = Readonly<Record<string, NodePosition>>;

const KEY_PREFIX = "muse.flowNodePositions.";

export function readNodePositions(storage: Pick<Storage, "getItem"> | undefined, flowId: string): NodePositionMap {
  try {
    const raw = storage?.getItem(KEY_PREFIX + flowId);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const result: Record<string, NodePosition> = {};
    for (const [nodeId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (
        value !== null && typeof value === "object" && !Array.isArray(value)
        && Number.isFinite((value as { x?: unknown }).x) && Number.isFinite((value as { y?: unknown }).y)
      ) {
        result[nodeId] = { x: (value as { x: number }).x, y: (value as { y: number }).y };
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function writeNodePosition(
  storage: (Pick<Storage, "getItem"> & Pick<Storage, "setItem">) | undefined,
  flowId: string,
  nodeId: string,
  position: NodePosition
): void {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    return;
  }
  try {
    const current = readNodePositions(storage, flowId);
    storage?.setItem(KEY_PREFIX + flowId, JSON.stringify({ ...current, [nodeId]: position }));
  } catch {
    /* storage unavailable/full — layout stays session-only */
  }
}
