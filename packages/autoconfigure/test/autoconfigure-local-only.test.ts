import { LocalOnlyViolationError, OllamaProvider, OpenAICompatibleProvider } from "@muse/model";
import { describe, expect, it } from "vitest";

import { createModelProvider } from "../src/autoconfigure-model-provider.js";

describe("createModelProvider — MUSE_LOCAL_ONLY fail-close", () => {
  it("blocks a cloud provider loud and clear", () => {
    for (const env of [
      { GEMINI_API_KEY: "k", MUSE_LOCAL_ONLY: "true" },
      { OPENAI_API_KEY: "k", MUSE_LOCAL_ONLY: "true" },
      { ANTHROPIC_API_KEY: "k", MUSE_LOCAL_ONLY: "true" },
      { MUSE_MODEL: "groq/llama-3.1-70b", MUSE_MODEL_PROVIDER_ID: "groq", GROQ_API_KEY: "k", MUSE_LOCAL_ONLY: "true" }
    ]) {
      expect(() => createModelProvider(env), JSON.stringify(env)).toThrow(LocalOnlyViolationError);
    }
  });

  it("allows local Ollama under local-only", () => {
    const provider = createModelProvider({ MUSE_MODEL: "ollama/llama3.2", MUSE_LOCAL_ONLY: "true" });
    expect(provider).toBeInstanceOf(OllamaProvider);
  });

  it("allows a localhost OpenAI-compatible endpoint under local-only", () => {
    const provider = createModelProvider({
      MUSE_MODEL: "local/qwen3:8b",
      MUSE_MODEL_BASE_URL: "http://localhost:8000/v1",
      MUSE_LOCAL_ONLY: "true"
    });
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
  });

  it("blocks a REMOTE Ollama host under local-only (off-box egress)", () => {
    expect(() => createModelProvider({
      MUSE_MODEL: "ollama/llama3.2",
      OLLAMA_BASE_URL: "http://192.168.1.50:11434",
      MUSE_LOCAL_ONLY: "true"
    })).toThrow(LocalOnlyViolationError);
  });

  it("does not interfere when MUSE_LOCAL_ONLY is unset — cloud still builds", () => {
    const provider = createModelProvider({ GEMINI_API_KEY: "k" });
    expect(provider?.id).toBe("gemini");
  });
});
