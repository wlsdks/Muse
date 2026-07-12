/**
 * Pure route-inference helper for channel-sim.mjs. Classifies which branch
 * of the REAL `createInboundAgentRun` gate chain (apps/api/src/
 * inbound-agent-run.ts) a turn most likely took, from OBSERVABLE behavior
 * only — which replies the capturing registry actually saw sent, in what
 * order, plus the deterministic classifiers channel-sim.mjs already calls
 * on the raw user text. Never re-implements or reaches into the gate's own
 * internal state — this is inference from the outside, same as an external
 * persona-driving agent would have to do. Kept dependency-free so it is
 * trivially unit-testable (see channel-sim-route.test.mjs).
 */

/**
 * Mirrors the private `UNPAIRED_CHAT_NOTICE` constant in
 * apps/api/src/inbound-agent-run.ts — not exported, so this is the driver's
 * own best-effort copy for classification purposes only. If that literal
 * ever changes, an unpaired turn falls through to "run" here instead of
 * "unpaired" — a labeling-only regression, never a behavioral one (the
 * production gate itself is untouched).
 */
export const UNPAIRED_NOTICE =
  "This bot is a private personal assistant and only talks to its paired owner.";

/**
 * @param {object} input
 * @param {readonly {text: string, kind: "ack" | "final", atMs: number}[]} input.replies
 * @param {boolean} input.casualMatch - true when the final reply byte-matches `casualResponseFor` for `classifyCasualPrompt`'s verdict on the user's text.
 * @param {boolean} input.channelIntentIsChat - `classifyChannelIntent(text) === "chat"`.
 * @param {boolean} input.isVeto - `isVetoUtterance(text)`.
 * @param {boolean} input.isApproval - `isApprovalReply(text)`.
 * @returns {string}
 */
export function classifyRoute({ replies, casualMatch, channelIntentIsChat, isVeto, isApproval }) {
  const final = replies.find((reply) => reply.kind === "final");
  const ack = replies.find((reply) => reply.kind === "ack");

  if (replies.length === 0) {
    return "silent";
  }
  if (final?.text === UNPAIRED_NOTICE) {
    return "unpaired";
  }
  if (isApproval && final && (final.text.includes("muse approvals") || final.text.includes("pending approval"))) {
    return "approval-ack";
  }
  if (isVeto && final?.text.includes("muse proactive keep")) {
    return "veto";
  }
  if (casualMatch) {
    return "casual";
  }
  if (ack && final) {
    return "ack+run";
  }
  if (ack && !final) {
    return "ack-only-silent";
  }
  if (final && channelIntentIsChat) {
    return "chat";
  }
  if (final) {
    return "run";
  }
  return "unknown";
}
