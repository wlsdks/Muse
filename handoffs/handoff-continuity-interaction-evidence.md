# Continuity interaction evidence handoff

## 헤더 (목표 + 맥락)

- **작업 이름:** continuity-interaction-evidence
- **한 줄 목표:** Muse가 명시적 Continuity outcome과 섞지 않고, 정확히 연결된 로컬 task의 delivery 이후 상호작용 사실을 불변 receipt로 기록·평가한다.
- **제품 맥락:** 현재 `adjusted` 이유와 실제 task 진전이 canonical state에 없어 Attunement가 반복 피드백 없이 개선되기 어렵다.
- **현재 단계:** `COMPLETE`
- **담당(현재):** root orchestrator / worker

## 1. 수용 기준 (검증 가능한 PASS 조건)

- [x] 증거 대상인 새 delivery는 owner-only store, delivery/run/thread ID, `linkedAt`을 포함한 exact local next-step, `openedAt`, 관찰된 open-state fingerprint를 immutable anchor로 저장한다. anchor 또는 run ID가 없는 legacy delivery는 상관 불가이며 receipt를 만들지 않는다.
- [x] trusted local-task completion composition root만 recorder를 호출한다. model/CLI/HTTP 입력은 event ID, delivery ID, 시각, scope를 제출할 수 없고 recorder가 canonical task `completedAt`과 anchored delivery에서 이를 직접 도출한다. 같은 exact task가 `openedAt` 이후 `open → done`임이 증명될 때만 기록한다.
- [x] missing/ambiguous/pre-delivery/relinked/different-thread-task-source/unavailable/corrupt 입력은 아무것도 쓰지 않는다. 하나의 completion event는 최대 한 delivery에만 귀속된다.
- [x] exact event+delivery replay는 byte-idempotent하다. event 또는 delivery identity를 다른 scope/transition/time으로 재사용하면 bytes를 바꾸지 않고 fail-close한다.
- [x] receipt는 `used|adjusted|ignored|rejected`를 생성·변경하지 않고 permission/grant/policy를 확대하지 않는다.
- [x] canonical projection은 `explicitOutcome`과 factual interaction state를 분리한다: valid receipt 하나가 있으면 `exact`; legacy anchor/run 누락 또는 current anchored link/task의 missing/unreadable/corrupt/relinked/scope mismatch처럼 검증 불가하면 `unavailable`; anchor와 current exact source가 유효하지만 post-delivery `open → done` receipt가 아직 없으면 `none`. interaction은 feedback, `used`, longitudinal coverage, readiness, promotion에 포함되지 않으며 projection read는 mutation-free다.
- [x] CLI와 authenticated HTTP adapter가 같은 core projection을 사용한다.
- [x] legacy read는 byte-preserving이다. unknown future schema, malformed/orphan/duplicate/cross-record mismatch는 전체 state를 rewrite 없이 거부한다. 첫 valid mutation은 기존 file lock 아래 원자적으로 migration/record하며 crash 전에는 receipt가 없고 commit 후 replay는 원본을 반환한다.
- [x] 기존 thread 삭제는 interaction receipt를 함께 제거해 orphan을 남기지 않고 owner-only file permission을 유지한다. 향후 delivery 삭제가 생기면 같은 cascade를 요구하되 이 slice에서 새 delivery 삭제 기능은 만들지 않는다.
- [x] 격리된 owner-only fixture에서 anchored delivery를 open task 상태로 열고, 기존 explicit user/test path로 task를 완료한 다음 receipt 하나를 기록한다. replay는 추가 기록을 만들지 않으며 이 기능 자체는 task mutation이나 autonomy authority를 만들지 않는다.
- [x] 타깃 테스트, TS7 typecheck, 관련 contract 검증, 독립 평가가 PASS한다.
- **범위 밖(하지 말 것):** interaction을 `used`로 추론, 자동 source 탐색/연결, proactive delivery, Observe 수집, live autonomy/권한 승격, 외부 전송.

## 2. 검증 방법

- 각 public behavior를 Vitest integration-style RED→GREEN tracer bullet로 구현한다.
- `@muse/attunement` 타깃 테스트와 CLI/API adapter 테스트를 실행한다.
- `pnpm typecheck:fast` 및 관련 repo contract 검사를 실행한다.
- 격리된 임시 owner state에서 실제 interaction-evidence dogfood를 실행하고 bytes/receipts를 검사한다.
- 별도 평가자가 이 파일과 diff만 받아 수용 기준별 PASS/FAIL을 판정한다.

## 3. 워커 노트 (워커/빌더가 채움)

- **건드린 범위:** `@muse/attunement` schema/store/projection, Continuity preparation, CLI/API/task loopback composition roots, 테스트 전략 및 제품 문서.
- **한 일:** immutable delivery anchor와 exact `open → done` interaction receipt를 추가하고, trusted task completion 이후만 fail-closed recorder를 호출하게 했다. CLI `thread interactions`와 인증 HTTP projection은 동일 core reducer를 사용한다. v1 read는 파일을 건드리지 않고 첫 mutation 때 v2로 원자 migration한다.
- **결정/가정:** explicit outcome과 factual interaction receipt는 의미가 다르므로 영속·평가에서도 분리한다.
- **검증 실행 결과:** RED에서 새 contract 부재를 확인한 뒤 GREEN. attunement 128, CLI focused 56, API focused 13, autoconfigure 13, domain-tools 11 테스트 PASS. `test:changed --uncommitted`의 API 235, CLI 377, attunement 67, autoconfigure 385, domain-tools 350 테스트 PASS. TS7 `typecheck:fast`, lint, 대상 package build PASS. 격리 CLI dogfood에서 receipt=1, outcomes=0, replay 전후 SHA-256 동일. 전체 `pnpm check` PASS(전체 build + workspace suites; CLI 4,353 포함), `check:api-boot`, `check:capabilities`, `check:prompt-seam` PASS. 전체 게이트가 찾아낸 기존 messaging 고정시각 누락 테스트도 재현 후 시계 주입으로 안정화했고 해당 11개 테스트가 PASS. EVAL cycle 1의 ID 재사용 공격을 영구 RED로 재현한 뒤 task `createdAt` 기반 identity fingerprint 대조로 recorder와 projection을 fail-close 보강했다. EVAL cycle 2의 receipt replay 후 동일 ID+completedAt 재사용 공격도 RED로 고정하고 replay receipt의 open fingerprint를 current task identity와 대조해 무기록 `not-correlated` 처리했다. 보강 후 interaction 5/5, CLI task root 40/40, assembled MCP root 14/14 PASS.
- **평가자가 특히 봐야 할 곳:** cross-thread/source 상관 실패, implicit-used 오염, replay idempotency, migration.

## 4. 평가자 판정 (독립 평가자가 채움 — 워커와 반드시 다른 에이전트)

- **판정:** **COMPLETION EVAL PASS (cycle 4).** Direct inspection of the current untracked test file corrects cycle 3: the exact replay-identity regression is present and green, and no implementation or acceptance blocker remains.
- **수용 기준 대조:** the permanent first interaction test performs valid receipt → byte-idempotent valid replay → replacement with the same ID and `completedAt` but different `createdAt` → `not-correlated` with unchanged bytes. An independent external probe reproduced `not-correlated`, unchanged bytes, and one original receipt. Current interaction 5/5 and diff check pass; prior clean cycle evidence remains green for full attunement 136/136, CLI-local 40/40, assembled MCP 14/14, authenticated API 1/1, CLI projection 17/17, API projection 12/12, messaging recovery 11/11, and package build. Exact anchor/run/thread/link/source binding, ambiguous/pre-delivery/relinked/unavailable/corrupt refusal, replay identity and byte idempotency, explicit-outcome/permission separation, mutation-free canonical projection, legacy migration, thread-delete cascade, owner-only persistence, and all trusted composition roots satisfy the stated contract.
- **구체적 피드백:** no remaining blocker. Cycle 3 incorrectly described the permanent replay assertion as absent; current lines 81–91 of `interaction-evidence.test.ts` contain the required same-ID/same-completion-time/different-created-time replay attack and byte-preservation assertion. Runtime source independently matches it by comparing `replay.openStateFingerprint` with the current task-derived expected open fingerprint before returning an exact replay.
- **반복 횟수:** 4

## 열린 질문 (BLOCKED일 때)

- 없음.

## 상태 로그 (append-only)

- 2026-07-18 10:46 KST · root · BUILD · 최신 origin/main에서 계획과 fail-closed 수용 기준을 고정함.
- 2026-07-18 11:21 KST · root · EVAL · exact receipt vertical slice와 실제 CLI dogfood를 완료하고 전체 게이트 및 독립 평가로 전환함.
- 2026-07-18 11:25 KST · root · EVAL · 전체 build/test와 관련 contract가 PASS해 독립 evaluator에게 handoff함.
- 2026-07-18 11:28 KST · independent evaluator · COMPLETION EVAL cycle 1 **FAIL** · Focused 4+1+11 tests passed, but an adversarial local-store probe replaced an anchored task with a new task using the same ID and the recorder persisted a false interaction receipt. CLI-local and assembled MCP completion also lack permanent receipt-level composition-root tests. Only evaluator section 4 and this status entry were changed.
- 2026-07-18 11:33 KST · root · EVAL cycle 2 · 동일 ID task 재생성 공격을 fail-close하고 CLI-local 및 assembled MCP receipt-level integration tests를 추가함. Focused 5+40+14, typecheck, lint PASS; 독립 재평가 요청.
- 2026-07-18 11:36 KST · independent evaluator · COMPLETION EVAL cycle 2 **FAIL** · 최초 ID 재사용과 composition-root blockers는 해소됐지만, 기존 receipt replay에서 동일 ID+completedAt을 재사용한 다른 task identity가 old receipt를 반환함.
- 2026-07-18 11:37 KST · root · EVAL cycle 3 · replay identity 충돌을 permanent RED로 재현하고 current `createdAt` fingerprint 불일치 시 byte-preserving `not-correlated`로 fail-close함. Focused 5+40+14 PASS; 독립 재평가 요청.
- 2026-07-18 11:35 KST · independent evaluator · COMPLETION EVAL cycle 2 **FAIL** · Original same-ID replacement attack and all three composition-root tests are closed/green, but replacing the task after a valid receipt with a different `createdAt` while reusing the same ID and `completedAt` makes the replay branch return the old receipt rather than fail closed on changed exact-task identity. Bytes remained unchanged; only evaluator section 4 and this status entry were changed.
- 2026-07-18 11:38 KST · independent evaluator · COMPLETION EVAL cycle 3 **FAIL** · External cycle-2 replay attack is runtime-closed (`not-correlated`, unchanged bytes, one original receipt) and focused 5+40+14+1+11 checks pass, but the submitted five interaction tests contain no valid-record-then-replacement replay regression despite the worker/status claim. Only evaluator section 4 and this status entry were changed.
- 2026-07-18 11:40 KST · independent evaluator · COMPLETION EVAL cycle 4 **PASS** · Corrected cycle-3 file inspection: current untracked test lines 81–91 permanently cover valid receipt then same-ID/same-`completedAt`/different-`createdAt` replay refusal with unchanged bytes. Named 5/5 and external replay probe pass; all prior acceptance and composition-root evidence remains green. Only evaluator section 4 and this status entry were changed.
- 2026-07-18 11:45 KST · root · COMPLETE · 최신 origin/main rebase 후 전체 `pnpm check`(CLI 4,354 포함), lint, API boot, capabilities drift, prompt seam을 다시 PASS함.
