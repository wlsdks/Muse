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

  return redactApprovalContext({
    action: toolName,
    impactScope,
    reason: risk === "execute"
      ? `Tool '${toolName}' can execute local or remote actions.`
      : `Tool '${toolName}' can modify workspace state.`,
    reversibility: risk === "execute" ? "unknown" : reversibilityForTool(toolName)
  });
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

function redactApprovalContext(context: ApprovalContext): ApprovalContext {
  return {
    ...context,
    action: redactApprovalText(context.action),
    impactScope: redactApprovalText(context.impactScope),
    reason: redactApprovalText(context.reason)
  };
}

function redactApprovalText(text: string): string {
  return approvalContextRedactionPatterns.reduce((current, pattern) => current.replace(pattern, "***"), text);
}

const secretKeyPattern = /(api[_-]?key|authorization|credential|password|secret|token)/iu;

const approvalContextRedactionPatterns = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/giu,
  /Bearer\s+[A-Za-z0-9\-_.=]+/giu,
  /ATATT3xFfGF0[A-Za-z0-9\-_=]+/gu,
  /xox[baprs]-[A-Za-z0-9-]+/giu,
  /\b01[0-9]-\d{3,4}-\d{4}\b/gu,
  /\b\+?82-10-\d{3,4}-\d{4}\b/gu,
  /\b\d{6}-[1-4]\d{6}\b/gu
] as const;
