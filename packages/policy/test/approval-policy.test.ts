import { describe, expect, it } from "vitest";
import {
  createAlwaysApprovePolicy,
  inferApprovalContext,
  renderApprovalRequest,
  createToolNameApprovalPolicy,
  createToolRiskApprovalPolicy
} from "../src/index.js";

describe("tool approval policies", () => {
  it("allows every tool by default", () => {
    const policy = createAlwaysApprovePolicy();

    expect(policy.requiresApproval("delete_file", { risk: "execute" })).toBe(false);
  });

  it("requires approval for configured tool names", () => {
    const policy = createToolNameApprovalPolicy(["delete_file", "send_message"]);

    expect(policy.requiresApproval("delete_file", {})).toBe(true);
    expect(policy.requiresApproval("read_file", {})).toBe(false);
  });

  it("requires approval for configured risk levels", () => {
    const policy = createToolRiskApprovalPolicy(["write", "execute"]);

    expect(policy.requiresApproval("shell", { risk: "execute" })).toBe(true);
    expect(policy.requiresApproval("search", { risk: "read" })).toBe(false);
  });

  it("infers rich approval context for risky workspace mutations", () => {
    expect(inferApprovalContext("write_file", {
      path: "docs/release-plan.md",
      risk: "write"
    })).toEqual({
      action: "write_file",
      impactScope: "docs/release-plan.md",
      reason: "Tool 'write_file' can modify workspace state.",
      reversibility: "partially_reversible"
    });
    expect(inferApprovalContext("run_command", {
      command: "rm",
      risk: "execute"
    })).toMatchObject({
      impactScope: "rm",
      reversibility: "unknown"
    });
  });

  it("infers redacted workspace approval context for Atlassian-compatible read tools", () => {
    expect(inferApprovalContext("jira_get_issue", {
      issueKey: "MUSE-42",
      requesterEmail: "example-user@example.com",
      token: "ATATT3xFfGF0secret"
    })).toEqual({
      action: "jira_get_issue(MUSE-42)",
      impactScope: "MUSE-42",
      reason: "Jira read operation: jira_get_issue",
      reversibility: "reversible"
    });

    expect(inferApprovalContext("bitbucket_list_prs", {
      repoSlug: "platform-api"
    })).toMatchObject({
      action: "bitbucket_list_prs(platform-api)",
      impactScope: "platform-api",
      reason: "Bitbucket read operation: bitbucket_list_prs",
      reversibility: "reversible"
    });

    expect(inferApprovalContext("jira_search_by_text", {
      requesterEmail: "example-user@example.com"
    })).toMatchObject({
      action: "jira_search_by_text(***)",
      impactScope: "***"
    });
  });

  it("renders approval requests with redacted arguments", () => {
    const rendered = renderApprovalRequest({
      arguments: {
        path: "docs/release-plan.md",
        token: "secret-token"
      },
      context: {
        action: "write_file",
        impactScope: "docs/release-plan.md",
        reason: "Tool 'write_file' can modify workspace state.",
        reversibility: "partially_reversible"
      },
      runId: "run-1",
      toolName: "write_file",
      userId: "example-user"
    });

    expect(rendered).toContain("Tool: write_file");
    expect(rendered).toContain("Impact: docs/release-plan.md");
    expect(rendered).toContain('"token": "[REDACTED]"');
    expect(rendered).not.toContain("secret-token");
  });
});
