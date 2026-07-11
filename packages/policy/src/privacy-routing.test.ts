import { describe, expect, it } from "vitest";

import { explainRequestPrivacy, resolvePrivacyRoutedModel } from "./privacy-routing.js";

describe("privacy-routing", () => {
  describe("usesTools decisive signal", () => {
    it("classifies a context-free-looking query as personal when usesTools is true", () => {
      const result = explainRequestPrivacy({
        hasPersonalContext: false,
        query: "what's the weather in Paris",
        usesTools: true
      });
      expect(result.classification).toBe("personal");
      expect(result.reason).toContain("tool");
    });

    it("stays context-free for the same query when usesTools is false", () => {
      const result = explainRequestPrivacy({
        hasPersonalContext: false,
        query: "what's the weather in Paris",
        usesTools: false
      });
      expect(result).toEqual({
        classification: "context-free",
        reason: "no personal-context, PII, memory, or possessive signal detected"
      });
    });

    it("stays context-free for the same query when usesTools is omitted (byte-identical to before)", () => {
      const result = explainRequestPrivacy({
        hasPersonalContext: false,
        query: "what's the weather in Paris"
      });
      expect(result).toEqual({
        classification: "context-free",
        reason: "no personal-context, PII, memory, or possessive signal detected"
      });
    });

    it("routes to local when usesTools flips a context-free query", () => {
      const result = resolvePrivacyRoutedModel({
        defaultModel: "local/gemma4:12b",
        env: { MUSE_CLOUD_MODEL: "cloud/model", MUSE_PRIVACY_ROUTING: "true" },
        hasPersonalContext: false,
        query: "what's the weather in Paris",
        usesTools: true
      });
      expect(result.route).toBe("local");
      expect(result.model).toBe("local/gemma4:12b");
    });

    it("routes to cloud for the same query when usesTools is omitted", () => {
      const result = resolvePrivacyRoutedModel({
        defaultModel: "local/gemma4:12b",
        env: { MUSE_CLOUD_MODEL: "cloud/model", MUSE_PRIVACY_ROUTING: "true" },
        hasPersonalContext: false,
        query: "what's the weather in Paris"
      });
      expect(result.route).toBe("cloud");
      expect(result.model).toBe("cloud/model");
    });
  });

  describe("KO colloquial possessive tokens 내꺼/제꺼", () => {
    it("classifies '내꺼 일정 알려줘' as personal", () => {
      const result = explainRequestPrivacy({ hasPersonalContext: false, query: "내꺼 일정 알려줘" });
      expect(result.classification).toBe("personal");
    });

    it("classifies '제꺼 노트 보여줘' as personal", () => {
      const result = explainRequestPrivacy({ hasPersonalContext: false, query: "제꺼 노트 보여줘" });
      expect(result.classification).toBe("personal");
    });

    it("does NOT flag '이 파일 제거해줘' (removal, unaspirated 거) as personal", () => {
      const result = explainRequestPrivacy({ hasPersonalContext: false, query: "이 파일 제거해줘" });
      expect(result.classification).toBe("context-free");
    });

    it("does NOT flag '안내 좀 해줘' (notice, bare 내 mid-word) as personal", () => {
      const result = explainRequestPrivacy({ hasPersonalContext: false, query: "안내 좀 해줘" });
      expect(result.classification).toBe("context-free");
    });

    it("does NOT flag '내용 요약해줘' (content, bare 내 mid-word) as personal", () => {
      const result = explainRequestPrivacy({ hasPersonalContext: false, query: "내용 요약해줘" });
      expect(result.classification).toBe("context-free");
    });
  });

  describe("existing ladder regression guard", () => {
    it("classifies a plain context-free query with no signals as context-free", () => {
      const result = explainRequestPrivacy({ hasPersonalContext: false, query: "what time is it in Tokyo" });
      expect(result.classification).toBe("context-free");
    });

    it("classifies hasPersonalContext: true as personal regardless of query text", () => {
      const result = explainRequestPrivacy({ hasPersonalContext: true, query: "what time is it in Tokyo" });
      expect(result.classification).toBe("personal");
    });
  });
});
