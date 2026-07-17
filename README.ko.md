# Muse

> **기준 문서는 [영문 README](README.md)입니다.** 이 한국어 문서는 요약본이며 갱신이
> 늦을 수 있습니다 — 기능·검증·경계의 최신 상태는 영문 README를 보세요.

> **Muse는 한 사람의 삶과 일을 계속 이해하고, 언제 어떻게 도울지 점점 더 잘 맞추는 개인 AI를 만들고 있습니다.**

Muse의 전체 모습은 업무 도우미보다 넓다. 한 사람의 일상·관계·환경·일을 계속 이해하고,
기억과 도구를 이어서 필요할 때 돕는 지속적인 개인 에이전트를 목표로 한다. 이 과정에서 언제
조용히 있고 어떤 도움이 잘 맞는지 배우는 방식을 **Attunement(조율)**라고 부른다. 어려운 말
같지만 뜻은 “나와 함께 지내고 일하는 법을 배운다”에 가깝다.

첫 번째 증명점은 **Personal Continuity(삶의 맥락 이어주기)**다. 하다 만 프로젝트뿐 아니라
병원 예약, 여행 준비, 연락하려던 사람, 읽던 글처럼 삶에 남아 있는 일을 처음부터 다시
찾지 않고 이어가게 돕는다. 첫 버전에서는 사용자가 이어갈 주제와 관련 Muse 항목을 직접
고른다. 자동으로 알아채는 기능은 그다음이다. 이제 첫 로컬 CLI 경로는 쓸 수 있다. life/work thread를 만들고 정확한 로컬 할 일·노트를
연결한 뒤 `muse continue`를 실행하고 결과를 직접 기록한다. 자동 감지·타이밍·관찰은 다음 단계다.
**업무 복귀(Work Resumption)**는 그중 업무에 특화된 사용법이지 Muse 전체가 아니다.

| 지금 제공하는 토대 | 앞으로 연결할 것 |
| --- | --- |
| 개인 기억, 출처가 보이는 회상, 로컬 개인 저장소, 사용자가 켜는 주변 맥락, 알림 예산, 승인형 브라우저 행동, 실행 기록, 첫 Personal Continuity CLI | 더 많은 자료원, opt-in 관찰 → 알맞은 타이밍 → 다음 도움 개선 |

자세한 내용: [제품 방향](docs/strategy/attunement.md) · [구현 순서](docs/goals/attunement-implementation-plan.md)

## 다섯 가지 원칙

1. **나와 함께 지내고 일하는 법을 배운다.**
   나에 대한 정보만 저장하는 것이 아니라, 언제 조용히 있고 어떤 도움이 잘 맞는지 배우는 것이
   목표다. 이 전체 학습 순환은 아직 개발 중이다.

2. **모델과 데이터의 경계를 내가 고른다.**
   로컬 모델과 클라우드 모델을 모두 쓸 수 있다(provider-neutral). 클라우드 키가 있으면 해당
   모델이 선택될 수 있다. 기기 밖으로 모델 요청을 보내지 않으려면 `MUSE_LOCAL_ONLY=true`를
   켠다. 개인 파일 저장소는 기본적으로 로컬이다.

3. **개인 데이터를 쓸 때 근거를 보여준다.**
   근거 기반 회상 등 지원되는 경로는 실제 출처를 붙이고, 약한 근거는 낮추며, 잘못된 인용은
   거부한다(grounding). 다만 모든 대화 문장을 완벽하게 검증하는 것은 아직 아니다.

4. **내 교정을 다음번에 반영한다.**
   잘 맞은 전략은 강화하고, 틀렸다고 교정한 추론 전략은 보수적으로 줄이며, 하지 말라는 것은
   기억한다. 사용자가 직접 쓴 규칙을 몰래 바꾸지 않는다.

5. **밖으로 행동하기 전에는 보여준다.**
   다른 사람에게 보내는 메시지나 외부 행동은 먼저 초안을 보여주고 확인을 받는다(draft-first).
   금융·송금은 영구히 범위 밖이다.

**빠른 시작:** `muse onboard`가 설치부터 첫 출처 인용 답변까지 다음 명령을 안내한다.

```bash
# Personal Continuity — 내가 고른 삶/업무 주제와 정확한 로컬 자료만 연결한다.
muse thread start "생일 준비" --kind life
muse thread link <thread-id> note birthday.md --role context
muse thread link <thread-id> task <task-id> --role next-step
muse continue <thread-id>
muse thread outcome <delivery-id> used
```

[English README →](README.md)

## 지금 Muse가 제공하는 토대

Muse는 한 사람의 일상과 일을 위한 개인 에이전트다. 개인 메모·할일·일정·기억을 다루고,
로컬 또는 클라우드 모델을 같은 런타임에서 선택해
쓸 수 있다. 현재 강점은 기억·회상·도구·승인·기록이며, Attunement는 이 토대를 실제 일상과
업무의 흐름에 연결하려는 다음 제품 방향이다. 업무는 그중 한 영역이다. 내부 구조:

- **벤더 중립 코어.** OpenAI, Anthropic, Google Gemini, OpenRouter,
  Ollama, LM Studio, 그리고 OpenAI-compatible 엔드포인트가 모두
  하나의 `ModelProvider` 어댑터 뒤에 위치한다. 런타임은 추상화만
  호출하고, 벤더 SDK를 직접 부르지 않는다.
- **Tool & MCP 우선.** 도구는 read / write / execute 위험 등급을 가지며,
  Muse의 개인용 도구와 외부 MCP 서버를 같은 방식으로 연결한다.
- **개인 도메인 프리미티브.** 마크다운 노트, 5개 공급자 (로컬
  파일 / Local-ICS / Google Calendar / CalDAV / macOS Calendar.app)에 걸친
  캘린더 이벤트, todo 리스트 — 기본적으로 모두 로컬에 저장되며
  에이전트가 질의 가능하고 CLI / Web UI에서도 편집 가능하다.
- **멀티 에이전트 오케스트레이션.** Sequential / parallel worker
  fan-out, 인메모리 cross-agent 메시지 버스, 전체 conversation
  스냅샷이 포함된 per-run 히스토리, 집계 통계 — 모두 HTTP와
  SSE로 노출된다.
- **결정론적 안전성.** Guard는 fail-close, hook은 fail-open이며
  보안 로직은 코드에만 존재한다 (프롬프트 지시가 아니다). 도구
  출력은 sanitise 전까지 신뢰하지 않는다. 위험한 로컬 실행은 별도
  Rust 러너 프로세스 (`crates/runner`)를 통해서만 수행한다.

## 아키텍처 개요

```
apps/
  api/        Fastify API 서버 (chat, agent specs, multi-agent, MCP,
              scheduler, calendar, tasks)
  cli/        터미널 에이전트 (commander + Ink TUI + setup wizard)
  web/        React UI (chat + tasks + calendar + settings)

packages/
  agent-core/         ReAct + Plan-Execute 루프, guard 파이프라인,
                      hook 레지스트리, context transforms, model loop
  model/              ModelProvider 인터페이스와 공급자 wire-format
                      어댑터 (OpenAI / Anthropic / Gemini / OpenRouter /
                      Ollama + OpenAI-호환 프리셋: Groq / DeepSeek /
                      Together / Mistral / Moonshot / Cerebras)
  tools/              tool 레지스트리, executor, sanitiser, 승인 경로
  multi-agent/        SupervisorAgent, MultiAgentOrchestrator,
                      메시지 버스, 히스토리
  mcp/                MCP 트랜스포트와 loopback 서버들 (notes /
                      tasks / calendar 포함) + NotesProvider 추상화
  calendar/           CalendarProvider 추상화 +
                      Local / Local-ICS / Google / CalDAV / macOS 어댑터 +
                      chmod-600 자격증명 저장소
  policy/             input / output guard, 승인 정책,
                      adversarial red-team
  memory/             컨텍스트 트리밍, 대화 요약, user-memory
                      저장소 + 자동 추출 hook
  observability/      tracing, latency / token-cost 쿼리,
                      JARVIS 스냅샷
  runtime-state/      run history, hook trace, approval 저장소
  db/                 Kysely 스키마 + SQL 마이그레이션
  scheduler/          cron 잡 + 분산 락
  ...

crates/
  runner/             Rust 샌드박스: shell / process / file 실행
```

## 빠른 시작

```bash
# 요구사항: Node.js >= 22.12 (24 LTS 권장) + pnpm 10
pnpm install
pnpm build
pnpm test

# 실제 공급자로 API 띄우기:
GEMINI_API_KEY=… MUSE_MODEL=gemini/gemini-2.0-flash MUSE_MODEL_PROVIDER_ID=gemini \
  pnpm --filter @muse/api dev

# 호출:
curl -X POST http://127.0.0.1:3030/api/chat \
  -H 'content-type: application/json' \
  -d '{"message":"몇 시야? 도구 써."}'

# CLI로 호출:
node apps/cli/dist/index.js \
  --api-url http://127.0.0.1:3030 \
  chat "몇 시야? 도구 써."

# Web UI:
pnpm --filter @muse/web dev   # http://localhost:5173
```

OpenAI / Anthropic / Gemini는 네이티브 웹 검색이 기본 활성. 응답에
`citations[]`가 포함되고, `MUSE_WEB_SEARCH=off`로 끌 수 있다.

## 개인 도메인 도구

에이전트는 personal-pivot loopback MCP 서버 3종을 탑재한다.
기본은 모두 JSON / 마크다운 파일 기반:

- **`muse.notes.*`** — `~/.muse/notes/` 디렉토리(또는
  `MUSE_NOTES_DIR`이 가리키는 곳, Obsidian vault도 가능)의 마크다운
  노트. 도구: list / read / search / save / append.
- **`muse.tasks.*`** — `~/.muse/tasks.json`의 todo 리스트. 도구:
  add / list / complete / search.
- **`muse.calendar.*`** — 4개 어댑터를 가진 공급자 중립 캘린더
  (Local 파일 → `~/.muse/calendar.json`, Google Calendar OAuth,
  iCloud / Fastmail / Proton용 CalDAV, macOS Calendar.app).
  도구: providers / list / add / update / delete.

캘린더 공급자 인터랙티브 셋업:

```bash
muse setup calendar   # Local / Local-ICS / Google / CalDAV / macOS multi-select
                      # OAuth + app-password 플로우; chmod-600 자격증명
```

또는 환경변수로 (`MUSE_CALENDAR_PROVIDERS=local,gcal`,
`MUSE_GCAL_CLIENT_ID`/`SECRET`/`REFRESH_TOKEN`,
`MUSE_CALDAV_URL`/`USERNAME`/`APP_PASSWORD`,
`MUSE_MACOS_CALENDAR_NAME`).

### 공급자 라이브 검증 상태

| Provider | 상태 | 검증 범위 |
| --- | --- | --- |
| `muse.notes` (LocalDir) | `live` | smoke:live `muse.notes.search` Gemini → fs grep |
| `muse.tasks` (Local) | `live` | smoke:live `muse.tasks.add` + unit 라이프사이클 (add/list/complete/search) |
| `muse.calendar` Local | `live` | smoke:live `muse.calendar.add` + 20개 unit 테스트 |
| `muse.calendar` Google | `scaffold` | OAuth refresh-token 플로우 + REST v3; 사용자 발급 OAuth client로 라이브 검증 가능 |
| `muse.calendar` CalDAV | `scaffold` | REPORT/PUT/DELETE iCalendar; iCloud / Fastmail / Proton 앱 비번 필요 |
| `muse.calendar` macOS | `scaffold` | osascript 래퍼; 첫 호출 시 시스템 권한 prompt |
| `NotesProvider` Apple | `stub` | 인터페이스만 정의. osascript 어댑터 구현되면 라이브 |
| `NotesProvider` Notion | `stub` | 인터페이스만 정의. api.notion.com 어댑터 구현되면 라이브 |

## 검증

테스트만이 검증의 유일한 방식이다. 저장소는 다음 게이트를
제공한다:

```bash
pnpm check                                      # 모든 workspace의 build + test (27개 패키지, 수천 개 테스트)
pnpm smoke:broad                                # 51개 HTTP 검사, diagnostic provider
pnpm smoke:live                                 # 12개 HTTP 엔드포인트, 실 LLM (키 없으면 자동 skip)
```

`smoke:live`는 사용 가능한 첫 번째 `*_API_KEY` (`GEMINI_API_KEY`,
`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`)로 실행되며, 직접 chat,
스트리밍 SSE, plan-execute, input guard, multi-agent
오케스트레이션, `muse.notes.search`, `muse.tasks.add`,
`muse.calendar.add`까지 model→tool→model 루프를 end-to-end로
검증한다.

## Windows 지원

Muse 코어는 Windows에서 동작합니다: CLI, API 서버, 근거 기반 recall, 로컬
Ollama 모델([Ollama for Windows](https://ollama.com/download/windows))까지.
플랫폼 동작은 CI의 `windows-latest` job으로 검증되며, macOS 전용 통합(Apple
노트/미리 알림 미러, 연락처 가져오기, 데스크톱 컴패니언)은
자동으로 비활성화됩니다 — `muse doctor`가 현재 OS의 정확한 상태를 보여줍니다.

- 네이티브 액추에이터: `MUSE_WINDOWS_ACTUATORS=true`로 PowerShell 도구
  세트를 활성화하세요 — 앱/URL 열기, 배터리·wifi·저장소·전면 창 읽기,
  클립보드 쓰기, 음성 읽기, 스크린샷, 미디어 제어, 볼륨/디스플레이 절전.
  macOS 액추에이터처럼 기본은 꺼짐입니다.
- ambient 인지: `MUSE_AMBIENT_SOURCE=windows`가 전면 창 정보를 proactive
  데몬에 공급합니다 (클립보드는 별도 opt-in).
- 자동 시작: `muse daemon --install`이 `schtasks` 로그온 작업을 등록합니다
  (macOS에서는 LaunchAgent).
- 미디어/볼륨 키 이벤트는 CI-verified only입니다 — 이상하면 이슈로 알려주세요.
- 음성 출력은 PowerShell의 wav 플레이어를 사용하고, 녹음은 PATH에
  [sox for Windows](https://sourceforge.net/projects/sox/)가 필요합니다.
- Windows 경로는 CI로 검증됩니다. 이상한 점은 이슈로 알려주세요.

## 공급자 설정

런타임에 환경변수로 모델을 고른다:

| 환경변수 | 예시 | 비고 |
| --- | --- | --- |
| `MUSE_MODEL` | `gemini/gemini-2.0-flash` | `<providerId>/<modelId>` 형식 |
| `MUSE_MODEL_PROVIDER_ID` | `gemini` | 옵션; prefix에서 추론됨 |
| `MUSE_MODEL_API_KEY` | `…` | 공급자별 환경변수 (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`)도 동작 |
| `MUSE_MODEL_BASE_URL` | `http://localhost:11434/v1` | OpenAI-compatible 엔드포인트 오버라이드 (Ollama, LM Studio, custom) |

개인 도메인 토글:

| 환경변수 | 기본값 | 효과 |
| --- | --- | --- |
| `MUSE_NOTES_DIR` | `~/.muse/notes` | 마크다운 노트 디렉토리 (Obsidian vault도 가능) |
| `MUSE_NOTES_ENABLED` | `true` | `muse.notes.*` 도구 비활성화 |
| `MUSE_TASKS_FILE` | `~/.muse/tasks.json` | Todo 리스트 파일 |
| `MUSE_TASKS_ENABLED` | `true` | `muse.tasks.*` 도구 비활성화 |
| `MUSE_CALENDAR_FILE` | `~/.muse/calendar.json` | 로컬 캘린더 공급자 파일 |
| `MUSE_CALENDAR_PROVIDERS` | `local` | 콤마 리스트: `local,ics,gcal,caldav,macos` (`ics`는 `~/.muse/calendar.ics` 있으면 자동 추가) |
| `MUSE_CREDENTIALS_FILE` | `~/.muse/credentials.json` | chmod-600 OAuth / app-password 저장소 |
| `MUSE_USER_MEMORY_AUTO_EXTRACT` | `true` | 매 턴 후 LLM이 사실/선호 자동 추출 — 매 턴 추가 호출이 부담될 땐 `false`로 끄세요 |

## 기여

이 저장소는 Claude Code 협업을 위해 lean-contract 스타일을 따른다:

- [`CLAUDE.md`](CLAUDE.md) — 모든 Claude Code 에이전트가 가장 먼저 읽는 계약 파일.
- [`AGENTS.md`](AGENTS.md) — cross-agent 제품 브리프.
- [`.claude/rules/`](.claude/rules/) — 도메인별 규칙 (architecture, testing, commits, …).
- [`.claude/skills/`](.claude/skills/) — 반복 개발 흐름을 위한 저장소 전용 skills.
- [`.claude/agents/`](.claude/agents/) — 서브에이전트 정의.
- [`CHANGELOG.md`](CHANGELOG.md) — 진행 중인 개발 로그 (Keep a Changelog 형식).

Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`,
`chore:`)을 사용하며, 모든 커밋과 PR 설명은 영어로 작성한다.

## 라이선스

미정. 런타임, 어댑터, 툴링 모두 오픈소스를 지향한다.
