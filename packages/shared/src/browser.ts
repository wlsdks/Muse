/** Browser-safe shared utilities. This entry point must stay free of Node-only imports. */
export { errorMessage } from "./error-utils.js";
export {
  isRecord,
  parseJson,
  parseJsonWith,
  type JsonObject,
  type JsonPredicate,
  type JsonPrimitive,
  type JsonValue
} from "./json-utils.js";
export { parseStrictJson, StrictJsonError, type StrictJsonOptions } from "./strict-json.js";
export {
  CANONICAL_RUN_OUTCOMES,
  canonicalRunOutcome,
  decodeLocalRunReference,
  encodeLocalRunReference,
  isCanonicalLocalRunId,
  isCanonicalWorkspaceRealpath,
  type CanonicalRunOutcome,
  type LocalRunReference
} from "./local-run-reference.js";
export {
  decodeLocalCheckpointReference,
  encodeLocalCheckpointReference,
  isCanonicalCheckpointStep,
  type LocalCheckpointReference
} from "./local-checkpoint-reference.js";
export {
  ATTUNEMENT_OUTCOME_FRESHNESS_MS,
  RUN_GROUNDING_FRESHNESS_MS,
  admitDecisionMetric,
  type DecisionMetric,
  type DecisionMetricActionId,
  type DecisionMetricAdmission,
  type DecisionMetricClaim,
  type DecisionMetricEvidenceClass,
  type DecisionMetricExclusionReason,
  type DecisionMetricFreshnessStatus,
  type DecisionMetricInput,
  type DecisionMetricSource,
  type DecisionMetricUnit
} from "./decision-metric.js";
