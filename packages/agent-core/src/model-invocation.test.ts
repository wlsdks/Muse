import { describe, expect, it } from "vitest";

import { buildModelRequestWithWebSearch } from "./model-invocation.js";

describe("buildModelRequestWithWebSearch", () => {
  it("attaches webSearchPolicy from settings", () => {
    const r = buildModelRequestWithWebSearch(
      { model: "openai/gpt-4o", messages: [{ role: "user", content: "x" }] },
      { settings: { webSearch: { enabled: true, maxUses: 4 } }, override: undefined, env: {} }
    );
    expect((r.metadata as { webSearchPolicy?: { enabled: boolean; maxUses: number } } | undefined)?.webSearchPolicy).toEqual({
      enabled: true,
      maxUses: 4
    });
  });

  it("override=false suppresses policy.enabled even with settings on", () => {
    const r = buildModelRequestWithWebSearch(
      { model: "openai/gpt-4o", messages: [{ role: "user", content: "x" }] },
      { settings: { webSearch: { enabled: true, maxUses: 5 } }, override: false, env: {} }
    );
    expect((r.metadata as { webSearchPolicy?: { enabled: boolean } } | undefined)?.webSearchPolicy?.enabled).toBe(false);
  });

  it("preserves existing metadata fields", () => {
    const r = buildModelRequestWithWebSearch(
      {
        model: "anthropic/claude-opus-4",
        messages: [{ role: "user", content: "hi" }],
        metadata: { userId: "u1" }
      },
      { settings: {}, override: undefined, env: {} }
    );
    expect((r.metadata as Record<string, unknown>)?.userId).toBe("u1");
    expect((r.metadata as Record<string, unknown>)?.webSearchPolicy).toBeDefined();
  });

  it("handles model spec without slash (provider=modelId fallback)", () => {
    const r = buildModelRequestWithWebSearch(
      { model: "gpt-4o", messages: [] },
      { settings: { webSearch: { enabled: true } }, override: undefined, env: {} }
    );
    expect((r.metadata as { webSearchPolicy?: { enabled: boolean } } | undefined)?.webSearchPolicy?.enabled).toBe(true);
  });
});
