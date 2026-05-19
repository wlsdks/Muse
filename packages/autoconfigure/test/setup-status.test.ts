import { describe, expect, it } from "vitest";

import { resolveDefaultModel } from "../src/autoconfigure-model-provider.js";
import { readModelKeyState, readWebSearchEnvSnapshot } from "../src/setup-status.js";

const MISSING_KEYS_FILE = "/dev/null/no-such-keys.json";

describe("readWebSearchEnvSnapshot", () => {
  it("returns enabled=true, maxUses=5, source=default when no env vars set", () => {
    expect(readWebSearchEnvSnapshot({})).toEqual({
      enabled: true,
      maxUses: 5,
      source: "default"
    });
  });

  it("MUSE_WEB_SEARCH=off flips enabled to false with source=env", () => {
    expect(readWebSearchEnvSnapshot({ MUSE_WEB_SEARCH: "off" })).toEqual({
      enabled: false,
      maxUses: 5,
      source: "env"
    });
  });

  it("MUSE_WEB_SEARCH=on is the explicit-enable form with source=env", () => {
    expect(readWebSearchEnvSnapshot({ MUSE_WEB_SEARCH: "on" })).toEqual({
      enabled: true,
      maxUses: 5,
      source: "env"
    });
  });

  it("MUSE_WEB_SEARCH_MAX_USES overrides default maxUses when positive", () => {
    expect(readWebSearchEnvSnapshot({ MUSE_WEB_SEARCH_MAX_USES: "12" })).toEqual({
      enabled: true,
      maxUses: 12,
      source: "env"
    });
  });

  it("non-positive MUSE_WEB_SEARCH_MAX_USES falls back to default 5", () => {
    expect(readWebSearchEnvSnapshot({ MUSE_WEB_SEARCH_MAX_USES: "abc" })).toEqual({
      enabled: true,
      maxUses: 5,
      source: "default"
    });
  });

  it("a lenient-prefix typo / unit-slip MUSE_WEB_SEARCH_MAX_USES is rejected, not reported as env-configured", () => {
    // Number.parseInt("5x") === 5 — the 414/444 footgun. On the
    // setup-status surface a typo must NOT show as a valid value.
    for (const bad of ["5x", "30s", "12abc", "1_000", "0", "-3", " "]) {
      expect(readWebSearchEnvSnapshot({ MUSE_WEB_SEARCH_MAX_USES: bad })).toEqual({
        enabled: true,
        maxUses: 5,
        source: "default"
      });
    }
    // No regression: a clean positive integer still configures it.
    expect(readWebSearchEnvSnapshot({ MUSE_WEB_SEARCH_MAX_USES: "8" })).toEqual({
      enabled: true,
      maxUses: 8,
      source: "env"
    });
  });

  it("OFF flag is case-insensitive (OFF / Off / off all disable)", () => {
    for (const value of ["OFF", "Off", "off"]) {
      expect(readWebSearchEnvSnapshot({ MUSE_WEB_SEARCH: value }).enabled).toBe(false);
    }
  });
});

describe("readModelKeyState — provider key probing", () => {
  it("detects GROQ_API_KEY", async () => {
    const lines = await readModelKeyState(MISSING_KEYS_FILE, { GROQ_API_KEY: "grq" });
    expect(lines).toContain("groq (env)");
  });

  it("detects DEEPSEEK_API_KEY", async () => {
    const lines = await readModelKeyState(MISSING_KEYS_FILE, { DEEPSEEK_API_KEY: "ds" });
    expect(lines).toContain("deepseek (env)");
  });

  it("detects TOGETHER_API_KEY", async () => {
    const lines = await readModelKeyState(MISSING_KEYS_FILE, { TOGETHER_API_KEY: "tg" });
    expect(lines).toContain("together (env)");
  });

  it("detects MISTRAL_API_KEY", async () => {
    const lines = await readModelKeyState(MISSING_KEYS_FILE, { MISTRAL_API_KEY: "ms" });
    expect(lines).toContain("mistral (env)");
  });

  it("detects MOONSHOT_API_KEY", async () => {
    const lines = await readModelKeyState(MISSING_KEYS_FILE, { MOONSHOT_API_KEY: "mn" });
    expect(lines).toContain("moonshot (env)");
  });

  it("keeps the legacy providers (openai/anthropic/gemini/openrouter/ollama)", async () => {
    const lines = await readModelKeyState(MISSING_KEYS_FILE, {
      OPENAI_API_KEY: "o",
      ANTHROPIC_API_KEY: "a",
      GEMINI_API_KEY: "g",
      OPENROUTER_API_KEY: "or",
      OLLAMA_BASE_URL: "http://localhost:11434"
    });
    expect(lines).toEqual([
      "openai (env)",
      "anthropic (env)",
      "gemini (env)",
      "openrouter (env)",
      "ollama (env)"
    ]);
  });
});

describe("readModelKeyState ↔ resolveDefaultModel parity", () => {
  const probedKeys: ReadonlyArray<{ id: string; envKey: string; envValue: string }> = [
    { envKey: "OPENAI_API_KEY", envValue: "t", id: "openai" },
    { envKey: "ANTHROPIC_API_KEY", envValue: "t", id: "anthropic" },
    { envKey: "GEMINI_API_KEY", envValue: "t", id: "gemini" },
    { envKey: "OPENROUTER_API_KEY", envValue: "t", id: "openrouter" },
    { envKey: "OLLAMA_BASE_URL", envValue: "http://localhost:11434", id: "ollama" },
    { envKey: "GROQ_API_KEY", envValue: "t", id: "groq" },
    { envKey: "DEEPSEEK_API_KEY", envValue: "t", id: "deepseek" },
    { envKey: "TOGETHER_API_KEY", envValue: "t", id: "together" },
    { envKey: "MISTRAL_API_KEY", envValue: "t", id: "mistral" },
    { envKey: "MOONSHOT_API_KEY", envValue: "t", id: "moonshot" },
    { envKey: "CEREBRAS_API_KEY", envValue: "t", id: "cerebras" }
  ];

  for (const { id, envKey, envValue } of probedKeys) {
    it(`${id}: probe detects key AND resolveDefaultModel picks a model`, async () => {
      const env = { [envKey]: envValue };
      const probed = await readModelKeyState(MISSING_KEYS_FILE, env);
      expect(probed).toContain(`${id} (env)`);
      const model = resolveDefaultModel(env);
      expect(model, `${id} key is probed but resolveDefaultModel returned undefined`).toBeDefined();
      expect(model).toMatch(/\S/);
    });
  }
});
