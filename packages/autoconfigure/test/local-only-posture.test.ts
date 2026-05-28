import { describe, expect, it } from "vitest";

import { evaluateLocalOnlyPosture } from "../src/setup-status.js";

describe("evaluateLocalOnlyPosture — single source of truth for doctor + setup status", () => {
  it("ON + a local model ⇒ ok, egress blocked", () => {
    const p = evaluateLocalOnlyPosture({ MUSE_LOCAL_ONLY: "true", MUSE_MODEL: "ollama/llama3.2" });
    expect(p).toMatchObject({ enabled: true, status: "ok" });
    expect(p.detail).toContain("blocked");
  });

  it("ON + a cloud model ⇒ fail with the runtime's own refusal reason", () => {
    const p = evaluateLocalOnlyPosture({ MUSE_LOCAL_ONLY: "true", GEMINI_API_KEY: "k" });
    expect(p).toMatchObject({ enabled: true, status: "fail" });
    expect(p.detail).toContain("MUSE_LOCAL_ONLY");
  });

  it("OFF + cloud credentials ⇒ warn that egress is possible", () => {
    const p = evaluateLocalOnlyPosture({ OPENAI_API_KEY: "k" });
    expect(p).toMatchObject({ enabled: false, status: "warn" });
    expect(p.detail).toContain("OPENAI_API_KEY");
    expect(p.detail).toContain("MUSE_LOCAL_ONLY=true");
  });

  it("OFF + no cloud credentials ⇒ ok (nothing to leak)", () => {
    const p = evaluateLocalOnlyPosture({ MUSE_MODEL: "ollama/llama3.2" });
    expect(p).toMatchObject({ enabled: false, status: "ok" });
    expect(p.detail).toContain("off");
  });
});
