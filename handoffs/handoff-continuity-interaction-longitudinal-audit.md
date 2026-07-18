# Continuity interaction longitudinal audit handoff

## 헤더 (목표 + 맥락)

- **작업 이름:** continuity-interaction-longitudinal-audit
- **한 줄 목표:** 실제 life/work interaction evidence의 multi-date 수집 gap을 자동 추적하되, synthetic 검증 데이터나 factual task completion을 usefulness·naturalness·permission으로 승격하지 않는 read-only audit를 만든다.
- **제품 맥락:** controlled 24-case command-path 검증은 통과했지만 실제 로컬 baseline은 21 legacy deliveries 모두 `unavailable`, exact receipt 0이다. 다음 제품 단계는 성공을 꾸미는 것이 아니라 수집 gap을 지속적으로 보이게 하는 것이다.
- **현재 단계:** `DONE`
- **담당:** root maker / independent evaluator

## 1. 수용 기준

- [x] `@muse/attunement`가 canonical `ContinuityInteractionAudit`를 소유하고 기존 report에 additive `audit` 필드를 제공한다. CLI와 authenticated HTTP는 같은 core report를 사용한다.
- [x] numeric target은 interaction 전용 상수로 고정한다: 각 `life`/`work`에 exact interactions `10`, exact delivery가 열린 distinct UTC dates `2`.
- [x] kind별 audit는 `exactInteractions`, `exactInteractionsTarget`, `distinctUtcOpenedDates`, `distinctUtcOpenedDatesTarget`, `remainingExactInteractions`, `remainingDates`를 보고한다.
- [x] 두 kind가 두 target을 모두 채우기 전 status는 `collecting`; 숫자만 채우면 `audit-required`다. `ready`, `natural`, `promoted`, automation enable 상태는 표현할 수 없다.
- [x] date coverage에는 canonical `exact` receipt가 있는 delivery의 `openedAt`만 들어간다. `none`, `unavailable`, explicit outcome의 존재/값은 count·date·status에 영향을 주지 않는다.
- [x] audit는 canonical digest와 같은 duplicate receipt identity, run/thread binding, receipt shape, timestamp chronology 검증을 통과한 입력만 집계한다. invalid input은 complete-looking audit 대신 fail-close한다.
- [x] zero state는 유한하고 명시적이다: 각 kind exact/date `0`, remaining exact/date `10/2`, status `collecting`.
- [x] human CLI는 digest 다음에 audit status와 kind별 gap, 그리고 numeric coverage가 natural timing/usefulness/permission을 인증하지 않는다는 문구를 표시한다. JSON schema version은 1을 유지하며 additive다.
- [x] 실제 기본 로컬 Attunement와 tasks source를 모두 읽기 전후 SHA-256으로 비교한다. 시작 시 없던 파일은 reader 실행 후에도 생성되지 않아야 한다. checked-in evidence에는 aggregate/audit만 허용하고 interaction/task/delivery ID와 title/content가 없음을 machine-check한다. 현재 baseline의 exact 0 / unavailable 21을 성공 데이터로 대체·보정하지 않는다.
- [x] synthetic evaluator는 generated records를 영속 state나 실제 evidence 문서에 섞지 않는 fixed-seed in-memory/offline 실행으로 최소 5,000 cohorts와 100,000 interaction items를 검사한다. 실제 처리 cohort/item 수를 출력·assert하고 production audit function을 독립 oracle과 비교해 threshold 경계, life/work 비대칭, outcome 무관성, count/date conservation을 machine-check하며 `naturalLongitudinalEvidence:false`를 출력한다.
- [x] synthetic evaluator 자체의 검출력을 증명한다. threshold off-by-one, `openedAt` 대신 `completedAt` date 사용, one-kind shortcut, outcome contamination 중 최소 하나의 production-equivalent mutation을 주입한 counterfactual test가 반드시 RED를 감지한다.
- [x] TDD RED→GREEN, focused core/CLI/API, synthetic evaluator, actual read-only dogfood, TS7, lint, full release gate와 독립 completion evaluation이 PASS한다.

## 2. 검증 방법

- empty/just-below/exact-target/one-kind-only target을 public core report RED→GREEN tracer bullets로 구현한다.
- explicit outcomes를 전부 바꿔도 audit가 byte-equivalent인지 검증한다.
- CLI/API adapter에서 core report equality와 read-only bytes를 검증한다.
- deterministic seeded synthetic generator에 production implementation과 공유 로직이 없는 별도 oracle을 두고 5,000 cohorts/100,000 items 이상을 평가하며 실제 처리량을 assertion한다.
- evaluator regression test는 off-by-one 변이 구현을 oracle과 대조해 mismatch를 검출하는 counterfactual RED proof를 포함한다.
- 실제 `~/.muse/attunement.json`과 canonical tasks source는 aggregate-only reader 전후 SHA-256을 비교하고, absent-before source는 absent-after인지 검증한다.
- actual evidence artifact를 검사해 aggregate/audit 외 ID·title·content 필드나 synthetic cohort 내용이 포함되지 않았음을 assertion한다.
- maker와 다른 evaluator가 handoff/diff/evidence를 기준별로 판정한다.

## 3. 구현 순서

1. `interaction-evidence.ts`에 interaction-only longitudinal audit를 추가한다.
2. 기존 report/CLI/API에 additive audit를 연결한다.
3. 대량 synthetic evaluator와 테스트를 추가한다.
4. actual aggregate baseline과 synthetic 결과를 evaluation 문서에 기록한다.
5. Attunement 설계/목표/CHANGELOG를 업데이트하고 release gate를 통과한다.

## 4. 명시적 비범위

- synthetic data를 실제 Attunement store에 쓰거나 natural evidence로 주장하지 않는다.
- exact task completion을 `used|adjusted|ignored|rejected`로 추론하지 않는다.
- 자연스러운 timing, domain diversity, causality를 코드가 인증하지 않는다.
- proactive delivery, source auto-linking, autonomy/permission 승격을 추가하지 않는다.
- 실제 21개 historical delivery나 outcome을 수정하지 않는다.

## 5. 워커 노트

- **baseline commit:** `e7dbd4922`
- **actual aggregate snapshot:** total 21, life unavailable 6, work unavailable 15, exact 0, latency samples 0. Read-only CLI aggregate만 확인했으며 source title/content/ID는 기록하지 않았다.
- **synthetic result:** fixed seed `1297437509`, 5,000 cohorts, 174,548 items, production/oracle mismatch 0, outcome contamination mismatch 0, off-by-one mutant detected.
- **actual read-only result:** life/work exact `0/10`, dates `0/2`, status `collecting`; Attunement/tasks both existed and before/after SHA-256 matched. Aggregate-only validator passed.
- **focused verification:** core 10, CLI 17, API 12, evaluator 4, local audit 2 tests passed; TS7 fast typecheck and targeted lint passed with only configured script-ignore warnings.
- **full release gate:** `pnpm check` PASS; build/web production build green, Attunement 146, API 1,328, CLI 4,354 tests green along with all workspace suites.

## 6. 평가자 판정

- **PLAN GATE:** `PASS` — `10 exact / 2 UTC opened dates per kind`는 자연성·유용성·권한 판정이 아닌 interaction 전용 numeric collection 뒤 `audit-required`로만 전환하며, canonical exact delivery의 `openedAt` 날짜만 세는 의미가 명확하다. synthetic/natural 분리, additive public shape, Attunement+tasks SHA/absence 불변성, aggregate-only 비식별 artifact, fixed-seed 5k/100k production-vs-independent-oracle 처리량 assertion과 counterfactual RED proof가 모두 측정 가능하고 실행 가능하다.
- **COMPLETION EVAL:** **PASS (cycle 1).** baseline `e7dbd4922` 대비 전체 diff와 evidence를 독립 검토·재실행했으며 남은 수용 기준 blocker가 없다.
- **기준별 판정:** core `ContinuityInteractionReport`의 additive `audit`를 CLI와 authenticated HTTP가 공유하고 schema version 1 및 기존 interaction/digest를 보존한다. canonical digest fail-close를 선행한 뒤 kind별 exact receipt의 UTC `openedAt`만 10건/2일 gate에 사용하며 두 kind가 모두 충족돼도 `audit-required`만 반환한다. none/unavailable/outcome은 집계에 기여하지 않고 reason·human CLI·문서 모두 naturalness/usefulness/causality/permission/promotion과 분리한다. public CLI/API tests는 실제 command/route 결과와 read-only bytes를 검증한다.
- **독립 실행 증거:** core focused 10/10, synthetic/local runner 6/6, `git diff --check`가 PASS했다. fixed seed `1297437509` 전체 실행은 5,000 cohorts·174,548 items, production/oracle mismatch 0, outcome-contamination mismatch 0, collecting/audit-required 4,731/269, off-by-one counterfactual detected true를 재현했다. actual local runner는 life/work exact 0/0, unavailable 6/15, status collecting을 유지하고 Attunement/tasks의 existence와 SHA를 모두 보존했으며 aggregate audit/digest/invariant 외 identifying interaction/task/delivery 내용이나 synthetic record를 출력하지 않았다.
- **반복 횟수:** 1

## 상태 로그

- 2026-07-18 · root · PLAN · actual aggregate baseline과 synthetic-vs-natural 경계를 고정함.
- 2026-07-18 · root · PLAN · 구현 전 최신 `origin/main` (`e7dbd4922`)으로 기준선을 갱신함.
- 2026-07-18 · independent plan evaluator · PLAN GATE FAIL · threshold/date 의미와 synthetic honesty는 타당하나 actual Attunement+tasks 불변성/비식별 evidence 검증 및 5k/100k production-vs-oracle counterfactual 계약이 필요함.
- 2026-07-18 · root · PLAN · Attunement+tasks SHA/absence 보존, aggregate-only artifact 검사, fixed-seed production-vs-independent-oracle 처리량 assertion, off-by-one counterfactual RED proof를 수용 기준에 추가함.
- 2026-07-18 · independent plan evaluator · PLAN GATE PASS · 이전 read-only 및 evaluator 검출력 blocker가 수용 기준/검증 방법에 모두 반영되어 scope, evidence honesty, additive contract, 실행 가능성에 남은 blocker가 없음.
- 2026-07-18 · root · BUILD/VERIFY · shared audit, CLI/API, fixed-seed synthetic evaluator, aggregate-only actual reader, evidence docs를 구현하고 focused verification 및 TS7 fast typecheck를 통과함.
- 2026-07-18 · root · VERIFY · full `pnpm check`가 exit 0으로 통과함; 독립 completion evaluation 대기.
- 2026-07-18 12:57 KST · independent completion evaluator · COMPLETION EVAL cycle 1 **PASS** · Full diff/evidence inspection, core 10/10, runner 6/6, fixed-seed 5k/174,548 production-vs-oracle evaluation, off-by-one detection, and actual aggregate-only local SHA/absence audit all passed with no remaining blocker. Only evaluator §6 and this status entry were changed.
- 2026-07-18 · root · DONE · 모든 수용 기준과 독립 completion gate를 충족해 merge-ready로 종료함.
