import { describe, expect, it } from "vitest";
import {
  createAlwaysApprovePolicy,
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
});
