import { createHmac, timingSafeEqual } from "node:crypto";
import type { AgentRunContext, HookStage } from "@muse/agent-core";
import type { ModelMessage, ModelResponse } from "@muse/model";
import type {
  CostAnomaly,
  CostAnomalyDetector,
  DriftAnomaly,
  FollowupSuggestionStore,
  MonthlyBudgetStatus,
  MonthlyBudgetTracker,
  PromptDriftDetector,
  SloAlertEvaluator,
  SloViolation
} from "@muse/observability";
import type {
  ChannelFaqRegistrationTable,
  MuseDatabase,
  SlackBotInstanceTable,
  SlackFeedbackEventTable,
  SlackResponseTrackingTable
} from "@muse/db";
import { type JsonObject, type JsonValue } from "@muse/shared";
import type { Insertable, Kysely, Selectable } from "kysely";

export type Awaitable<T> = T | Promise<T>;
export type IntegrationEventType = "before_start" | "after_complete" | "on_error" | "before_tool" | "after_tool";

export interface CommandEnvelope {
  readonly id: string;
  readonly source: string;
  readonly command: string;
  readonly text: string;
  readonly userId?: string;
  readonly channelId?: string;
  readonly workspaceId?: string;
  readonly responseUrl?: string;
  readonly metadata: JsonObject;
  readonly receivedAt: Date;
}

export interface CommandResponse {
  readonly text: string;
  readonly visibility?: "ephemeral" | "public";
  readonly metadata?: JsonObject;
}

export interface CommandHandler {
  handle(command: CommandEnvelope): Awaitable<CommandResponse>;
}

export interface SlackSlashCommandPayload {
  readonly command?: string;
  readonly text?: string;
  readonly user_id?: string;
  readonly channel_id?: string;
  readonly team_id?: string;
  readonly response_url?: string;
  readonly trigger_id?: string;
  readonly [key: string]: string | undefined;
}

export interface WebhookEvent {
  readonly id: string;
  readonly type: IntegrationEventType;
  readonly runId: string;
  readonly payload: JsonObject;
  readonly createdAt: Date;
}

export interface WebhookEndpoint {
  readonly id: string;
  readonly url: string;
  readonly events: readonly IntegrationEventType[];
  readonly secret?: string;
  readonly enabled: boolean;
}

export interface WebhookDelivery {
  readonly endpointId: string;
  readonly eventId: string;
  readonly status: "delivered" | "failed" | "skipped";
  readonly statusCode?: number;
  readonly error?: string;
}

export interface WebhookTransport {
  post(url: string, body: JsonObject, headers: Record<string, string>): Awaitable<{ readonly statusCode: number }>;
}

export interface WebhookNotificationDispatcher {
  dispatch(input: Omit<WebhookEvent, "createdAt" | "id"> & { readonly id?: string }): Awaitable<readonly WebhookDelivery[]>;
}

export interface WebhookNotificationHookOptions {
  readonly dispatcher: WebhookNotificationDispatcher;
  readonly id?: string;
  readonly outputPreviewLength?: number;
}

export interface ToolResponseSummary {
  readonly itemCount?: number;
  readonly outputPreview: string;
  readonly runId: string;
  readonly status: string;
  readonly toolCallId: string;
  readonly toolName: string;
}

export interface ToolResponseSummaryHookOptions {
  readonly id?: string;
  readonly onSummary: (summary: ToolResponseSummary) => Awaitable<void>;
  readonly previewLength?: number;
}

export interface RagIngestionCapturePolicy {
  readonly allowedChannels: readonly string[];
  readonly blockedPatterns: readonly string[];
  readonly enabled: boolean;
  readonly minQueryChars: number;
  readonly minResponseChars: number;
  readonly requireReview: boolean;
}

export interface RagIngestionCaptureCandidate {
  readonly channel?: string | null;
  readonly query: string;
  readonly response: string;
  readonly runId: string;
  readonly sessionId?: string | null;
  readonly status?: "PENDING" | "REJECTED" | "INGESTED";
  readonly userId: string;
}

export interface RagIngestionCaptureHookOptions {
  readonly candidateStore: {
    save(candidate: RagIngestionCaptureCandidate): Awaitable<unknown>;
  };
  readonly id?: string;
  readonly policyStore: {
    getOrNull(): Awaitable<RagIngestionCapturePolicy | undefined>;
  };
  readonly userIdFallback?: string;
}

export interface FeedbackMetadataCaptureHookOptions {
  readonly feedbackStore: {
    save(record: JsonObject): Awaitable<unknown>;
  };
  readonly id?: string;
}

export interface UserMemoryInjectionMemory {
  readonly facts: Readonly<Record<string, string>>;
  readonly preferences: Readonly<Record<string, string>>;
  readonly recentTopics?: readonly string[];
  readonly userId: string;
}

export interface UserMemoryInjectionHookOptions {
  readonly id?: string;
  readonly maxEntries?: number;
  readonly memoryStore: {
    findByUserId(userId: string): Awaitable<UserMemoryInjectionMemory | undefined>;
  };
}

export interface SlackCommandAckResponse {
  readonly response_type: "ephemeral" | "in_channel";
  readonly text: string;
}

export interface SlackSignatureVerificationResult {
  readonly ok: boolean;
  readonly reason?: string;
}

export interface SlackResponseUrlTransport {
  post(url: string, body: JsonObject): Awaitable<{ readonly statusCode: number }>;
}

export interface SlackMessagePostInput {
  readonly channelId: string;
  readonly text: string;
  readonly threadTs?: string;
}

export interface SlackMessageTransport {
  postMessage(input: SlackMessagePostInput): Awaitable<{
    readonly ok: boolean;
    readonly statusCode: number;
    readonly error?: string;
    readonly ts?: string;
  }>;
}

export interface SlackAssistantThreadStatusInput {
  readonly channelId: string;
  readonly threadTs: string;
  readonly status: string;
}

export interface SlackAssistantThreadStatusResult {
  readonly ok: boolean;
  readonly statusCode: number;
  readonly error?: string;
}

export interface SlackAssistantThreadStatusTransport {
  setStatus(input: SlackAssistantThreadStatusInput): Awaitable<SlackAssistantThreadStatusResult>;
}

export interface SlackProgressHookOptions {
  readonly transport: SlackAssistantThreadStatusTransport;
  readonly id?: string;
  readonly minUpdateIntervalMs?: number;
  readonly friendlyNames?: Readonly<Record<string, string>>;
  readonly now?: () => number;
  readonly onError?: (error: unknown) => void;
}

export interface SlackSocketModeTransport {
  send(payload: JsonObject): Awaitable<void>;
}

export interface SlackSocketModeGatewayOptions {
  readonly commandHandler: CommandHandler;
  readonly maxRememberedEnvelopeIds?: number;
  readonly now?: () => Date;
  readonly transport: SlackSocketModeTransport;
}

export interface SlackSocketModeEnvelope {
  readonly envelope_id?: string;
  readonly payload?: unknown;
  readonly type?: string;
}

export type SlackInteractionType = "block_actions" | "view_submission";

export interface SlackInteractionPayload {
  readonly type: SlackInteractionType;
  readonly actionId: string;
  readonly value?: string;
  readonly userId: string;
  readonly channelId?: string;
  readonly messageTs?: string;
  readonly triggerId?: string;
  readonly responseUrl?: string;
  readonly privateMetadata?: string;
  readonly viewValues?: JsonObject;
}

export interface SlackInteractionHandler {
  readonly actionIdPrefix: string;
  handle(payload: SlackInteractionPayload): Awaitable<boolean>;
}

export interface SlackInteractionDispatchResult {
  readonly dispatched: boolean;
  readonly reason?: "parse_failed" | "no_handler" | "handler_rejected";
  readonly payload?: SlackInteractionPayload;
}

export interface TrackedSlackBotResponse {
  readonly sessionId: string;
  readonly userPrompt: string;
  readonly response?: string;
  readonly expiresAt: number;
}

export interface SlackFeedbackInput {
  readonly channelId?: string;
  readonly messageTs?: string;
  readonly metadata?: JsonObject;
  readonly query: string;
  readonly rating: "thumbs_down" | "thumbs_up";
  readonly response: string;
  readonly sessionId: string;
  readonly userId: string;
}

export interface SlackResponseTrackingInput {
  readonly channelId: string;
  readonly messageTs: string;
  readonly sessionId: string;
  readonly userPrompt: string;
  readonly response?: string;
  readonly expiresAt: number;
}

export interface SlackResponseTrackerStore {
  track(input: SlackResponseTrackingInput): Awaitable<void>;
  lookup(channelId: string, messageTs: string, now?: number): Awaitable<TrackedSlackBotResponse | undefined>;
  purgeExpired(now?: number): Awaitable<number>;
}

export interface SlackFeedbackEvent extends SlackFeedbackInput {
  readonly id: string;
  readonly channelId: string;
  readonly createdAt: Date;
  readonly messageTs: string;
}

export interface SlackFeedbackEventStore {
  save(input: SlackFeedbackInput): Awaitable<SlackFeedbackEvent>;
  listBySession(sessionId: string): Awaitable<readonly SlackFeedbackEvent[]>;
}

export type SlackFaqAutoReplyMode = "MENTION" | "ALWAYS" | "OFF";
export type SlackFaqIngestStatus = "OK" | "FAILED" | "RUNNING";

export interface SlackBotInstance {
  readonly id: string;
  readonly name: string;
  readonly botToken: string;
  readonly appToken: string;
  readonly personaId: string;
  readonly defaultChannel?: string | null;
  readonly enabled?: boolean;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

export interface SlackBotInstanceStore {
  list(): Awaitable<readonly SlackBotInstance[]>;
  listEnabled(): Awaitable<readonly SlackBotInstance[]>;
  get(id: string): Awaitable<SlackBotInstance | undefined>;
  save(instance: SlackBotInstance): Awaitable<SlackBotInstance>;
  delete(id: string): Awaitable<boolean>;
}

export interface ChannelFaqRegistration {
  readonly channelId: string;
  readonly channelName?: string | null;
  readonly enabled?: boolean;
  readonly autoReplyMode?: SlackFaqAutoReplyMode;
  readonly confidenceThreshold?: number;
  readonly daysBack?: number;
  readonly reIngestIntervalHours?: number;
  readonly lastIngestedAt?: Date | null;
  readonly lastMessageCount?: number | null;
  readonly lastChunkCount?: number | null;
  readonly lastStatus?: SlackFaqIngestStatus | null;
  readonly lastError?: string | null;
  readonly registeredBy?: string | null;
  readonly registeredAt?: Date;
  readonly updatedAt?: Date;
}

export interface ChannelFaqRegistrationStore {
  save(registration: ChannelFaqRegistration): Awaitable<ChannelFaqRegistration>;
  get(channelId: string): Awaitable<ChannelFaqRegistration | undefined>;
  list(options?: { readonly enabledOnly?: boolean }): Awaitable<readonly ChannelFaqRegistration[]>;
  delete(channelId: string): Awaitable<boolean>;
  updateIngestResult(input: {
    readonly channelId: string;
    readonly status: SlackFaqIngestStatus;
    readonly messageCount?: number | null;
    readonly chunkCount?: number | null;
    readonly error?: string | null;
  }): Awaitable<ChannelFaqRegistration | undefined>;
}

export interface SlackSignatureVerifierOptions {
  readonly signingSecret: string;
  readonly timestampToleranceSeconds?: number;
  readonly nowSeconds?: () => number;
}

export interface WebhookDispatcherOptions {
  readonly endpoints?: readonly WebhookEndpoint[];
  readonly transport: WebhookTransport;
  readonly now?: () => Date;
  readonly idFactory?: () => string;
}

// Slack slash-command parsers + CommandRouter live in
// packages/integrations/src/slack-commands.ts.
export {
  CommandRouter,
  commandEnvelopeFromText,
  parseSlackSlashCommand,
  parseSlackUrlEncodedBody,
  toSlackCommandAck
} from "./slack-commands.js";


// Slack bot-instance + channel-FAQ-registration stores live in
// packages/integrations/src/slack-bot-faq-store.ts.
export {
  buildChannelFaqRegistrationUpsertQuery,
  buildSlackBotInstanceUpsertQuery,
  createChannelFaqRegistrationInsert,
  createSlackBotInstanceInsert,
  InMemoryChannelFaqRegistrationStore,
  InMemorySlackBotInstanceStore,
  KyselyChannelFaqRegistrationStore,
  KyselySlackBotInstanceStore,
  mapChannelFaqRegistrationRow,
  mapSlackBotInstanceRow
} from "./slack-bot-faq-store.js";

// SlackInteractionDispatcher + SlackSocketModeGateway +
// parseSlackInteractionPayload live in
// packages/integrations/src/slack-interaction.ts.
export {
  parseSlackInteractionPayload,
  SlackInteractionDispatcher,
  SlackSocketModeGateway
} from "./slack-interaction.js";

// Slack response tracker primitives live in
// packages/integrations/src/slack-response-tracker.ts.
export {
  createSlackResponseTrackingInsert,
  InMemorySlackResponseTrackerStore,
  KyselySlackResponseTrackerStore,
  mapSlackResponseTrackingRow,
  SlackBotResponseTracker
} from "./slack-response-tracker.js";

// Slack feedback event primitives live in
// packages/integrations/src/slack-feedback-store.ts.
export {
  createSlackFeedbackEventInsert,
  InMemorySlackFeedbackEventStore,
  KyselySlackFeedbackEventStore,
  mapSlackFeedbackEventRow,
  SlackFeedbackButtonHandler
} from "./slack-feedback-store.js";

// WebhookDispatcher + createWebhookNotificationHook live in
// packages/integrations/src/webhook-dispatcher.ts.
export {
  createWebhookNotificationHook,
  WebhookDispatcher
} from "./webhook-dispatcher.js";

// Slack reminder primitives live in packages/integrations/src/slack-reminders.ts.
export {
  createSlackReminderPoller,
  handleSlackReminderCommand,
  InMemoryReminderStore,
  parseReminderTime,
  type InMemoryReminderStoreOptions,
  type ReminderStore,
  type ReminderTimeParseOptions,
  type SlackReminder,
  type SlackReminderCommandResult,
  type SlackReminderPoller,
  type SlackReminderPollerOptions,
  type SlackReminderTimeParseResult
} from "./slack-reminders.js";

// Slack follow-up suggestion primitives live in packages/integrations/src/slack-followup.ts.
export {
  createFollowupSuggestionInteractionHandler,
  extractFollowupCategory,
  followupActionId,
  FOLLOWUP_ACTION_PREFIX,
  FOLLOWUP_MAX_LABEL_LENGTH,
  FOLLOWUP_MAX_PER_MESSAGE,
  parseFollowupSuggestions,
  renderFollowupSuggestionBlocks,
  stripFollowupMarker,
  truncateFollowupLabel,
  type FollowupAgentReplyResult,
  type FollowupSuggestion,
  type FollowupSuggestionInteractionHandlerOptions
} from "./slack-followup.js";

// Slack assistant-thread progress hook lives in packages/integrations/src/slack-progress-hook.ts.
export {
  createSlackProgressHook,
  SLACK_PROGRESS_DEFAULT_FRIENDLY_NAMES,
  SLACK_PROGRESS_DEFAULT_MIN_UPDATE_MS,
  SLACK_PROGRESS_MAX_STATUS_LENGTH
} from "./slack-progress-hook.js";

// CostAnomaly + PromptDrift + SloAlert hooks live in
// packages/integrations/src/observability-hooks.ts.
export {
  createCostAnomalyHook,
  createPromptDriftHook,
  createSloAlertHook,
  type CostAnomalyHookOptions,
  type PromptDriftHookOptions,
  type SloAlertHookOptions
} from "./observability-hooks.js";

// createSlackProgressHook lives in packages/integrations/src/slack-progress-hook.ts.

// Tool-response / RAG-ingestion / feedback-metadata / user-memory
// hooks live in packages/integrations/src/agent-lifecycle-hooks.ts.
export {
  createFeedbackMetadataCaptureHook,
  createRagIngestionCaptureHook,
  createToolResponseSummaryHook,
  createUserMemoryInjectionHook
} from "./agent-lifecycle-hooks.js";

// SlackSignatureVerifier + signing/verification helpers live in
// packages/integrations/src/slack-signature.ts.
export {
  createWebhookHeaders,
  signSlackRequestBody,
  signWebhookPayload,
  SlackSignatureVerifier,
  verifySlackSignature,
  verifyWebhookSignature
} from "./slack-signature.js";

// formatSlackMrkdwn + formatSlackPayload live in packages/integrations/src/slack-mrkdwn.ts.
export { formatSlackMrkdwn, formatSlackPayload } from "./slack-mrkdwn.js";

// FetchSlackResponseUrlTransport + FetchSlackWebApiMessageTransport live in
// packages/integrations/src/slack-transports.ts.
export {
  FetchSlackResponseUrlTransport,
  FetchSlackWebApiMessageTransport
} from "./slack-transports.js";
