import { describe, expect, it } from "vitest";

import {
  parseAgentSpecInput,
  parseAuthCredentials,
  parseMultipartChatBody,
  parseRuntimeSettingInput
} from "../src/server-helpers.js";

const okValue = <T>(result: { ok: boolean; value?: T; error?: unknown }): T => {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  return result.value as T;
};
const errOf = (result: { ok: boolean; error?: { code: string; message: string } }) => {
  if (result.ok) throw new Error(`expected error, got ${JSON.stringify(result)}`);
  return result.error!;
};

describe("parseMultipartChatBody", () => {
  it("rejects a body that is not multipart form-data (missing fields record or files array)", () => {
    expect(errOf(parseMultipartChatBody("nope")).code).toBe("INVALID_MULTIPART_CHAT_REQUEST");
    expect(errOf(parseMultipartChatBody({ fields: {}, files: "no" })).code).toBe("INVALID_MULTIPART_CHAT_REQUEST");
    expect(errOf(parseMultipartChatBody({ fields: "x", files: [] })).code).toBe("INVALID_MULTIPART_CHAT_REQUEST");
  });

  it("rejects when the message field is missing", () => {
    expect(errOf(parseMultipartChatBody({ fields: {}, files: [] }))).toEqual({
      code: "INVALID_MULTIPART_CHAT_REQUEST",
      message: "Multipart request must include message"
    });
  });

  it("builds a minimal web-channel chat body", () => {
    expect(okValue(parseMultipartChatBody({ fields: { message: "hi" }, files: [] }))).toEqual({
      message: "hi",
      metadata: { channel: "web", media: [] }
    });
  });

  it("keeps only object file entries as media", () => {
    const value = okValue<{ metadata: { media: unknown[] } }>(
      parseMultipartChatBody({ fields: { message: "hi" }, files: [{ url: "a" }, "bad", { url: "b" }] })
    );
    expect(value.metadata.media).toEqual([{ url: "a" }, { url: "b" }]);
  });

  it("threads model, runId (from sessionId), persona/session/user metadata, and a systemPrompt turn", () => {
    expect(
      okValue(
        parseMultipartChatBody({
          fields: { message: "hi", model: "m", personaId: "p", sessionId: "s", systemPrompt: "sys", userId: "u" },
          files: []
        })
      )
    ).toEqual({
      message: "hi",
      messages: [{ content: "sys", role: "system" }, { content: "hi", role: "user" }],
      metadata: { channel: "web", media: [], personaId: "p", sessionId: "s", userId: "u" },
      model: "m",
      runId: "s"
    });
  });
});

describe("parseAgentSpecInput", () => {
  it("rejects a missing or empty name", () => {
    expect(errOf(parseAgentSpecInput("x")).code).toBe("INVALID_AGENT_SPEC");
    expect(errOf(parseAgentSpecInput({ name: "  " })).code).toBe("INVALID_AGENT_SPEC");
    expect(errOf(parseAgentSpecInput({})).code).toBe("INVALID_AGENT_SPEC");
  });

  it("accepts a minimal spec with just a name", () => {
    expect(okValue(parseAgentSpecInput({ name: "agent" }))).toEqual({ name: "agent" });
  });

  it("carries every optional field through when well-formed", () => {
    expect(
      okValue(
        parseAgentSpecInput({
          description: "d",
          enabled: true,
          independentExecution: false,
          keywords: ["x", "y"],
          mode: "react",
          name: "a",
          systemPrompt: "s",
          toolNames: ["t1"]
        })
      )
    ).toEqual({
      description: "d",
      enabled: true,
      independentExecution: false,
      keywords: ["x", "y"],
      mode: "react",
      name: "a",
      systemPrompt: "s",
      toolNames: ["t1"]
    });
  });

  it("accepts the three known modes and drops an unknown one to undefined", () => {
    expect(okValue<{ mode?: string }>(parseAgentSpecInput({ mode: "standard", name: "a" })).mode).toBe("standard");
    expect(okValue<{ mode?: string }>(parseAgentSpecInput({ mode: "plan_execute", name: "a" })).mode).toBe("plan_execute");
    expect(okValue<{ mode?: string }>(parseAgentSpecInput({ mode: "bogus", name: "a" })).mode).toBeUndefined();
  });

  it("preserves an explicit null systemPrompt and drops non-array keywords/toolNames", () => {
    expect(okValue<{ systemPrompt?: string | null }>(parseAgentSpecInput({ name: "a", systemPrompt: null })).systemPrompt).toBeNull();
    expect(okValue<{ keywords?: unknown }>(parseAgentSpecInput({ keywords: "x", name: "a" })).keywords).toBeUndefined();
  });
});

describe("parseRuntimeSettingInput", () => {
  it("rejects a body without a string value", () => {
    expect(errOf(parseRuntimeSettingInput("k", { value: 5 }))).toEqual({
      code: "INVALID_RUNTIME_SETTING",
      message: "Body must include a string value"
    });
    expect(errOf(parseRuntimeSettingInput("k", "nope")).code).toBe("INVALID_RUNTIME_SETTING");
  });

  it("returns the key (from the argument) and value, omitting absent optionals", () => {
    expect(okValue(parseRuntimeSettingInput("mykey", { value: "v" }))).toEqual({ key: "mykey", value: "v" });
  });

  it("carries category, description, type, and updatedBy through", () => {
    expect(
      okValue(parseRuntimeSettingInput("k", { category: "c", description: "d", type: "boolean", updatedBy: "u", value: "v" }))
    ).toEqual({ category: "c", description: "d", key: "k", type: "boolean", updatedBy: "u", value: "v" });
  });

  it("preserves an explicit null description and drops an unknown type", () => {
    expect(okValue<{ description?: string | null }>(parseRuntimeSettingInput("k", { description: null, value: "v" })).description).toBeNull();
    expect(okValue<{ type?: string }>(parseRuntimeSettingInput("k", { type: "bogus", value: "v" })).type).toBeUndefined();
  });
});

describe("parseAuthCredentials", () => {
  it("rejects a body missing the email/password strings", () => {
    expect(errOf(parseAuthCredentials({ email: "e" }, "login"))).toEqual({
      code: "INVALID_AUTH_REQUEST",
      message: "Body must include email and password strings"
    });
    expect(errOf(parseAuthCredentials({ email: 1, password: "p" }, "login")).code).toBe("INVALID_AUTH_REQUEST");
  });

  it("rejects a blank email or password", () => {
    expect(errOf(parseAuthCredentials({ email: "  ", password: "p" }, "login")).message).toBe("Email and password must not be blank");
    expect(errOf(parseAuthCredentials({ email: "e@x.com", password: "" }, "login")).message).toBe("Email and password must not be blank");
  });

  it("logs in with the name defaulting to the email when not provided", () => {
    expect(okValue(parseAuthCredentials({ email: "e@x.com", password: "pw" }, "login"))).toEqual({
      email: "e@x.com",
      name: "e@x.com",
      password: "pw"
    });
  });

  it("requires a non-empty name only when registering", () => {
    expect(errOf(parseAuthCredentials({ email: "e@x.com", password: "pw" }, "register")).message).toBe("Registration requires a non-empty name");
    expect(okValue(parseAuthCredentials({ email: "e@x.com", name: "Jin", password: "pw" }, "register"))).toEqual({
      email: "e@x.com",
      name: "Jin",
      password: "pw"
    });
  });

  it("keeps an explicit name on login too", () => {
    expect(okValue<{ name: string }>(parseAuthCredentials({ email: "e@x.com", name: "Jin", password: "pw" }, "login")).name).toBe("Jin");
  });
});
