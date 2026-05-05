import type { JsonObject } from "@muse/shared";

export interface ToolApprovalPolicy {
  requiresApproval(toolName: string, args: JsonObject): boolean;
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
