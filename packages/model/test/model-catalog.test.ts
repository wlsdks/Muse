import { describe, expect, it } from "vitest";

import { MODEL_CATALOG, catalogModelsByCapability, catalogModelsByProvider, findCatalogModel, localCatalogModels, modelSpec } from "../src/index.js";

describe("model catalog — queryable capability index (vs openclaw model-catalog-core, MIT)", () => {
  it("catalogModelsByCapability('vision') returns ONLY vision models (llama3.2 has none → excluded)", () => {
    const vision = catalogModelsByCapability("vision");
    expect(vision.length).toBeGreaterThan(0);
    expect(vision.every((m) => m.capabilities.vision)).toBe(true);
    expect(vision.some((m) => modelSpec(m) === "ollama/llama3.2")).toBe(false);
  });
  it("'local' query == localCatalogModels() and is exactly the no-egress subset", () => {
    const local = catalogModelsByCapability("local");
    expect(local.every((m) => m.capabilities.local)).toBe(true);
    expect(localCatalogModels().map(modelSpec).sort()).toEqual(local.map(modelSpec).sort());
    expect(local.every((m) => m.providerId === "ollama")).toBe(true);
  });
  it("findCatalogModel resolves by <provider>/<model> spec; unknown → undefined", () => {
    expect(findCatalogModel("ollama/gemma4:12b")?.displayName).toMatch(/Gemma/u);
    expect(findCatalogModel("openai/gpt-4o-mini")?.providerId).toBe("openai");
    expect(findCatalogModel("nope/x")).toBeUndefined();
  });
  it("catalogModelsByProvider filters to one provider; unknown provider → []", () => {
    expect(catalogModelsByProvider("ollama").every((m) => m.providerId === "ollama")).toBe(true);
    expect(catalogModelsByProvider("ghost")).toEqual([]);
  });
  it("every entry's modelSpec is consistent with its provider/model ids", () => {
    for (const m of MODEL_CATALOG) expect(modelSpec(m)).toBe(`${m.providerId}/${m.modelId}`);
  });
});
