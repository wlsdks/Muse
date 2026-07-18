# Continuity interaction shadow digest handoff

## 헤더 (목표 + 맥락)

- **작업 이름:** continuity-interaction-shadow-digest
- **한 줄 목표:** factual Continuity interaction을 outcome·permission과 분리한 읽기 전용 digest로 집계하고, 20~50회 controlled shadow dogfood로 실제 공개 경로의 증거를 축적한다.
- **제품 맥락:** interaction receipt는 exact task 진전을 증명하지만 usefulness나 권한을 뜻하지 않는다. 다음 단계는 이 사실 증거의 coverage와 completion latency를 정직하게 관찰하는 것이다.
- **현재 단계:** `COMPLETE`
- **담당(현재):** root maker / independent evaluator

## 1. 수용 기준 (검증 가능한 PASS 조건)

- [x] `@muse/attunement`가 projection과 digest를 한 번에 만드는 canonical read-only report를 소유하며 CLI와 authenticated HTTP가 같은 report를 반환한다.
- [x] digest는 전체와 `life`/`work` 각각에 대해 `exact | none | unavailable` count와 ratio를 보고한다. count 합은 delivery 수와 같고, 해당 scope의 `total=0`이면 세 ratio는 모두 정확히 `0`이다.
- [x] completion latency는 `exact` receipt의 canonical `completedAt - openedAt`만 사용하며 sample size, min, median, p95, max를 deterministic integer milliseconds로 보고한다. latency를 오름차순 정렬하고 p50/p95 모두 nearest-rank index `ceil(p*n)-1`을 사용한다. exact sample이 0이면 `sampleSize=0`이고 `minMs|medianMs|p95Ms|maxMs=null`이다. `none`, `unavailable`, explicit outcome은 latency sample에 들어가지 않는다.
- [x] malformed/non-finite/negative chronology 또는 구조적으로 모순된 exact projection은 complete-looking digest를 만들지 않고 fail-close한다.
- [x] report read 전후 Attunement/task 파일 bytes가 동일하다. report는 outcome ledger, policy, readiness, promotion, grant, permission을 생성·변경·확대하지 않는다.
- [x] 기존 interaction JSON contract는 additive하게 유지한다: `schemaVersion: 1`, `interactions`, `digest`. human CLI는 aggregate를 먼저 보여주고 각 delivery의 factual state와 explicit outcome을 계속 분리해 표시한다.
- [x] 재현 가능한 controlled shadow dogfood runner가 임시 owner-only local state와 실제 supported CLI commands를 사용해 20~50 delivery를 만든다. direct state/receipt injection, hidden outcome 생성, 권한 확대, 외부 전송은 금지한다.
- [x] 기본 dogfood corpus는 `{life, work} × {exact, none, unavailable}` 여섯 cell을 각각 정확히 4회 실행한 총 24 deliveries다. exact는 실제 task completion composition root를 통과하고 replay는 receipt를 늘리지 않으며 report read는 bytes를 바꾸지 않는다.
- [x] runner 결과는 controlled same-session evidence임을 명시하고 natural/longitudinal evidence로 표현하지 않는다. checked-in evidence는 명령, 분포, latency, 불변성 결과를 재현 가능하게 남긴다.
- [x] focused Vitest RED→GREEN, CLI/API adapter tests, dogfood run, TS7 typecheck, lint, 관련 contract 및 독립 completion evaluation이 PASS한다.

## 2. 검증 방법

- pure digest contract를 먼저 RED로 추가한 뒤 최소 구현으로 GREEN한다.
- adapter tests에서 CLI/API가 core report와 동일하고 read-only임을 검증한다.
- runner 자체를 Node test로 검증하고, 빌드된 CLI로 24회 기본 corpus를 실제 실행한다.
- artifact/state SHA-256, receipt uniqueness, count/ratio conservation, latency sample provenance, explicit outcome 0, permission mutation 부재를 machine-check한다.
- maker와 다른 evaluator가 이 파일, diff, 실행 증거를 기준별로 판정한다.

## 3. 범위와 구현 순서

1. `interaction-evidence.ts`에 canonical report/digest와 fail-closed 통계 reducer를 추가한다.
2. CLI/API `interactions` surface를 canonical report로 교체한다.
3. supported CLI command만 호출하는 isolated shadow runner와 자동 검증을 추가한다.
4. 24회 baseline dogfood를 실행하고 결과를 `docs/evaluations/`에 기록한다.
5. 제품 문서에 factual interaction digest의 의미와 promotion 금지를 반영한다.

## 4. 명시적 비범위

- interaction을 `used|adjusted|ignored|rejected`로 추론하지 않는다.
- silent click/open/task completion을 preference evidence로 승격하지 않는다.
- autonomy grant, permission, proactive delivery, source auto-linking을 추가하지 않는다.
- controlled same-session corpus를 자연 장기 사용이라고 주장하지 않는다.
- LLM judge로 deterministic receipt 집계를 대체하지 않는다.

## 5. 워커 노트

- **baseline:** main `0d5c4776d`; canonical projection은 이미 CLI/API에서 공유되며 exact receipt와 explicit outcome은 분리되어 있다.
- **구현:** core `buildContinuityInteractionReport`가 projection과 digest를 함께 소유하고 CLI/API가 이를 그대로 공유한다. 전체/life/work state count·ratio와 exact-only nearest-rank latency를 제공하며 invalid chronology, duplicate delivery/receipt identity, missing receipt, run/thread binding mismatch를 fail-close한다.
- **dogfood:** 빌드된 Muse CLI command graph로 24 deliveries를 실행했다. 각 cell 4회, overall exact/none/unavailable 8/8/8, exact latency sample 8, explicit outcomes 0, receipts 8, permission/grant fields 0, owner-only files true, read/replay bytes stable을 runner가 검증했다.
- **검증:** TDD RED 4 failures를 확인한 뒤 Attunement 142, focused CLI 17, focused API 12, runner 2, TS7 typecheck, lint, comment marker, API boot, `git diff --check` PASS. 전체 `pnpm check` exit 0(API 1,328, CLI 4,354 포함).

## 6. 평가자 판정 (독립 평가자가 채움)

- **PLAN GATE:** `PASS` — zero-total ratio, zero-exact latency null shape, nearest-rank p50/p95, exact 4-per-cell corpus가 모두 결정적이고 검증 가능하다. 공개 CLI dogfood, controlled-vs-natural 표기, outcome/permission 분리, read-only 불변성, 독립 completion evaluation 범위도 일관된다.
- **COMPLETION EVAL:** **PASS (cycle 2).** cycle-1 invalid/duplicate receipt blocker가 reducer 경계와 영구 회귀 테스트에서 닫혔고 남은 수용 기준 blocker가 없다.
- **독립 재검증:** 이전과 동일한 duplicate receipt identity probe는 `duplicate receipt id`로, projection/receipt run·thread mismatch 및 recorded-before-completed probe는 `contradictory receipt binding`으로 fail-close했다. 현재 reducer는 receipt ID/event ID uniqueness, canonical receipt shape, delivery/run/thread binding, link-before-open, positive completion latency, record-at-or-after-completion을 검증한다. focused interaction 8/8, runner 2/2, `git diff --check`가 재통과했고 maker의 rebuilt Attunement 142/142, CLI 17/17, API 12/12, 24-case dogfood, TS7, lint 증거와 cycle-1의 나머지 기준 검증도 유지된다.
- **수용 기준 대조:** shared read-only report, zero shapes, nearest-rank p50/p95, malformed/duplicate/missing receipt refusal, additive JSON/human CLI, outcome·policy·readiness·promotion·permission 비결합, 정확한 4-per-cell 24-case public CLI graph, owner-only/read/replay invariants, controlled-vs-natural 표기가 모두 충족된다.
- **반복 횟수:** 2

## 상태 로그 (append-only)

- 2026-07-18 · root · PLAN · 최신 origin/main에서 baseline을 확인하고 read-only report와 controlled dogfood 수용 기준을 고정함.
- 2026-07-18 · independent plan evaluator · PLAN GATE FAIL · 공개 CLI dogfood 경로와 outcome/permission 분리는 타당하나 zero-sample/quantile 계약과 24회 per-cell 분포가 미정이라 측정 가능한 기준으로 보완이 필요함.
- 2026-07-18 · independent plan evaluator · PLAN GATE PASS · zero-total/zero-exact shape, nearest-rank quantile, exact 4-per-cell 24-case corpus가 고정되어 acceptance가 측정 가능하며 남은 범위·안전·검증 blocker가 없음.
- 2026-07-18 · root · BUILD/EVAL · core report, CLI/API adapters, controlled runner와 증거 문서를 구현하고 24회 dogfood 및 전체 release gate를 PASS해 독립 completion evaluation으로 전환함.
- 2026-07-18 12:21 KST · independent completion evaluator · COMPLETION EVAL cycle 1 **FAIL** · Focused suites and built-CLI 24-case dogfood pass, but the canonical digest accepts duplicate receipt identities and exact receipts whose run/thread binding and chronology contradict the projection. Product code was not changed; only evaluator section 6 and this status entry were updated.
- 2026-07-18 12:25 KST · root · EVAL cycle 2 · duplicate receipt id/event id, run/thread mismatch, recorded-before-completed chronology를 영구 RED로 재현하고 canonical digest를 fail-close 보강함. rebuilt Attunement 142/142, CLI 17/17, API 12/12, runner 2/2와 24-case dogfood, TS7, lint PASS 후 재평가 요청.
- 2026-07-18 12:26 KST · independent completion evaluator · COMPLETION EVAL cycle 2 **PASS** · Both cycle-1 adversarial probes now fail-close, permanent reducer tests cover the receipt identity/binding/chronology contract, focused interaction 8/8 and runner 2/2 pass, and no remaining acceptance blocker was found. Only evaluator section 6 and this status entry were changed.
- 2026-07-18 12:28 KST · root · COMPLETE · cycle-2 보강 상태에서 전체 `pnpm check`를 재실행해 exit 0(API 1,328, CLI 4,354 포함)을 확인함.
