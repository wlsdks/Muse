/**
 * Surface-level prompts that are COMPOSED rather than built: each one
 * calls `composeSurfacePrompt`, so this module sits above both
 * `compose.ts` and `system-prompt.ts` in the import graph. They live
 * here rather than in `index.ts` because the barrel must stay a pure
 * re-export hub — a top-level `composeSurfacePrompt(...)` call inside
 * `index.ts` executed during a partially-initialised module and only
 * worked because the marker it needed happened to be declared above it.
 */

import { composeSurfacePrompt } from "./compose.js";

export interface PlanningPromptInput {
  readonly userPrompt: string;
  readonly toolDescriptions: string;
  readonly basePrompt?: string;
  /**
   * A worked plan from a similar PAST request, injected as a few-shot
   * exemplar so a small local model produces a better one-shot plan
   * (Agentic Plan Caching, arXiv 2506.14852 — reuse past plan structure).
   * Pre-rendered by the caller; omitted ⇒ no exemplar section.
   */
  readonly priorPlanExemplar?: string;
}

export function buildPlanningSystemPrompt(input: PlanningPromptInput): string {
  const segments: string[] = [];

  segments.push("[Available Tools]");
  segments.push("아래 도구만 계획에 포함할 수 있습니다.");
  segments.push("목록에 없는 도구는 사용할 수 없습니다.");
  segments.push("");
  segments.push(input.toolDescriptions);
  segments.push("");
  segments.push("[Output Format]");
  segments.push("반드시 JSON 배열만 출력하세요. 다른 텍스트, 설명, 마크다운은 금지합니다.");
  segments.push("각 단계는 다음 필드를 포함합니다:");
  segments.push("- tool: 도구 이름 (Available Tools에 있는 것만)");
  segments.push("- args: 도구에 전달할 인자 (객체)");
  segments.push("- description: 이 단계의 목적 (간단한 한국어 설명)");
  segments.push("");
  segments.push("예시:");
  segments.push(
    '[{"tool":"jira_get_issue","args":{"issueKey":"EXAMPLE-1"},"description":"이슈 상세 조회"},'
  );
  segments.push(
    ' {"tool":"confluence_search_by_text","args":{"keyword":"온보딩 가이드"},"description":"관련 문서 검색"}]'
  );
  segments.push("");
  segments.push("[Constraints]");
  segments.push("1. 도구가 필요 없으면 빈 배열 []을 반환하세요.");
  segments.push("2. 단계 순서는 실행 순서입니다. 의존 관계를 고려하세요.");
  segments.push("3. 동일 도구를 다른 인자로 여러 번 호출할 수 있습니다.");
  segments.push("4. 각 단계의 args는 해당 도구의 입력 스키마에 맞춰야 합니다.");
  segments.push("5. 응답은 [ 로 시작하고 ] 로 끝나야 합니다.");
  if (input.priorPlanExemplar && input.priorPlanExemplar.trim().length > 0) {
    segments.push("");
    segments.push("[Similar Past Plan]");
    segments.push("이전에 비슷한 요청을 아래 계획으로 처리했습니다. 구조가 맞으면 참고하되,");
    segments.push("현재 요청에 맞게 도구와 인자를 반드시 다시 맞추세요 (그대로 복사 금지).");
    segments.push(input.priorPlanExemplar.trim());
  }

  segments.push("");
  segments.push("[User Request]");
  segments.push(input.userPrompt);

  // The diagnostic model provider (packages/model/src/provider-diagnostic.ts,
  // `isDiagnosticPlanningPrompt`) recognizes a planning turn by the literal
  // "[Role]" marker alongside "[Output Format]"/"[Available Tools]" (both
  // still emitted above) — smoke:broad and several plan-execute tests depend
  // on that detection, so the marker travels as its own stable layer ahead of
  // the planning role text rather than disappearing with the old [Role] block.
  return composeSurfacePrompt("planning", {
    basePrompt: input.basePrompt,
    providerDynamicSuffix: segments.join("\n")
  }, {
    layers: [{ content: "[Role]", id: "planning-role-marker", section: "stable" }]
  });
}


/**
 * System prompt for `today --brief` (and the web's TodayBriefPanel).
 * Both the CLI and the web console fold this verbatim into the
 * user-message body sent to /api/chat (or, for the CLI's `--local`
 * mode, into the system message of an agentRuntime.run call). Lift
 * here so the two surfaces don't drift on tone / priority order.
 */
export const TODAY_BRIEF_SYSTEM_PROMPT = composeSurfacePrompt("brief", {});

/**
 * Compose the user-message body that pairs the system prompt above
 * with a structured TodayBriefing JSON payload. Used by callers that
 * post to /api/chat (which has no system-message slot) so the
 * priority/locale guidance ships in-band.
 */
export function buildTodayBriefUserMessage(briefing: unknown): string {
  return `${TODAY_BRIEF_SYSTEM_PROMPT}\n\nBriefing JSON:\n${JSON.stringify(briefing, null, 2)}\n\nRender this as a short conversational morning brief.`;
}
