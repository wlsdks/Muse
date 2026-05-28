import { type ModelProvider } from "@muse/model";
import { describe, expect, it } from "vitest";

import {
  detectCorrections,
  distillStrategyFromCorrection,
  type SessionTurnLine
} from "../src/index.js";

const t = (role: "user" | "assistant", content: string): SessionTurnLine => ({ content, role });

describe("detectCorrections — reliable failure signal (ReasoningBank 2509.25140; no LLM self-judge per 2404.17140)", () => {
  it("detects a Korean correction turn that follows an assistant answer", () => {
    const turns = [
      t("user", "회의록 정리해줘"),
      t("assistant", "회의록을 문단으로 정리했습니다: ..."),
      t("user", "그게 아니라 불릿으로 정리해줘")
    ];
    const out = detectCorrections(turns);
    expect(out).toHaveLength(1);
    expect(out[0]!.correction).toContain("불릿");
    expect(out[0]!.priorAnswer).toContain("문단으로");
    expect(out[0]!.request).toContain("회의록 정리");
  });

  it("detects an English correction", () => {
    const turns = [
      t("user", "summarise the notes"),
      t("assistant", "Here is a prose summary ..."),
      t("user", "no, that's not what I meant — use bullet points")
    ];
    const out = detectCorrections(turns);
    expect(out).toHaveLength(1);
    expect(out[0]!.correction).toContain("bullet");
  });

  it("does NOT treat a satisfied/neutral follow-up as a correction", () => {
    const turns = [
      t("user", "summarise the notes"),
      t("assistant", "Here is the summary ..."),
      t("user", "no problem, thanks! can you also email it?")
    ];
    expect(detectCorrections(turns)).toHaveLength(0);
  });

  it("ignores a correction-like first turn with no prior assistant answer", () => {
    expect(detectCorrections([t("user", "that's wrong, fix the build")])).toHaveLength(0);
  });

  it("caps the number of exchanges", () => {
    const turns = [
      t("user", "a"), t("assistant", "A1"), t("user", "아니 다시 해"),
      t("assistant", "A2"), t("user", "틀렸어 다시"),
      t("assistant", "A3"), t("user", "그게 아니라 이렇게")
    ];
    expect(detectCorrections(turns, { maxExchanges: 2 })).toHaveLength(2);
  });
});

function stubProvider(output: string): ModelProvider {
  return {
    id: "stub",
    async generate() { return { id: "r", model: "m", output }; },
    async listModels() { return []; },
    async *stream() {}
  };
}

describe("distillStrategyFromCorrection — corrected exchange → one generalized strategy (ReasoningBank 2509.25140)", () => {
  const exchange = {
    correction: "그게 아니라 불릿으로 정리해줘",
    priorAnswer: "회의록을 문단으로 정리했습니다",
    request: "회의록 정리해줘"
  };

  it("parses a strategy + tag from the model output", async () => {
    const provider = stubProvider("strategy: when asked to summarise, use bullet points not prose\ntag: notes");
    const out = await distillStrategyFromCorrection(exchange, { model: "m", modelProvider: provider });
    expect(out?.text).toContain("bullet points");
    expect(out?.tag).toBe("notes");
  });

  it("omits the tag when the model emits '-' or no tag line", async () => {
    const out = await distillStrategyFromCorrection(exchange, {
      model: "m",
      modelProvider: stubProvider("strategy: keep replies terse\ntag: -")
    });
    expect(out?.text).toBe("keep replies terse");
    expect(out?.tag).toBeUndefined();
  });

  it("returns undefined on empty / unparseable output (fail-soft)", async () => {
    expect(await distillStrategyFromCorrection(exchange, { model: "m", modelProvider: stubProvider("") })).toBeUndefined();
    expect(await distillStrategyFromCorrection(exchange, { model: "m", modelProvider: stubProvider("sorry I cannot") })).toBeUndefined();
  });

  it("returns undefined when the provider throws (fail-soft)", async () => {
    const provider: ModelProvider = {
      id: "boom",
      async generate() { throw new Error("model down"); },
      async listModels() { return []; },
      async *stream() {}
    };
    expect(await distillStrategyFromCorrection(exchange, { model: "m", modelProvider: provider })).toBeUndefined();
  });
});
