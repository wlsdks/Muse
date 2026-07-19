<p align="center">
  <img src="docs/assets/mascot.svg" alt="Muse 파랑새 마스코트" width="120" />
</p>

<p align="center"><i>지금 살고 있는 삶을 이해하려는 개인 AI, Muse를 만나보세요.</i></p>

<h1 align="center">Muse</h1>

<p align="center">
  <b>당신이 살아가고 일하는 방식을 배우며, 언제 어떻게 도울지 점점 더 잘 맞추는 개인 AI.</b><br/>
  <i>로컬 우선, 모델 제공자 중립, 아직 완성되지 않은 부분은 솔직하게.</i>
</p>

<p align="center">
  <a href="LICENSE"><img alt="MIT 라이선스" src="https://img.shields.io/badge/License-MIT-green.svg" /></a>
  <a href="package.json"><img alt="Node 22.12 이상" src="https://img.shields.io/badge/node-%E2%89%A5%2022.12-43853d.svg" /></a>
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript" src="https://img.shields.io/badge/built%20with-TypeScript-3178c6.svg" /></a>
  <a href="#muse가-하지-않는-일"><img alt="로컬 우선" src="https://img.shields.io/badge/privacy-local--first-6f42c1.svg" /></a>
  <a href="https://ollama.com"><img alt="Ollama 지원" src="https://img.shields.io/badge/runs%20on-Ollama-000000.svg" /></a>
  &nbsp;·&nbsp; <a href="README.md">English</a>
  &nbsp;·&nbsp; <b>한국어</b>
  &nbsp;·&nbsp; <a href="README.ja.md">日本語</a>
  &nbsp;·&nbsp; <a href="README.zh-CN.md">简体中文</a>
</p>

Muse는 업무만 처리하는 비서가 아니라, 한 사람의 삶과 일을 계속 이어서 이해하는 개인 에이전트입니다. 제품의 중심에는 **Attunement(조율)**가 있습니다. 도움이 필요한 순간과 조용히 있어야 할 순간을 구분하고, 지난 제안이 실제로 도움이 되었는지 배워 가려는 방향입니다.

첫 번째 증명점은 **Personal Continuity(개인 맥락 이어가기)**입니다. 사용자가 삶 또는 업무 주제를 직접 만들고, 정확한 로컬 할 일과 메모를 연결하면 Muse가 다음에 그 일을 이어갈 수 있습니다. 주제를 자동으로 추측하거나 사용자를 관찰해 타이밍을 정하는 기능은 아직 로드맵에 있습니다.

> **지금 동작하는 것:** 개인 기억, 출처가 붙는 회상, 로컬 개인 저장소, 승인과 보호 장치가 있는 도구·브라우저 행동, 실행 기록, 체크포인트, 명시적으로 시작하는 Personal Continuity 경로. 자세한 범위는 [제품 계약](docs/strategy/attunement.md)과 [구현 계획](docs/goals/attunement-implementation-plan.md)에서 확인할 수 있습니다.

<p align="center"><img src="docs/images/web-home.png" alt="Muse 콘솔 홈 화면" width="860" /></p>

---

## 📊 숫자로 보는 Muse

아래 여섯 그래프는 서로 다른 질문에 답합니다. 막대가 길거나 테스트 건수가 많다고 해서 Muse가 사람에게 더 도움이 된다는 뜻은 아닙니다. 통제된 합성 데이터와 실제 사용 결과도 섞지 않습니다. 현재 라이브 에이전트 기준선은 **10/11**이며 종합 판정은 여전히 **FAILED**입니다. 실제 개인 사용에서의 효과는 **NOT_PROVEN**입니다.

### 구성 요소를 켰을 때의 변화

**무엇을 재나:** 한 구성 요소를 켜기 전과 후의 차이입니다. **생활 예시:** “내일 병원 예약이 몇 시야?”라는 같은 질문에 grounding을 켜기 전과 후로 답하게 하고, 로컬 일정 메모를 정확히 인용하는 비율이 얼마나 달라지는지 봅니다. **읽는 법:** 양수면 해당 실험에서 좋아졌다는 뜻이지만, 각 줄은 기준과 단위가 달라 서로 더하거나 크기를 비교하면 안 됩니다. **현재 값:** 두 통제된 로컬 모델 데이터 묶음에서 grounding 변화는 +0.94와 +0.63, recall correction 변화는 +0.00입니다. **증명하는 것:** 명시된 통제 사례에서 두 grounding 구성 요소가 개선을 만들었습니다. **증명하지 못하는 것:** 에이전트 전체 성능이나 실제 생활에서의 장기 효과는 아닙니다.

![서로 다른 세 구성 요소 효과 변화](docs/benchmarks/evidence-effect-deltas.svg)

원본: [대시보드 기준 JSON](docs/benchmarks/evidence-dashboard.json) · 재생성 `pnpm evidence:dashboard:render` · 검증 `pnpm evidence:dashboard:validate`

### 확보된 근거의 범위

**무엇을 재나:** 서로 다른 네 종류의 검증에서 근거가 얼마나 채워졌는지 보여 줍니다. **업무 예시:** 10/11은 에이전트 능력 11개 축 가운데 10개가 통과했다는 뜻입니다. 8/80은 오래된 메모와 수정 메모가 검색 결과에 함께 남았는지를 묻는 별도 실험이므로, 두 비율은 경쟁 점수가 아닙니다. **읽는 법:** 각 막대는 자기 분모 안에서만 읽어야 합니다. **현재 값:** 에이전트 기준선 10/11, top-4 교정 쌍 보존 8/80, 통제된 출처 격리 10,080/10,080, 실제 사용 효과 분류 0/1,000입니다. **증명하는 것:** 표시된 계약과 검사를 뒷받침하는 근거가 존재합니다. **증명하지 못하는 것:** 근거의 양과 구현 안정성만으로 사용자에게 유용하다고 말할 수는 없습니다.

![서로 다른 분모를 가진 근거 범위](docs/benchmarks/evidence-coverage.svg)

원본: [대시보드 기준 JSON](docs/benchmarks/evidence-dashboard.json) · 재생성 `pnpm evidence:dashboard:render` · 검증 `pnpm evidence:dashboard:validate`

### 실제 프로덕션 경로의 회상

**무엇을 재나:** 테스트용 우회 함수가 아니라 프로덕션의 `prepareGroundedRecall` 경계를 통과시켜 회상을 확인합니다. **생활 예시:** 예전 메모에는 “헬스장 7시”, 나중 수정 메모에는 “헬스장 6시”라고 적혀 있다고 해봅시다. ‘교정 쌍 보존’은 두 메모가 최종 문맥에 함께 들어왔는지를, ‘최신 정보 1위’는 6시 메모가 가장 먼저 선택됐는지를 뜻합니다. **읽는 법:** 색 막대 하나는 모델 하나에서 20건 중 통과한 수입니다. **현재 값:** 일반·정보 없음 사례는 대부분 통과하지만, 교정 쌍 보존은 0/20, 0/20, 1/20, 1/20이고 최신 정보 1위는 네 모델 모두 0/20입니다. **증명하는 것:** 실제 prepare-only 프로덕션 경로에 재현 가능한 교정 실패가 있습니다. **증명하지 못하는 것:** 이 고정 합성 데이터 v1은 held-out이나 실제 사용 근거가 아니며 생성형 모델 요청도 0회입니다.

![프로덕션 회상 경로 결과](docs/benchmarks/recall-production-path.svg)

원본: [프로덕션 경로 기준 JSON](docs/benchmarks/recall-production-path.json) · 재실행 `pnpm eval:recall-production-path` · 검증 `pnpm eval:recall-production-path:validate`

<details>
<summary><b>세부 진단 보기</b></summary>

### 최신성 재정렬 분리 실험

**무엇을 재나:** 같은 top-4 후보를 원래 순서로 썼을 때와 Muse의 최신성 재정렬을 거쳤을 때를 비교합니다. **생활 예시:** 6시 수정 메모가 처음부터 네 후보 안에 들어오지 않았다면, 재정렬기는 전달받은 메모의 순서만 바꿀 수 있을 뿐 사라진 수정 메모를 되살릴 수 없습니다. **읽는 법:** 모델별 쌍 막대가 같은 범주의 통과 수를 보여 줍니다. **현재 값:** 네 모델 모두 변화 없음(**UNCHANGED**, delta 0)이며 교정 관측 80건 중 72건이 `PAIR_MISSING`입니다. **증명하는 것:** 이 후보 집합 실패는 재정렬만으로 고쳐지지 않았습니다. **증명하지 못하는 것:** 합성 회상 구성 요소 진단이지 에이전트 전체나 실제 사용자 평가가 아닙니다.

![네 로컬 임베딩 모델의 최신성 분리 실험](docs/benchmarks/recall-freshness-ablation.svg)

원본: [최신성 기준 JSON](docs/benchmarks/recall-freshness-ablation.json) · 재실행 `pnpm eval:recall-freshness-ablation` · 검증 `pnpm eval:recall-freshness-ablation:validate`

### 후보 수 진단

**무엇을 재나:** topK를 4에서 8 또는 12로 늘리면 교정 쌍이 더 많이 남는지 확인합니다. **생활 예시:** 최종 판단자에게 메모 4개짜리 선반 대신 12개짜리 선반을 건네는 것과 같습니다. 예전·최신 메모가 함께 있을 가능성은 커지지만 최신 메모가 여전히 뒤에 놓일 수 있습니다. **읽는 법:** 교정 통과는 두 메모가 모두 남고 최신 출처가 1위여야 합니다. **현재 값:** topK가 커질수록 쌍 보존은 대체로 늘지만 원본과 Muse의 교정 통과 수는 같습니다. **증명하는 것:** 후보 공간이 병목 중 하나입니다. **증명하지 못하는 것:** 한 회상 구성 요소만 떼어 본 결과라 전체 에이전트나 실제 효과를 말하지 못합니다.

![topK 4, 8, 12의 교정 쌍 보존과 통과](docs/benchmarks/recall-candidate-pool.svg)

원본: [후보 수 기준 JSON](docs/benchmarks/recall-candidate-pool.json) · 재실행 `pnpm eval:recall-candidate-pool` · 검증 `pnpm eval:recall-candidate-pool:validate`

### 프로젝트가 제공하는 범위

**무엇을 재나:** 기능 목록, 소프트웨어 검증 시점, 라이브 명령 제공 여부를 모아 보여 줍니다. **생활 예시:** “캘린더 백엔드 5개”는 다섯 종류 연결 방식을 지원한다는 뜻이지, 일정 도움을 다섯 번 유용하게 줬다는 뜻이 아닙니다. **읽는 법:** 카드마다 단위가 다르며 `NOT_RUN`은 점수가 아니라 실행하지 않았다는 상태입니다. **현재 값:** 엔드포인트, 패키지와 앱, MCP 서버, 모델 제공자 계열, 과거 통과 테스트 스냅샷, 사용 가능한 라이브 명령을 기록합니다. **증명하는 것:** 표시된 기능 표면과 검사가 존재합니다. **증명하지 못하는 것:** 코드 규모와 테스트 수는 에이전트 효과가 아닙니다.

![프로젝트 기능 목록과 검증 상태](docs/benchmarks/evidence-project-surface.svg)

원본: [대시보드 기준 JSON](docs/benchmarks/evidence-dashboard.json) · 재생성 `pnpm evidence:dashboard:render` · 검증 `pnpm evidence:dashboard:validate`

</details>

근거 종류, 원본 선택 규칙, 서로 다른 근거를 승격하지 않는 원칙은 [근거 색인](docs/benchmarks/EVIDENCE.md)에 있습니다. 기준 JSON만 지표의 원본이며 CSV, Markdown, SVG는 여기서 만들어져 바이트 단위로 검증됩니다.

### 지금 Muse를 쓸 이유

삶과 업무의 한 주제를 메모·할 일·캘린더·모델 제공자 사이에서 계속 이어가되, 정확한 로컬 출처를 직접 확인하고 중요한 행동 전에는 승인을 받고 싶을 때 Muse가 가장 잘 맞습니다. 예를 들어 ‘생일 준비’라는 삶의 주제에 아이디어 메모와 다음 할 일을 직접 연결하고, 며칠 뒤 이어서 본 다음 그 도움이 실제로 쓰였는지 또는 거절됐는지 기록할 수 있습니다.

현재 근거는 이 경로들이 존재하고 안전 계약을 지키는지, 일부 구성 요소가 통제 실험에서 나아졌는지를 보여 줍니다. 반면 Muse가 몇 주 동안 한 사람의 삶을 실제로 개선하는지, 자연스러운 사용을 통해 알맞은 도움 타이밍을 배우는지는 아직 증명하지 못했습니다. 10/11 종합 실패와 교정 회상 실패를 숨기지 않는 이유도 다음 개선 지점을 정확히 보여 주기 위해서입니다.

### 통제 합성 데이터 규모 검증

데이터셋 harness는 여섯 테스트군, 네 언어, 네 난이도를 조합해 서로 독립적인 1천·1만·10만·100만 건 corpus를 만들었습니다. 합계 **1,111,000건**을 생성하고 JSONL로 기록한 뒤 다시 읽어 스키마까지 검증했습니다. 한 레코드는 오래된 병원 예약과 수정된 시간을 구분하게 하고, 다른 레코드는 답이 없는 질문에 답을 삼가게 하거나 사용자의 금지 사항을 보존하고, 승인 없는 행동을 거절하거나 긴 대화를 안전한 길이로 줄이게 합니다. 96개 조건에서 뽑은 **768/768건**은 이름이 명시된 공개 Muse 경계와 최종 불변식을 통과했습니다. LLM·도구·네트워크 호출은 모두 0회였고, 사용자 `~/.muse` 상태도 바이트 단위로 같았습니다.

이 결과가 증명하는 것은 대규모 스트리밍, corpus 무결성, 격리, 공개 경계 표본 실행입니다. 111만 1천 번의 에이전트 실행, 개인 학습, held-out 일반화, 사람의 실제 결과, organic effectiveness를 뜻하지 않습니다. [기준 JSON](docs/benchmarks/eval-datasets-scale-v1.json)과 [읽기 쉬운 보고서](docs/benchmarks/eval-datasets-scale-v1.md)에서 결과를 확인할 수 있으며, 대용량 JSONL 원본은 Git에 올리지 않고 로컬에만 둡니다.

생성기 fixture를 고친 뒤에는 기존 합계와 분리한 새 seed 재생도 실행했습니다. 스키마 **1,000/1,000건**과 공개 경계 표본 **192/192건**이 통과했으며 `robustnessReplay=true`, `heldOut=false`입니다. 이 수치는 111만 1천 건 합계에 포함되지 않고, 반복해도 같은 계약을 지켰다는 근거일 뿐 일반화 성능의 증거는 아닙니다.

---

## ⚡ 설치와 빠른 시작

```bash
# 필요 환경: Git + Node.js >= 22.12(24 LTS 권장) + pnpm 10
git clone https://github.com/wlsdks/muse-agent.git
cd muse-agent
corepack enable
pnpm install:muse
muse onboard
```

지원되는 소스 설치는 깨끗한 `main`에서 고정된 의존성을 설치하고, 전체 workspace를 빌드한 뒤 CLI를 연결하고 확인합니다. `pnpm install:muse -- --dry-run`으로 미리 보고, `muse update`로 업데이트하거나 `pnpm demo`로 로컬 데모를 실행할 수 있습니다.

직접 고른 주제를 이어가려면 다음처럼 시작합니다.

```bash
muse thread start "Plan a birthday" --kind life
muse thread link <thread-id> note birthday.md --role context
muse thread link <thread-id> task <task-id> --role next-step
muse continue <thread-id>
muse thread outcome <delivery-id> used
```

그 밖의 로컬 사용 예:

```bash
muse chat --local --user me
muse status --user me
muse proactive watch --user me --interval 60
```

`muse ask`는 출처가 붙고 열어 볼 수 있는 답을 돌려줍니다.

<p align="center"><img src="docs/images/cli-ask.png" alt="출처가 붙은 muse ask 답변" width="860" /></p>

---

## 🔧 핵심 기능

- **모델 제공자 중립 추론:** OpenAI, Anthropic, Gemini, OpenRouter, Ollama, LM Studio, OpenAI 호환 엔드포인트를 하나의 `ModelProvider` 경계로 연결합니다.
- **개인 맥락과 기억:** 명시적인 삶·업무 주제, 정확한 로컬 출처 링크, 결과, 사실, 선호, 금지, 목표를 다룹니다.
- **근거 기반 회상:** 로컬 메모를 순위화하고, 근거가 약하면 자신 있게 답하지 않으며, 최신성과 인용 출처를 함께 처리합니다.
- **개인 도구:** 로컬 메모, 할 일, 알림, 연락처와 다섯 종류 캘린더 백엔드를 같은 인터페이스 뒤에 둡니다.
- **보호된 행동:** fail-close guard, fail-open hook, 명시적 승인, 신뢰하지 않는 도구 출력, 반복·시간 제한, 추적 기록을 적용합니다.
- **하나의 런타임:** CLI, API·웹 채팅, 메시징, 예약 작업, 위임 워커가 같은 구성 루트를 사용합니다.
- **양방향 MCP:** 내장 `muse.*` 도구를 쓰고, `muse mcp serve`로 다른 에이전트에 읽기 전용 회상·검색·사용자 모델을 제공할 수 있습니다.
- **로컬 우선:** 개인 저장소는 클라우드 계정 없이 작동하며 `MUSE_LOCAL_ONLY=true`는 클라우드 모델 제공자를 거부합니다.

## Muse가 하지 않는 일

- **돈을 움직이지 않습니다.** 금융 계정 연결, 결제 실행, 송금은 범위 밖입니다.
- **다른 사람에게 몰래 보내지 않습니다.** 이메일, 채팅, 폼, 예약은 먼저 초안을 만들고 정확한 내용과 수신자를 확인받습니다.
- **이어갈 주제를 숨겨서 추측하지 않습니다.** 현재 주제와 출처 링크는 사용자가 직접 만듭니다. 자동 감지는 나중의 선택 기능입니다.
- **여러 사람이 함께 쓰는 서비스가 아닙니다.** 한 사용자, 한 로컬 환경을 위한 제품이며 공유 계정이나 RBAC 모델이 없습니다.
- **서로 다른 근거를 바꿔 부르지 않습니다.** 소프트웨어 테스트, 합성 재생, 구성 요소 진단, 에이전트 시험, 실제 사용 결과는 계속 분리합니다.

강제되는 경계는 [외부 전송 안전 규칙](.claude/rules/outbound-safety.md)과 [Attunement 설계](docs/design/attunement.md)에 설명되어 있습니다.

---

## 🧩 모델 제공자와 로컬 사용

`MUSE_MODEL=<provider>/<model>`과 각 제공자의 일반 API 키 환경 변수로 모델을 선택합니다. 명시적 덮어쓰기는 `MUSE_MODEL_PROVIDER_ID`, `MUSE_MODEL_API_KEY`, `MUSE_MODEL_BASE_URL`을 사용합니다. `MUSE_LOCAL_ONLY=true`에서는 클라우드 모델을 쓸 수 없습니다.

Ollama를 이용한 무료 오프라인 경로:

```bash
brew install ollama
ollama serve &
ollama pull gemma4:12b
muse setup local
```

개인 데이터는 기본적으로 파일에 저장됩니다. 메모는 `~/.muse/notes/`, 할 일은 `~/.muse/tasks.json`, 알림은 `~/.muse/reminders.json`, 기억은 `~/.muse/user-memory.json`에 있습니다. `muse setup calendar`로 Local, Local-ICS, Google, CalDAV, macOS Calendar를 설정할 수 있습니다. Windows에서는 CLI, API, recall, Ollama와 사용자가 켜는 PowerShell actuator를 지원하며 macOS 전용 mirror는 자동으로 꺼집니다.

모델 등급, 라이선스, 지연 시간, 문제 해결은 [로컬 모델 설정](docs/setup-local-llm.md)을 참고하세요.

## ✅ 검증

수정 중에는 좁은 검사를, 병합 전에는 전체 검사를 실행합니다.

```bash
pnpm typecheck:fast
pnpm test:changed
pnpm check
pnpm smoke:broad
pnpm smoke:live
```

`smoke:live`는 로컬 Ollama를 실제로 사용하며 연결되지 않으면 건너뜁니다. 더 긴 `pnpm eval:agent`는 nightly 또는 수동으로 실행합니다. 최신 적격 에이전트 결과는 **10 passed, 1 failed, 0 unverified**이고 종합 판정은 **FAILED**입니다. 소프트웨어 테스트 건수는 에이전트 효과의 증거가 아닙니다.

## 📖 문서

- [Attunement 제품 계약](docs/strategy/attunement.md)
- [Attunement 구조와 현재 부족한 점](docs/design/attunement.md)
- [Attunement 구현 계획](docs/goals/attunement-implementation-plan.md)
- [시스템 지도](docs/SYSTEM-MAP.md)
- [검증된 기능 목록](docs/feature-catalog/INDEX.md)
- [근거 색인](docs/benchmarks/EVIDENCE.md)
- [보안 정책](SECURITY.md)

## 💬 커뮤니티와 지원

질문, 버그, 기능 제안은 [GitHub Issues](https://github.com/wlsdks/Muse/issues)에 남겨 주세요. 보안 취약점은 공개 이슈 대신 [SECURITY.md](SECURITY.md)의 절차로 알려 주세요.

## 기여하기

코드를 수정하기 전에 [CONTRIBUTING.md](CONTRIBUTING.md), [CLAUDE.md](CLAUDE.md), [도메인 규칙](.claude/rules/)을 읽어 주세요. Conventional Commits를 사용하며 커밋과 PR 설명은 영어로 작성합니다.

## 라이선스

[MIT](LICENSE). 런타임, 어댑터, 도구는 오픈 소스이며 기여도 같은 조건으로 받습니다.
