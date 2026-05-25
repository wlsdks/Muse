import { describe, expect, it } from "vitest";

import { applyClarifyDirective, detectUnderspecifiedRequest } from "../src/index.js";

function ctx(messages: { role: "user" | "assistant" | "system"; content: string }[]) {
  return { input: { messages, model: "test/model" }, runId: "r", startedAt: new Date() };
}

// Muse is this user's personal JARVIS and the user operates in Korean
// (`devqamain`, whole session in 한국어). The clarify-directive — a named
// outbound-safety safeguard against best-guess actions — only matched
// English imperatives, so a contentless Korean command ("보내줘", "그거
// 해줘") sailed through unflagged and the agent could guess an action.
describe("detectUnderspecifiedRequest — Korean contentless imperatives", () => {
  it("flags bare/contentless Korean imperatives", () => {
    for (const t of [
      "해줘",
      "그거 해줘",
      "이거 해줘",
      "그것 처리해줘",
      "보내줘",
      "그거 보내줘",
      "취소해줘",
      "지워줘",
      "삭제해줘",
      "진행해줘",
      "정리해줘",
      "그거 해줘!",
      "해줘."
    ]) {
      expect(detectUnderspecifiedRequest(t).ambiguous, t).toBe(true);
    }
  });

  it("does NOT flag Korean requests that name a real object/topic", () => {
    for (const t of [
      "내일 일정 알려줘",
      "Q3 노트 요약해줘",
      "이메일 보내줘",
      "재무팀에 예산 이메일 보내줘",
      "5시에 회의 잡아줘",
      "그거 이메일로 보내줘"
    ]) {
      expect(detectUnderspecifiedRequest(t).ambiguous, t).toBe(false);
    }
  });

  it("does NOT flag question-marked Korean forms (asking to confirm, not commanding)", () => {
    for (const t of ["해줘?", "그거 보내줘?", "진행해줘?"]) {
      expect(detectUnderspecifiedRequest(t).ambiguous, t).toBe(false);
    }
  });

  it("leaves English detection unchanged", () => {
    expect(detectUnderspecifiedRequest("do it").ambiguous).toBe(true);
    expect(detectUnderspecifiedRequest("summarise the Q3 notes").ambiguous).toBe(false);
  });
});

describe("applyClarifyDirective — Korean", () => {
  it("prepends a clarify directive for a lone contentless Korean imperative", () => {
    const out = applyClarifyDirective(ctx([{ content: "그거 보내줘", role: "user" }]));
    expect(out.messages[0]?.role).toBe("system");
    expect(out.messages[0]?.content).toContain("under-specified");
  });

  it("does NOT fire when a prior assistant turn makes the Korean reply a confirmation", () => {
    const input = ctx([
      { content: "Sam에게 메일을 보낼까요?", role: "assistant" },
      { content: "보내줘", role: "user" }
    ]);
    expect(applyClarifyDirective(input).messages).toEqual(input.input.messages);
  });
});
