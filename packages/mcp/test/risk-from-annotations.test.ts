import { describe, expect, it } from "vitest";

import { riskFromMcpAnnotations } from "../src/transport.js";

describe("riskFromMcpAnnotations — fail-closed risk classification for external MCP tools", () => {
  it("defaults an UN-annotated tool to the gated `write` tier (not the ungated `read`)", () => {
    // The bug: `read` skips the approval gate, so an un-annotated outbound tool
    // (post_message / create_issue) ran with no confirmation. Fail-close.
    expect(riskFromMcpAnnotations(undefined)).toBe("write");
    expect(riskFromMcpAnnotations(null)).toBe("write");
    expect(riskFromMcpAnnotations({})).toBe("write");
    expect(riskFromMcpAnnotations([])).toBe("write");
    expect(riskFromMcpAnnotations("nope")).toBe("write");
  });

  it("downgrades to the ungated `read` tier ONLY on an explicit readOnlyHint:true", () => {
    expect(riskFromMcpAnnotations({ readOnlyHint: true })).toBe("read");
  });

  it("keeps a tool gated when readOnlyHint is absent/false even if idempotent", () => {
    expect(riskFromMcpAnnotations({ idempotentHint: true })).toBe("write");
    expect(riskFromMcpAnnotations({ readOnlyHint: false })).toBe("write");
    expect(riskFromMcpAnnotations({ title: "Post message" })).toBe("write");
  });

  it("escalates to `execute` on an explicit destructiveHint:true (precedence over read)", () => {
    expect(riskFromMcpAnnotations({ destructiveHint: true })).toBe("execute");
    expect(riskFromMcpAnnotations({ destructiveHint: true, readOnlyHint: true })).toBe("execute");
  });
});
