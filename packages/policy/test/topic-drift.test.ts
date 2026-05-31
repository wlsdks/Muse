import { describe, expect, it } from "vitest";
import { detectTopicDrift } from "../src/index.js";

describe("topic drift policy", () => {
  it("allows prompts that overlap with configured topic keywords", () => {
    expect(
      detectTopicDrift("Compare RAG retrieval with memory trimming", {
        allowedTopics: [
          {
            id: "muse-runtime",
            keywords: ["rag", "retrieval", "memory", "agent"]
          }
        ]
      })
    ).toMatchObject({
      allowed: true,
      matchedTopicId: "muse-runtime"
    });
  });

  it("blocks prompts that drift away from all configured topics", () => {
    expect(
      detectTopicDrift("Book flights to Paris and find hotel discounts", {
        allowedTopics: [
          {
            id: "muse-runtime",
            keywords: ["rag", "retrieval", "memory", "agent"]
          }
        ]
      })
    ).toEqual({
      allowed: false,
      bestScore: 0,
      matchedKeywords: [],
      matchedTopicId: null,
      reason: "Prompt drifted outside allowed topics: muse-runtime"
    });
  });

  it("allows a score that exactly equals minScore (the threshold is inclusive, >=)", () => {
    // 1 of 5 keywords matched → score 0.2, which equals the default minScore 0.2.
    const decision = detectTopicDrift("the retrieval system", {
      allowedTopics: [{ id: "m", keywords: ["retrieval", "memory", "agent", "grounding", "citation"] }]
    });
    expect(decision.allowed).toBe(true);
    expect(decision.bestScore).toBeCloseTo(0.2);
    expect(decision.matchedTopicId).toBe("m");
  });

  it("when blocked with a PARTIAL match (score>0 but below threshold) it still names the best topic + matched keyword", () => {
    // The same 0.2 score is now below a stricter 0.5 minScore → blocked. But because
    // some keyword DID match, matchedTopicId must be the topic id (not null, which is
    // reserved for a zero-match block) — the `best.score > 0 ? id : null` true side.
    const decision = detectTopicDrift("the retrieval system", {
      allowedTopics: [{ id: "m", keywords: ["retrieval", "memory", "agent", "grounding", "citation"] }],
      minScore: 0.5
    });
    expect(decision.allowed).toBe(false);
    expect(decision.matchedTopicId).toBe("m");
    expect(decision.matchedKeywords).toEqual(["retrieval"]);
    expect(decision.bestScore).toBeCloseTo(0.2);
  });

  it("fails OPEN when no usable topic is configured — drift is a soft policy, not a blanket block", () => {
    // Topic-drift must never block everything just because the caller passed no
    // topics (or only blank-id ones, which are filtered out). An empty/whitespace
    // prompt is likewise allowed. A regression flipping these guards would refuse
    // every conversation that runs without a configured topic list.
    const allowAll = { allowed: true, bestScore: 1, matchedKeywords: [], matchedTopicId: null };
    expect(detectTopicDrift("anything at all", { allowedTopics: [] })).toEqual(allowAll);
    expect(detectTopicDrift("anything at all", { allowedTopics: [{ id: "  ", keywords: ["x"] }] })).toEqual(allowAll);
    expect(detectTopicDrift("   ", { allowedTopics: [{ id: "muse", keywords: ["rag"] }] })).toEqual(allowAll);
  });

  it("does not let a short ASCII keyword match inside unrelated words (was a guard bypass)", () => {
    const opts = { allowedTopics: [{ id: "ml", keywords: ["ai", "rag"] }] };
    // "ai" is inside email/again; "rag" is inside storage/garage —
    // raw substring would score this fully on-topic and disable
    // the drift guard.
    expect(
      detectTopicDrift("please email my friend again about the storage garage", opts).allowed
    ).toBe(false);
    // Genuine whole-word usage still matches.
    const onTopic = detectTopicDrift("the AI uses RAG retrieval", opts);
    expect(onTopic.allowed).toBe(true);
    expect(onTopic.matchedKeywords).toEqual(["ai", "rag"]);
  });

  it("keeps CJK substring matching for agglutinated Korean (particles attach without spaces)", () => {
    expect(
      detectTopicDrift("우선순위를 정리해줘", {
        allowedTopics: [{ id: "m", keywords: ["우선순위"] }]
      }).allowed
    ).toBe(true);
  });

  it("uses Korean tokens and explicit off-topic allowances", () => {
    expect(
      detectTopicDrift("이관 작업의 다음 우선순위를 정리해줘", {
        allowedTopics: [{ id: "migration", keywords: ["마이그레이션", "이관", "우선순위"] }]
      }).allowed
    ).toBe(true);
    expect(
      detectTopicDrift("감사합니다", {
        allowedOffTopicKeywords: ["감사합니다"],
        allowedTopics: [{ id: "migration", keywords: ["마이그레이션", "이관"] }]
      }).allowed
    ).toBe(true);
  });
});
