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
  const workspaceContext = inferWorkspaceApprovalContext(toolName, args);

  if (workspaceContext) {
    return redactApprovalContext(workspaceContext);
  }

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

function inferWorkspaceApprovalContext(toolName: string, args: JsonObject): ApprovalContext | undefined {
  const category = workspaceToolCategory(toolName);

  if (!category) {
    return undefined;
  }

  const scope = firstString(args, workspaceScopeKeys[category])?.slice(0, workspaceImpactScopeMaxLength);
  const action = scope ?? firstString(args, workspacePrimaryKeys[category]);
  const actionText = action ? `${toolName}(${action.slice(0, workspaceImpactScopeMaxLength)})` : toolName;

  return {
    action: actionText,
    impactScope: scope ?? workspaceFallbackScope[category],
    reason: `${workspaceDisplayName[category]} read operation: ${toolName}`,
    reversibility: "reversible"
  };
}

function workspaceToolCategory(toolName: string): WorkspaceToolCategory | undefined {
  if (toolName.startsWith("jira_")) {
    return "jira";
  }

  if (toolName.startsWith("confluence_")) {
    return "confluence";
  }

  if (toolName.startsWith("bitbucket_")) {
    return "bitbucket";
  }

  return undefined;
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

type WorkspaceToolCategory = "jira" | "confluence" | "bitbucket";

const workspaceImpactScopeMaxLength = 120;

const workspaceDisplayName: Record<WorkspaceToolCategory, string> = {
  bitbucket: "Bitbucket",
  confluence: "Confluence",
  jira: "Jira"
};

const workspaceFallbackScope: Record<WorkspaceToolCategory, string> = {
  bitbucket: "Bitbucket workspace",
  confluence: "Confluence space",
  jira: "Jira workspace"
};

const workspaceScopeKeys: Record<WorkspaceToolCategory, readonly string[]> = {
  bitbucket: ["pullRequestId", "prId", "repoSlug", "repo", "repository", "workspace", "branch"],
  confluence: ["pageId", "spaceKey", "space", "query", "keyword", "question"],
  jira: ["issueKey", "project", "projectKey", "jql", "keyword", "assigneeAccountId", "requesterEmail"]
};

const workspacePrimaryKeys: Record<WorkspaceToolCategory, readonly string[]> = {
  bitbucket: [...workspaceScopeKeys.bitbucket, "commitHash"],
  confluence: [...workspaceScopeKeys.confluence, "title"],
  jira: [...workspaceScopeKeys.jira, "ticketKey"]
};

const approvalContextRedactionPatterns = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/giu,
  /Bearer\s+[A-Za-z0-9\-_.=]+/giu,
  /ATATT3xFfGF0[A-Za-z0-9\-_=]+/gu,
  /xox[baprs]-[A-Za-z0-9-]+/giu,
  /\b01[0-9]-\d{3,4}-\d{4}\b/gu,
  /\b\+?82-10-\d{3,4}-\d{4}\b/gu,
  /\b\d{6}-[1-4]\d{6}\b/gu
] as const;
