import { MODEL_CATALOG } from "@muse/model";
import { describe, expect, it } from "vitest";

import { filterCatalog, formatModelCatalog } from "./commands-models.js";

describe("muse models — filterCatalog / formatModelCatalog", () => {
  it("AND-combines filters: --vision --local keeps only LOCAL vision models", () => {
    const r = filterCatalog(MODEL_CATALOG, { local: true, vision: true });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((m) => m.capabilities.vision && m.capabilities.local)).toBe(true);
    expect(r.some((m) => m.modelId === "gpt-4o-mini")).toBe(false); // vision but CLOUD → excluded
  });
  it("an unset filter passes through (no filter → full catalog)", () => {
    expect(filterCatalog(MODEL_CATALOG, {}).length).toBe(MODEL_CATALOG.length);
  });
  it("--tools and --provider narrow correctly", () => {
    expect(filterCatalog(MODEL_CATALOG, { tools: true }).every((m) => m.capabilities.toolCalling)).toBe(true);
    expect(filterCatalog(MODEL_CATALOG, { provider: "anthropic" }).every((m) => m.providerId === "anthropic")).toBe(true);
  });
  it("formatModelCatalog shows the spec + capability tags; empty → a clear message", () => {
    const out = formatModelCatalog(filterCatalog(MODEL_CATALOG, { local: true }));
    expect(out).toContain("ollama/gemma4:12b");
    expect(out).toMatch(/local/u);
    expect(formatModelCatalog([])).toMatch(/No models match/u);
  });
});
