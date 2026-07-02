/**
 * Per-turn grounding for the conversational surface (`muse chat`) — the public
 * surface. This module is a thin re-export hub; the implementation lives in
 * cohesive siblings so every existing `./chat-grounding.js` import keeps
 * resolving:
 *
 *   - `chat-grounding-evidence`   — retrieval + assembly: the embedder-specific
 *     score floors, the authoritative grounding block, the stale-index refresh,
 *     contextual query rewrite, and `retrieveChatGrounding` / `conversationMatches`.
 *   - `chat-grounding-verdict`    — the deterministic anti-fabrication gate
 *     (`gateChatAnswer` family), the personal-fact-recall detector, abstention
 *     helpers, and the misgrounding / weakness-axis / trace-outcome analysis.
 *   - `chat-grounding-notices`    — the grounded≠true display cues: semantic
 *     value-conflict, citation precision/recall, and untrusted-only source-check.
 *   - `chat-grounding-finalize`   — the shared post-stream pipeline
 *     (`finalizeGatedChatAnswer`), citation strips, and the source receipt.
 *   - `chat-grounding-value-gate` — the always-on unsupported-value guards
 *     (number / email / IP / identifier / URL / date), re-exported below.
 */

export {
  answerAssertsUnsupportedDate,
  answerAssertsUnsupportedEmail,
  answerAssertsUnsupportedIdentifier,
  answerAssertsUnsupportedIpAddress,
  answerAssertsUnsupportedNumber,
  answerAssertsUnsupportedUrl
} from "./chat-grounding-value-gate.js";

export {
  CHAT_GROUNDING_MAX_HITS,
  CHAT_GROUNDING_MIN_SCORE,
  buildQueryRewritePrompt,
  chatAutoReindexEnabled,
  type ChatGrounding,
  conversationMatches,
  formatChatGroundingBlock,
  groundChatTurn,
  needsContextualRewrite,
  notesIndexNeedsModelMigration,
  parseQueryRewrite,
  pickReindexModel,
  QUERY_REWRITE_RESPONSE_FORMAT,
  QUERY_REWRITE_SYSTEM_PROMPT,
  type RefreshStaleNotesIndexDeps,
  refreshStaleNotesIndexForChat,
  resolveGroundingMinScore,
  retrieveChatGrounding,
  shortCitationRef
} from "./chat-grounding-evidence.js";

export {
  chatAbstention,
  chatMisgroundingFraction,
  chatTraceOutcome,
  chatWeaknessAxis,
  type ChatWeaknessAxis,
  expressesNoInformation,
  factKeysToInject,
  gateChatAnswer,
  gateChatAnswerWithReverify,
  isChatAbstention,
  isChatGroundedSuccess,
  isPersonalFactRecall
} from "./chat-grounding-verdict.js";

export {
  chatCitationPrecisionNotice,
  chatCitationRecallNotice,
  defaultChatConflictEmbedder,
  untrustedOnlyChatNotice
} from "./chat-grounding-notices.js";

export {
  type FinalizedChatAnswer,
  type FinalizeGatedChatAnswerArgs,
  finalizeGatedChatAnswer,
  groundedNoteSources,
  stripChatAnswerArtifacts,
  stripFabricatedCitations,
  stripTruncatedCitation,
  withGroundingReceipt
} from "./chat-grounding-finalize.js";
