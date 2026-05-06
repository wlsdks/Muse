import type { JsonObject } from "@muse/shared";

export interface ToolApprovalPolicy {
  requiresApproval(toolName: string, args: JsonObject): boolean;
}

export type ApprovalReversibility = "reversible" | "partially_reversible" | "irreversible" | "unknown";

export interface ApprovalContext {
  readonly action: string;
  readonly impactScope: string;
  readonly reason: string;
  readonly reversibility: ApprovalReversibility;
}

export interface RenderApprovalRequestInput {
  readonly runId: string;
  readonly userId: string;
  readonly toolName: string;
  readonly arguments: JsonObject;
  readonly context?: Partial<ApprovalContext>;
}

export function createAlwaysApprovePolicy(): ToolApprovalPolicy {
  return {
    requiresApproval: () => false
  };
}

export function createToolNameApprovalPolicy(toolNames: Iterable<string>): ToolApprovalPolicy {
  const names = new Set(toolNames);

  return {
    requiresApproval: (toolName) => names.has(toolName)
  };
}

export function createToolRiskApprovalPolicy(risks: Iterable<string>): ToolApprovalPolicy {
  const blockedRisks = new Set(risks);

  return {
    requiresApproval: (_toolName, args) => {
      const risk = args["risk"];
      return typeof risk === "string" && blockedRisks.has(risk);
    }
  };
}

export function inferApprovalContext(toolName: string, args: JsonObject): ApprovalContext {
  const risk = stringValue(args.risk);
  const impactScope = firstString(args, ["path", "file", "url", "resource", "command", "workspaceId"]) ?? "workspace";

  return {
    action: toolName,
    impactScope,
    reason: risk === "execute"
      ? `Tool '${toolName}' can execute local or remote actions.`
      : `Tool '${toolName}' can modify workspace state.`,
    reversibility: risk === "execute" ? "unknown" : reversibilityForTool(toolName)
  };
}

export function renderApprovalRequest(input: RenderApprovalRequestInput): string {
  const inferred = inferApprovalContext(input.toolName, input.arguments);
  const context = {
    ...inferred,
    ...input.context
  };

  return [
    `Tool: ${input.toolName}`,
    `Run: ${input.runId}`,
    `User: ${input.userId}`,
    `Reason: ${context.reason}`,
    `Impact: ${context.impactScope}`,
    `Reversibility: ${context.reversibility}`,
    "Arguments:",
    JSON.stringify(redactApprovalArguments(input.arguments), null, 2)
  ].join("\n");
}

function reversibilityForTool(toolName: string): ApprovalReversibility {
  const normalized = toolName.toLowerCase();

  if (normalized.includes("delete") || normalized.includes("remove")) {
    return "irreversible";
  }

  if (normalized.includes("write") || normalized.includes("update") || normalized.includes("create")) {
    return "partially_reversible";
  }

  return "unknown";
}

function redactApprovalArguments(args: JsonObject): JsonObject {
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => [
      key,
      secretKeyPattern.test(key) ? "[REDACTED]" : value
    ])
  ) as JsonObject;
}

function firstString(args: JsonObject, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = stringValue(args[key]);

    if (value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function stringValue(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

const secretKeyPattern = /(api[_-]?key|authorization|credential|password|secret|token)/iu;
