/**
 * Re-export hub for @muse/prompts. Nothing but re-exports lives here:
 * the builder core is `system-prompt.ts` (a leaf), surface composition
 * is `compose.ts`, and the prompts that CALL a composer are
 * `surface-prompts.ts`. Keeping the barrel logic-free is what stops
 * `compose.ts` — which depends on the builders — from importing back
 * through it and re-forming the runtime import cycle this layout removed.
 */

export * from "./exemplar-retriever.js";
export * from "./system-prompt.js";

export { composeIdentityPrompt, MUSE_IDENTITY_CORE, MUSE_IDENTITY_LEAD } from "./identity-core.js";
export {
  describeCapabilities,
  describeCapabilitiesEn,
  describeCapabilitiesKo,
  type CapabilityEnv
} from "./capability-describer.js";
export {
  composeSurfacePrompt,
  composeSurfacePromptSegments,
  COMPANION_PERSONA_TEXT,
  SURFACE_ROLES,
  TAGLINE_PERSONA_TEXT,
  type ComposedPromptSegment,
  type ComposedPromptSegmentLayer,
  type ComposeSurfaceContext,
  type MuseSurface
} from "./compose.js";
export {
  buildPlanningSystemPrompt,
  buildTodayBriefUserMessage,
  TODAY_BRIEF_SYSTEM_PROMPT,
  type PlanningPromptInput
} from "./surface-prompts.js";
