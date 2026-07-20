export type AgentSpecMode = "react" | "standard" | "plan_execute";

export interface AgentSpec {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly toolNames: readonly string[];
  readonly keywords: readonly string[];
  readonly systemPrompt?: string;
  readonly mode: AgentSpecMode;
  readonly enabled: boolean;
  readonly independentExecution: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AgentSpecInput {
  readonly id?: string;
  readonly name: string;
  readonly description?: string;
  readonly toolNames?: readonly string[];
  readonly keywords?: readonly string[];
  readonly systemPrompt?: string | null;
  readonly mode?: AgentSpecMode;
  readonly enabled?: boolean;
  readonly independentExecution?: boolean;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function normalizeAgentSpecInput(
  input: AgentSpecInput,
  identity: {
    readonly createdAt: Date;
    readonly id: string;
    readonly updatedAt: Date;
  }
): AgentSpec {
  return {
    createdAt: identity.createdAt,
    description: input.description ?? "",
    enabled: input.enabled ?? true,
    id: identity.id,
    independentExecution: input.independentExecution ?? true,
    keywords: uniqueStrings(input.keywords ?? []),
    mode: input.mode ?? "react",
    name: input.name,
    systemPrompt: input.systemPrompt ?? undefined,
    toolNames: uniqueStrings(input.toolNames ?? []),
    updatedAt: identity.updatedAt
  };
}
