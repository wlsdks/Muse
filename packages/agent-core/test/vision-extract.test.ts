import type { ModelProvider, ModelRequest, ModelResponse } from "@muse/model";
import { describe, expect, it } from "vitest";

import { extractStructuredFromImage } from "../src/vision-extract.js";

function stubProvider(output: string, capture?: (req: ModelRequest) => void): ModelProvider {
  return {
    generate: async (req: ModelRequest): Promise<ModelResponse> => {
      capture?.(req);
      return { id: "x", model: req.model, output };
    },
    id: "stub",
    listModels: async () => [],
    // eslint-disable-next-line require-yield
    stream: async function* () { throw new Error("unused"); }
  } as unknown as ModelProvider;
}

const SCHEMA = { properties: { merchant: { type: "string" }, total: { type: "number" } }, type: "object" } as const;
const input = (over = {}) => ({
  imageBase64: "QkFTRTY0",
  instruction: "Extract the merchant and total from this receipt.",
  mimeType: "image/png",
  model: "ollama/gemma4:12b",
  schema: SCHEMA,
  ...over
});

describe("extractStructuredFromImage", () => {
  it("parses a structured JSON object from the model output", async () => {
    const out = await extractStructuredFromImage(stubProvider('{"merchant":"Acme","total":12.5}'), input());
    expect(out.ok).toBe(true);
    expect(out.data).toEqual({ merchant: "Acme", total: 12.5 });
  });

  it("sends the image attachment, the schema as responseFormat, and temperature 0", async () => {
    let seen: ModelRequest | undefined;
    await extractStructuredFromImage(stubProvider("{}", (r) => { seen = r; }), input());
    expect(seen?.temperature).toBe(0);
    expect(seen?.responseFormat).toEqual(SCHEMA);
    const userMsg = seen?.messages.find((m) => m.role === "user");
    expect(userMsg?.attachments?.[0]).toEqual({ dataBase64: "QkFTRTY0", mimeType: "image/png" });
    // anti-fabrication instruction is present in the system message
    const sys = seen?.messages.find((m) => m.role === "system");
    expect(String(sys?.content)).toMatch(/never guess|OMIT it/u);
  });

  it("fail-soft on non-JSON output (no throw)", async () => {
    const out = await extractStructuredFromImage(stubProvider("I see a receipt from Acme."), input());
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/not valid JSON/u);
    expect(out.raw).toContain("Acme");
  });

  it("rejects a non-object JSON (array / scalar)", async () => {
    expect((await extractStructuredFromImage(stubProvider('["a","b"]'), input())).ok).toBe(false);
    expect((await extractStructuredFromImage(stubProvider('42'), input())).ok).toBe(false);
  });

  it("fail-soft when the provider throws", async () => {
    const throwing = { ...stubProvider("{}"), generate: async () => { throw new Error("ollama down"); } } as ModelProvider;
    const out = await extractStructuredFromImage(throwing, input());
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/ollama down/u);
  });
});
