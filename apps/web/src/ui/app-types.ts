/**
 * Shared types for the Muse web console panels. Lifted out of
 * `App.tsx` so panel files can pull just what they need without
 * importing the App barrel.
 */

export interface HealthResponse {
  readonly service?: string;
  readonly status?: string;
}

export interface Citation {
  readonly url: string;
  readonly title: string;
}

export interface ChatResponse {
  readonly content?: string;
  readonly response?: string;
  readonly runId?: string;
  readonly metadata?: Record<string, unknown>;
  readonly citations?: readonly Citation[];
}

export interface SessionSummary {
  readonly id?: string;
  readonly status?: string;
  readonly model?: string;
  readonly provider?: string;
  readonly inputPreview?: string;
}

export interface AdminSummary {
  readonly recentRuns?: readonly SessionSummary[];
}

export interface ToolCatalogEntry {
  readonly name: string;
  readonly description: string;
  readonly risk: "read" | "write" | "execute";
  readonly keywords?: readonly string[];
  readonly scopes?: readonly string[];
}

export interface ToolCatalogResponse {
  readonly tools: readonly ToolCatalogEntry[];
  readonly total: number;
}

export interface OrchestrationEntry {
  readonly runId: string;
  readonly mode: "sequential" | "parallel";
  readonly status: "completed" | "failed";
  readonly workerCount: number;
  readonly completedCount: number;
  readonly failedCount: number;
  readonly durationMs: number;
  readonly startedAt: string;
  readonly conversationLength?: number;
}

export interface OrchestrationListResponse {
  readonly entries: readonly OrchestrationEntry[];
  readonly total: number;
}

export interface CalendarCredentialRequirement {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly secret: boolean;
}

export interface CalendarProviderInfo {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly local: boolean;
  readonly credentials: readonly CalendarCredentialRequirement[];
}

export interface CalendarProvidersResponse {
  readonly providers: readonly CalendarProviderInfo[];
  readonly enabled: readonly string[];
}

export interface CalendarCredentialsResponse {
  readonly providers: readonly string[];
}
