# Native Web Search — Design Spec

Status: **draft — pending user approval**
Iteration target: 1 (large; big-bang OpenAI Responses migration bundled)
Last updated: 2026-05-11

## 1. Goal

세 호스팅 LLM 공급자(OpenAI · Anthropic · Gemini)의 **서버사이드 `web_search` 도구**를 Muse 코어가 기본 활성으로 노출. 사용자가 별도 검색 API 키 가입 없이, 이미 가진 LLM 키 하나로 JARVIS가 웹을 검색·인용함.

행아님이 openclaw + codex 조합에서 경험한 "별 설정 없이 검색됨" 동작을 Muse에서 재현하는 것이 1차 검증 기준.

## 2. Non-goals

- 3rd-party 검색 어댑터 (Tavily / Brave / Exa) — 후속 이터.
- 로컬 모델(Ollama) 용 fallback 검색 — 후속.
- 인라인 마크다운 각주 자동 합성 — 클라이언트에 일임 (`citations[]`를 사용).
- 검색 결과 캐싱 — 호스팅 공급자가 자체 처리.
- 비용 추정/하드 캡 — observability에 노출하되 강제 제한은 후속.
- Gemini Vertex(별도 인증 경로) 분기 — 이번 이터는 generative-language API만.

## 3. Decisions Recap (brainstorming 결과)

| 항목 | 결정 |
|---|---|
| 활성화 | **default-on + kill switch** (env `MUSE_WEB_SEARCH=off` 또는 `runtime-settings.json` `webSearch.enabled=false`) |
| 어댑터 스코프 | **OpenAI Responses + Anthropic + Gemini 세 개 모두** |
| OpenAI API | **Chat Completions → Responses API 완전 마이그레이션** (big-bang) |
| 출처 노출 | `citations[]` 공통 필드로 정규화 |
| 스트리밍 이벤트 | 검색 start/finish만 SSE `tool_call`로 합성 노출 |
| 라이센스/저작 | openclaw MIT — 패턴만 참고, 코드 복사 0 |

## 4. Architecture

### 4.1 레이어 (변경 부위)

```
apps/api               /api/chat, /api/chat/stream
  - request: metadata.tools.web_search? (override)
  - response: citations[]
  - SSE: event:"tool_call" {name:"web_search", phase:"started"|"finished"}
        event:"citations" data:[...]
       │
packages/agent-core    정책 평가, citation sanitiser, SSE 합성 릴레이
       │
packages/model         provider-wire.ts 의 to*/from*/parse* 함수들
  - OpenAI:    NEW Responses API path (Chat Completions 삭제)
  - Anthropic: web_search_20250305 도구 주입 + 응답 파싱
  - Gemini:    googleSearch / googleSearchRetrieval 분기
       │
packages/runtime-settings
  - webSearch: { enabled: boolean; maxUses?: number }
  - env: MUSE_WEB_SEARCH=off|on, MUSE_WEB_SEARCH_MAX_USES=N
```

**보존 원칙**:
- `agent-core`는 여전히 공급자 SDK 모름 — 정규화된 `citations[]`만 다룸.
- 가드는 fail-close — 활성화 정책은 결정론적 코드, 프롬프트 아님.
- 도구 출력 untrusted — `citations[].url`은 sanitiser 통과 후 노출.

### 4.2 타입 추가 (`packages/model/src/index.ts`)

```ts
export interface WebSearchCitation {
  url: string;        // http(s) only, sanitised
  title: string;
  snippet?: string;
  providerRaw?: unknown;  // opaque, for debugging / future use
}

export interface ModelResponse {
  // ... 기존 필드
  citations?: WebSearchCitation[];
}

export type ModelEvent =
  | { type: "text_delta"; delta: string }
  | { type: "tool_call_started"; name: string }     // NEW
  | { type: "tool_call_finished"; name: string; count?: number }  // NEW
  | { type: "citations"; items: WebSearchCitation[] }  // NEW
  | { type: "done"; usage: ModelUsage };
```

### 4.3 정책 함수 (`packages/model/src/provider-wire.ts`)

```ts
export interface WebSearchPolicy {
  enabled: boolean;
  maxUses?: number;
}

export function decideWebSearchPolicy(args: {
  model: { provider: string; modelId: string };
  settings: { webSearch?: { enabled?: boolean; maxUses?: number } };
  override?: boolean;       // metadata.tools.web_search
  env?: NodeJS.ProcessEnv;  // for MUSE_WEB_SEARCH / MAX_USES
}): WebSearchPolicy;
```

진리표 (env > override > settings, override는 settings를 누름):

| env | override | settings.enabled | 결과 |
|---|---|---|---|
| `off` | * | * | disabled |
| `on` / unset | true | * | enabled |
| `on` / unset | false | * | disabled |
| `on` / unset | undefined | true / unset | enabled |
| `on` / unset | undefined | false | disabled |

## 5. Provider Wire Changes

### 5.1 OpenAI — Chat Completions → Responses API

**삭제**: `toOpenAIChatRequest`, `fromOpenAIChatResponse`, `parseOpenAIStream`

**신규**:
- `toOpenAIResponsesRequest(request, defaultModel, policy)`:
  - `model`, `input` 배열 (messages 변환), `tools[]`
  - `policy.enabled` 일 때 `tools.push({ type: "web_search" })`
  - 기존 function-tool들은 `{ type: "function", function: {...} }` 모양으로 변환
- `fromOpenAIResponsesResponse(payload)`:
  - `output[]` 순회. `type:"message"` → `content[].text` 누적, `content[].annotations[]` → citations 추출 (`url_citation` 항목)
  - `type:"web_search_call"` 항목 → 메타 (count) 보관
- `parseOpenAIResponsesStream(stream)`:
  - SSE 이벤트 핸들: `response.output_text.delta`, `response.output_item.added` (web_search_call 시작), `response.output_item.done` (web_search_call 끝), `response.completed`
  - 합성 `tool_call_started` / `tool_call_finished` / `citations` 발행

### 5.2 Anthropic — Messages API 유지, 도구 주입

**수정**:
- `toAnthropicRequest`: `policy.enabled`일 때 `tools.push({ type: "web_search_20250305", name: "web_search", max_uses: policy.maxUses ?? 5 })`
- `fromAnthropicResponse`: `content[]` 순회
  - `type:"web_search_tool_result"` → `content[].url/title` 수집
  - `type:"text"` 블록의 `citations[]` (Anthropic이 텍스트에 인라인으로 붙임) → 정규화
  - `encrypted_content`는 **drop**
- `parseAnthropicStream`: `server_tool_use` content_block_start 시 `tool_call_started` 합성, `content_block_stop` 시 `tool_call_finished`

### 5.3 Gemini — generateContent 유지, 도구 주입 + 분기

**수정**:
- `toGeminiRequest`: 모델 가족 분기
  - `modelId.startsWith("gemini-1.5")` → `tools.push({ googleSearchRetrieval: {} })`
  - 그 외 (`gemini-2.*`, 미래 `gemini-3.*`) → `tools.push({ googleSearch: {} })`
- `fromGeminiResponse`: `candidates[0].groundingMetadata?.groundingChunks?.[].web` → `{ url: web.uri, title: web.title }`
- `parseGeminiStream`: grounding metadata가 final chunk에만 옴 → 마지막 chunk에서 `tool_call_started` + `tool_call_finished` + `citations` 한꺼번에 합성 (best-effort)

## 6. Data Flow

### 6.1 Request
```
client → apps/api → agent-core
  → decideWebSearchPolicy(model, settings, override, env)
  → provider-wire to*Request(request, policy) → payload with tools
  → HTTP fetch
```

### 6.2 Response (non-streaming)
```
provider response
  → provider-wire from*Response → { text, citations[], usage }
  → agent-core sanitiseCitations() → http(s)만 통과, 데이터/javascript URL drop
  → apps/api → { text, citations, usage }
```

### 6.3 Response (streaming)
```
provider SSE
  → provider-wire parse*Stream emits ModelEvent[]
  → agent-core relay
  → apps/api SSE writes:
      event: text         data: {delta}            (반복)
      event: tool_call    data: {name, phase:"started"}    (1회)
      event: tool_call    data: {name, phase:"finished", count}  (1회)
      event: citations    data: [...]                            (1회, finish 직전)
      event: done         data: {usage}
```

## 7. Error Handling

| 상황 | 동작 |
|---|---|
| 공급자 web_search 자체 실패 (Anthropic `is_error:true` 등) | trace 기록, `citations:[]` 반환, 본문은 모델 생성 그대로 유지 (best-effort) |
| 모델이 web_search 미지원 → 4xx | `ModelProviderError.retryable=false`, fail-fast. 사용자에 "이 모델은 web_search 미지원" 메시지 |
| kill switch on + override=true | override 우선, trace에 `policy_override:true` |
| Gemini 모델 가족 식별 실패 | 보수적 1.5 형태(`googleSearchRetrieval`), 경고 로그 |
| Responses SSE 파싱 실패 | 즉시 throw, 스트림 종료 (α 전략: 빠른 실패) |
| citation URL이 sanitiser 차단 | 해당 항목만 drop, 본문 유지, trace에 drop count |

## 8. Settings & Config

`packages/runtime-settings`에 추가:

```jsonc
// ~/.muse/runtime-settings.json
{
  "webSearch": {
    "enabled": true,        // default
    "maxUses": 5            // Anthropic용; OpenAI/Gemini는 ignored
  }
}
```

env 우선순위:
- `MUSE_WEB_SEARCH=off` → 전체 비활성
- `MUSE_WEB_SEARCH_MAX_USES=N` → maxUses 오버라이드

요청별 override:
```http
POST /api/chat
{ "message": "...", "metadata": { "tools": { "web_search": true } } }
```

`muse setup` 출력에 현재 effective 정책 1줄 추가:
```
✓ Web search: enabled (maxUses 5, source: default)
```

## 9. UI Surfaces

### apps/cli
- chat 출력 포맷터: `citations.length > 0`일 때 본문 뒤 `Sources:\n  [1] title — url\n  [2] ...` 합성.
- `muse chat --no-web-search` 플래그 (요청 단위 override=false 전송).

### apps/web
- assistant 메시지 아래 citation 칩 컴포넌트 (`[N] title` 칩 + hover 시 URL preview).
- Settings 패널: `webSearch.enabled` 토글, `maxUses` 입력.
- 채팅 스트림에서 `tool_call` 이벤트 → "🔍 Searching..." inline indicator.

## 10. Testing

### 10.1 단위 (가장 좁은 단위 먼저)

`packages/model/src/provider-wire.test.ts`:
- `toOpenAIResponsesRequest` × enabled/disabled
- `toAnthropicRequest` × enabled/disabled × maxUses
- `toGeminiRequest` × 1.5 / 2.x 분기
- `fromOpenAIResponsesResponse` (fixture)
- `fromAnthropicResponse` (fixture, encrypted_content drop 검증)
- `fromGeminiResponse` (fixture)
- `parse*Stream` × 3 (fixture SSE)
- `decideWebSearchPolicy` 진리표 8개 case

`packages/agent-core` unit:
- `sanitiseCitations` — `javascript:` / `data:` / 빈 URL drop, `https://` keep
- SSE 합성 — provider events → expected ModelEvent sequence

`packages/runtime-settings` unit:
- env truth table
- default `enabled: true`

### 10.2 Snapshot fixtures

`packages/model/__fixtures__/web-search/`:
- `openai-responses.json` (실 API 1회 캡처)
- `anthropic-messages.json` (실 API 1회 캡처)
- `gemini-generate-content.json` (실 API 1회 캡처)

응답 모양 drift → unit test 즉시 fail.

### 10.3 통합

`apps/api` test:
- POST `/api/chat` (mock provider) → `citations[]` in body
- GET `/api/chat/stream` (mock provider) → SSE에 `tool_call` + `citations` 이벤트 순서대로 발행

### 10.4 Smoke

`smoke:broad` (diagnostic provider, +3 cases):
- 응답 스키마에 `citations` 필드 존재 (diagnostic은 빈 배열)
- SSE에 `tool_call` 이벤트 존재 (diagnostic이 합성)
- `MUSE_WEB_SEARCH=off`일 때 정책 적용 검증

`smoke:live` (실 LLM key 있을 때):
- OpenAI: "What's today's top tech news?" → `citations.length > 0`
- Anthropic: 동일
- Gemini: 동일
- **머지 차단 게이트** — 한 공급자라도 fail 시 merge 금지

### 10.5 Lint
`pnpm lint` 0 errors / 0 warnings (Muse 룰 그대로).

## 11. Rollout

**커밋 시퀀스 (한 PR, bisect 가능)**:
1. `test: capture web_search response fixtures for OpenAI/Anthropic/Gemini`
2. `feat(model)!: migrate OpenAI adapter Chat Completions → Responses API`
3. `feat(model): wire native web_search on OpenAI/Anthropic/Gemini, default-on`
4. `feat(api): expose citations + tool_call SSE events`
5. `feat(cli,web): render citations and add kill-switch toggle`
6. `docs: CHANGELOG breaking notice + architecture.md update`

**`CHANGELOG.md [Unreleased]` 항목**:
> ⚠ Breaking — OpenAI 어댑터가 Chat Completions에서 Responses API로 마이그레이션됨. 동시에 OpenAI / Anthropic / Gemini 세 공급자에서 서버사이드 web_search가 기본 활성화. 끄려면 `MUSE_WEB_SEARCH=off` 환경변수 또는 `runtime-settings.json`에 `webSearch.enabled=false`.

**문서 갱신**:
- `.claude/rules/architecture.md`: "Required provider families" 섹션에 OpenAI = Responses API 명시.
- `README.md` / `README.ko.md` quickstart: web_search 기본 활성 1줄.

## 12. Residual Risks

| 리스크 | 경감 |
|---|---|
| Responses SSE 모양 다름 → 기존 OpenAI 사용자 즉시 깨짐 | smoke:live 머지 차단 게이트 + 실 API fixture snapshot 잠금 |
| Gemini grounding 스키마 region/version 변동 | 방어 파싱 (`?.web?.uri`), 누락 시 empty citations |
| Responses 레이트리밋 헤더 모양 변경 | `packages/resilience`에 retry-after 파싱 점검 항목 추가 |
| 토큰 비용 1일차 스파이크 | observability 대시보드 모니터링, CHANGELOG 사전 공지 |
| Anthropic `encrypted_content` 누수 | 정규화 시 drop, trace에 size만 |
| 도구 루프 budget이 server-side web_search에 적용 안 됨 | 의도된 동작 — 공급자가 자체 제한, 명시 |

## 13. Success Criteria

머지 가능 조건 (전부 동시 만족):
- `pnpm check` green
- `pnpm smoke:broad` 50/50 PASS (기존 47 + 신규 3)
- `OPENAI_API_KEY ANTHROPIC_API_KEY GEMINI_API_KEY pnpm smoke:live` 세 공급자 모두 `citations.length > 0` PASS
- `pnpm lint` 0 errors / 0 warnings
- 행아님 dogfood: "Muse에 '오늘 뉴스' 물어보면 출처와 함께 답함" 1회 통과

## 14. Out-of-spec / Follow-up Iterations

- **다음 이터**: Tavily 어댑터 추가 (Gemini/Ollama 사용자용 fallback)
- **다음 이터**: 인라인 마크다운 각주 자동 합성 토글
- **이후**: Vertex AI 경로 분기 (Gemini), Bedrock 경로 (Anthropic), Azure 경로 (OpenAI)
- **이후**: 비용 하드 캡 (user-level monthly quota)
