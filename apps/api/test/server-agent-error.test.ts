import { ModelProviderError } from "@muse/model";
import { describe, expect, it } from "vitest";

import { sendAgentError } from "../src/server-agent-error.js";

function capture() {
  const out: { status?: number; payload?: Record<string, unknown> } = {};
  const reply = {
    status(statusCode: number) {
      out.status = statusCode;
      return {
        send(payload: Record<string, unknown>) {
          out.payload = payload;
        }
      };
    }
  };
  return { out, reply };
}

describe("sendAgentError — retryable upstream failures map to 503, not a flat 500", () => {
  it("a retryable ModelProviderError → 503 UPSTREAM_UNAVAILABLE", () => {
    const { out, reply } = capture();
    sendAgentError(reply, new ModelProviderError("ollama", "ECONNREFUSED at 127.0.0.1:11434", true), "extended");
    expect(out.status).toBe(503);
    expect(out.payload).toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
      errorCode: "UPSTREAM_UNAVAILABLE",
      success: false
    });
  });

  it("a retryable ModelProviderError nested under a wrapper cause → still 503", () => {
    const { out, reply } = capture();
    const wrapped = new Error("agent retry exhausted");
    (wrapped as Error & { cause?: unknown }).cause =
      new ModelProviderError("ollama", "upstream 503", true);
    sendAgentError(reply, wrapped, "compat");
    expect(out.status).toBe(503);
    expect(out.payload).toMatchObject({ errorCode: "UPSTREAM_UNAVAILABLE", success: false });
  });

  it("a NON-retryable ModelProviderError stays 500 AGENT_RUN_FAILED (no regression)", () => {
    const { out, reply } = capture();
    sendAgentError(reply, new ModelProviderError("ollama", "model not found", false), "extended");
    expect(out.status).toBe(500);
    expect(out.payload).toMatchObject({ code: "AGENT_RUN_FAILED", errorCode: "AGENT_RUN_FAILED" });
  });

  it("a generic error with no ModelProviderError in the chain stays 500 (no regression)", () => {
    const { out, reply } = capture();
    sendAgentError(reply, new Error("some unrelated bug"), "extended");
    expect(out.status).toBe(500);
    expect(out.payload).toMatchObject({ errorCode: "AGENT_RUN_FAILED" });
  });
});
