# Loop journal — self-improvement

**Theme:** hermes-style self-improvement machinery — Playbook (strategy memory,
RL-style reward↑/decay) · whetstone (weakness ledger) · Skill authoring ·
Reflection/dreaming · memory consolidation (Mem0-style). Strengthen + PROVE each,
keeping the grounding floor (fabrication=0) intact.

**Autonomy:** Tier1.5 — dedicated branch `loop/self-improvement` in a /tmp
worktree; each fire commits locally and syncs from LOCAL main (rebase) to stay
conflict-free; **every 3 fires FF-merges into LOCAL main** (진안 directive). Hard
floor: NO push, NO remote auto-merge, NO force, NO `--no-verify`.

**Cadence:** session cron `0b48bb96`, 20 min. **Stop:** `CronDelete 0b48bb96` or cmux.

**Surfaces & packages:** `@muse/mcp` (playbook/whetstone stores) · `@muse/agent-core`
(reflection, playbook ranking) · `@muse/memory` (consolidation/decay) · `@muse/skills`
(authoring/curate). Live battery: `pnpm eval:self-improving` (LLM merge/preference/pattern
paths) + `pnpm eval:agent` (judge/shadow-trial) when those are touched.

---

## fire 1 · 2026-06-20 · skill v2.0.0 · `1b9d31a7`
meta: value-class=micro-fix · pkg=@muse/mcp · kind=correctness/RL-ranking · verdict=PASS · firesSinceDrill=1
ratchet: testFiles=1057 (tests added to existing file) · fabrication 0 · gates: mcp 35/35 + check (saturation-only timeouts, clean in isolation) + self-eval ok + lint pass · eval:self-improving N/A (deterministic store, no LLM path)

- **무엇:** `retainPlaybookEntries` bank-overflow eviction을 raw point-estimate `reward`
  정렬 → PEVI Wilson-LCB `retentionUtility`(inline-replicated `rankingUtility`) 정렬로
  교체. no-tally는 `clampReward(reward)`로 byte-identical 폴백.
- **왜:** injection 경로(`rankingUtility`, Wilson LCB)와 생존 랭킹이 불일치 → thin-but-lucky
  전략이 battle-tested 전략을 파괴적으로 evict (PEVI arXiv:2012.15085 edge c). paper-grounded
  fire 3이 `effectiveStrategyReward`(shrinkage) 잘못 복제로 롤백된 그 항목의 corrected fix.
- **리뷰지점:** mcp는 의도적으로 agent-core 무의존(자체 REWARD_MIN/MAX) → import 아닌 inline-
  replicate가 정답. 판별 테스트(thin 1/0 reward=5 vs proven 11/9 reward=1, cap=1)는 old에서
  RED("thin" 생존) → new에서 GREEN("proven"). ④b 독립 Opus judge가 올바른 함수 복제(util
  proven −1.58 vs shrinkage +0.43로 구분)·산수·1870 통과 확인.
- **리스크:** 낮음 — 결정론적 store 로직, 공개 API 무변경, retentionUtility는 file-private,
  4개 레거시 retain 테스트 byte-identical. recency discount는 미적용(time-free, index tie-break
  유지 — `rankingUtility` nowMs-undefined 형태와 동일).
- **형제-감사:** raw-reward eviction sort는 이 한 곳뿐(injection 경로는 이미 rankingUtility) — clean.

## fire 2 · 2026-06-20 · skill v2.0.0 · `7b22ce7f`
meta: value-class=wiring · pkg=@muse/cli (+@muse/mcp) · kind=whetstone learn→apply / DRY-unify · verdict=PASS · firesSinceDrill=2
ratchet: testFiles=1057→1058 (new chat-weakness-nudge.test.ts) · fabrication 0 · gates: mcp 1872 + cli 2766 + check EXIT=0 ALL packages clean + self-eval ok + lint pass

- **무엇:** chat의 하드코딩 repeat-weakness nudge를 공유 `askTimeWeaknessNudge` + 추출한
  `renderAskTimeNudge`(단일 axis-aware KO/EN 문구)로 통일. ask는 byte-identical 리팩터,
  chat은 `chatRepeatWeaknessNudge`(ledger 읽기→선택→렌더)로 교체.
- **왜:** 기존 chat nudge는 이번-턴 refusal에서만·이번-턴 count로·grounding-gap "노트 추가"만
  하드코딩 → **source-conflict 재조정 힌트 불가 + mastery 억제 불가**. ask는 이미 공유 헬퍼 사용 →
  chat을 parity로 끌어올리고 두 표면 문구 drift 차단 (N1 follow-up).
- **리뷰지점:** ④b 독립 Opus judge가 **md5로 ask 4문구 byte-identity 확정** + 행동 델타(ledger
  기반 발화=ask와 동일 의도적 parity) 안전 + misgrounding 제외 보존 + lazy-import 불변식 + mutation
  RED 재현. chat은 @muse/mcp를 runtime `await import`(bun 바이너리), 타입만 `import type`.
- **리스크:** 낮음 — 결정론적, recordChatWeaknessForTurn 양 분기 불변(부작용 동일), fail-close(throw→
  no nudge). nit: chat이 grounded 성공 시 recordWeaknessResolved 안 함(ask는 함) → 닫힌 gap이 BKT
  mastery까지 계속 nudge (backlog ◦ NEXT로 등록, 범위 밖·기존 공유-ledger 속성).
- **형제-감사:** ask/chat 두 point-of-use 표면 모두 이번에 공유 헬퍼로 수렴 — recap은 별도 selectVolatileBeliefs 경로(무관).

## fire 3 · 2026-06-20 · skill v2.0.0 · `b801ab88`
meta: value-class=new-capability · pkg=@muse/memory · kind=consolidation/decay · verdict=PASS · firesSinceDrill=3
ratchet: testFiles=1058 (tests added to existing recall-promotion.test.ts) · fabrication 0 · gates: memory 456 + check EXIT=0 ALL clean + self-eval ok + lint pass

- **무엇:** `selectForgettable`에 `importanceHitsFloor`(default 8) 추가 — 평생 recall hit이 floor
  이상인 기억은 idle+decayed여도 fade 후보에서 제외. AND-결합(후보 제거만, 더 공격적 망각 불가).
- **왜:** fade가 recency-DECAYED score(hits×2^(-age/half))만 봐서, 평생 자주 recall됐지만 최근 idle한
  기억이 거의 안 쓰인 기억처럼 fade됨 — lifetime frequency(importance) 무시. MemoryBank(arXiv:2305.10250)의
  frequency-consolidation = 자주 쓰인 기억은 strength가 굳어 Ebbinghaus decay 저항.
- **리뷰지점:** ④b 독립 Opus judge가 **배선 end-to-end 확인**(manual `memory consolidate` + daemon tick
  → consolidationPlan → selectForgettable, persistFade 사이드카까지) · 산수 RED-before/GREEN-after(established
  hits10 score0.19≤0.25라 구코드선 fade됐음) · 비순환(raw hits는 decayed score와 다른 새 정보) · 무회귀(기존
  hits8 케이스는 score 필터에서 이미 제외). 다양성: fire1 mcp/RL · fire2 cli/wiring → fire3 memory/consolidation.
- **리스크:** 낮음 — non-destructive(fade는 report), AND-결합 안전, default 8은 reasoning-set(튜닝 ◦는 다른
  consolidation 상수들과 함께 미해결). 형제-감사: selectPromotableMemories는 minHits+minScore+score랭킹이라
  "lifetime frequency 무시" 결함 없음 → fade-only가 옳음(half-fix 아님).
## fire 4 · 2026-06-20 · skill v2.0.0 · `9f2f484b`
meta: value-class=wiring · pkg=@muse/cli · kind=whetstone resolve-parity · verdict=PASS · firesSinceDrill=4
ratchet: testFiles=1061→1062 (new chat-weakness-resolve.test.ts) · fabrication 0 · gates: cli 2771 + check EXIT=0 ALL clean + self-eval ok + lint pass · merge-to-main: n/a (fire 4 ≠ ×3; next at fire 6)

- **무엇:** chat의 grounded-success 경로에 weakness RESOLVE 배선 — 새 순수 `isChatGroundedSuccess`(matches>0 ∧ axis null) + `chatResolveWeakness`(lazy, best-effort) → `recordWeaknessResolved`(BKT mastery). ask의 `recordAskWeaknessResolvedLive`와 패리티.
- **왜:** ask는 grounded 성공 시 약점을 resolve해 nudge를 멈추는데 chat은 record만 하고 resolve를 안 해서, 한 번 막혔던 토픽이 이후 성공해도 계속 nudge. fire-2 ④b judge nit를 닫음.
- **리뷰지점:** ④b 독립 Opus judge가 **no-false-resolve 견고**(refusal/misgrounding/unbacked/무-evidence 전부 제외, mutation으로 matches 가드 load-bearing 확인) + ask 패리티 충실+더 엄격(matches>0 추가 → 오탐 더 적음) + record/resolve 상호배타(axis null vs non-null) + 동일 raw message 키 + BKT 단일스텝은 0.95 mastery에 못 미쳐 안전. 다양성: fires=(mcp,RL)·(cli,wiring)·(memory,consolidation)·(cli,wiring) — (cli,wiring) 2/4, 임계(6/8) 미만 OK.
- **리스크:** 낮음 — 결정론적 술어, ledger-only 쓰기(finalResponse 불변), fail-close(throw→무동작). nit(judge): isChatGroundedSuccess의 unbackedAction 인자는 호출부서 항상 false(무해, 술어 self-contained 유지).
- **defer 기록:** validateSkillToolReferences(애초 fire-4 후보)는 Skill에 구조화된 tool 필드가 없어 휴리스틱 추출이 shell명령/식별자를 오탐→유효스킬 거부하는 UNSOUND. 선결=skill contract에 tool-참조 관례 추가. 배선 site(autoconfigure:850, toolRegistry 보유)는 준비됨. backlog에 블로커 기록.

## fire 5 · 2026-06-20 · skill v2.0.0 · `1bde1536`
meta: value-class=micro-fix · pkg=@muse/cli · kind=whetstone doctor-UX · verdict=PASS · firesSinceDrill=5
ratchet: testFiles→1064 (new doctor-weakness-labels.test.ts) · fabrication 0 · gates: cli 2773 + check EXIT=0 ALL clean + self-eval ok + lint pass · merge-to-main: n/a (fire 5 ≠ ×3; next at fire 6)

- **무엇:** user-facing `muse doctor --weaknesses`(`formatWeaknesses`)가 source-conflict·misgrounding을
  raw 키로 노출하던 걸 친화 라벨 추가로 해소 (WEAKNESS_AXIS_LABEL에 2개 엔트리). G1 RESIDUAL 닫음.
- **왜:** 두 축은 ledger에 실제 WRITTEN인데 라벨 맵에 없어 `?? axis` fallback으로 "misgrounding" 원시
  키가 사용자에게 그대로 보임 — 자기-보고 UX 흠.
- **리뷰지점:** ④b 독립 Opus judge PASS — purely additive(기존 라벨/fallback 불변), 두 축 모두 실제
  WeaknessAxis member·WRITTEN 확인, OUTCOME 테스트(친화 라벨 렌더+raw 키 누출 없음)·mutation RED 검증.
  형제-감사: formatDevFixableWeaknesses는 dev-facing이라 raw axis 의도적 유지(half-fix 아님, judge 동의).
- **리스크:** 매우 낮음 — display-only, 데이터/게이트 불변, fabrication 무관.
- **vein 신호:** self-dev 쉬운 결정론 vein이 thinning — 남은 고가치는 대형/블록드(T2-c memory-promotion
  recall-count 선결, T3-d self-fork review, reflection-dedup corpus 튜닝). 다음 fire는 다른 (pkg,kind)
  또는 그 대형 항목 decompose 권장. 다양성: fires=(mcp,RL)·(cli,wiring)·(memory,consolidation)·(cli,wiring)·(cli,micro-fix).

## fire 6 · 2026-06-20 · skill v2.0.0 · `8b12d589`
meta: value-class=new-capability · pkg=@muse/memory · kind=consolidation/promote-spacing · verdict=PASS · firesSinceDrill=6
ratchet: testFiles=1064 (tests added to existing recall-promotion.test.ts) · fabrication 0 · gates: memory 473 + check EXIT=0 ALL clean + self-eval ok + lint pass · merge-to-main: fires 4-6 (this fire, ×3)

- **무엇:** `selectPromotableMemories`에 ACT-R spacing 가드(`minDistinctAccessDays`, default 2) — per-access 이력 있는 레코드는 ≥2 distinct 날에 recall돼야 always-on 페르소나로 승급. legacy(recentAccessMs 없음)는 skip.
- **왜:** 기존 promote 필터는 hits+score만 봐서 한 세션 burst(같은 날 5회)가 durable 입증 없이 페르소나 오염. ACT-R 분산학습(Anderson & Schooler 1991): massed ≠ durable. fire-3 fade frequency-floor의 PROMOTE-side 형제(쌍 완성: fade는 established 보호, promote는 burst 배제).
- **리뷰지점:** ④b 독립 Opus judge PASS — 무회귀(전 ACT-R 테스트 레코드 ≥2 distinct days, NOW=UTC자정이라 off-by-one 없음, mutation으로 spacedOk load-bearing 검증) · false-negative은 영구차단 아닌 DEFER(judge가 store FIFO cap=20 edge까지 시뮬: 후일 접근이 eligibility 복원) · 양 caller(daemon tick + commands-memory promote)로 default 도달 · 확장/재정렬 없음 · PromotedMemory shape 불변.
- **리스크:** 낮음 — only removes burst candidates(non-destructive), legacy short-circuit 보장. nit(judge): personal-recall-hits-store cap=20과의 좁은 edge(1 early-day + 20 same-later-day → distinct 1로 collapse)는 그 자체가 massed라 spacing 신호 약함 — 허용.

## fire 7 · 2026-06-20 · skill v2.0.0 · (scout — no code)
meta: value-class=scout · pkg=n/a · kind=exhaustion-assessment · verdict=SCOUT · firesSinceDrill=6
ratchet: testFiles=1064 · fabrication 0 · gates: self-eval ok (no code change) · merge-to-main: n/a (fire 7 ≠ ×3)

- **무엇:** 실패 연료 0(.muse/runs 없음) + 쉬운 결정론 self-dev vein thinning 판단 → 3번째 스카웃으로
  토큰 안 태우고(EXHAUSTION 규칙) 최고가치 대형 항목 T3-d를 정밀 평가 → **MISFIT/STALE로 reassess**(backlog ⊘).
- **왜(발견):** T3-d "제안 memory/skill 쓰기 verifyGrounding" — (a)SKILL 절반: 스킬 드래프트는 의도적
  일반화라 faithfulness-judge가 유효 일반화 오탐(validateSkillToolReferences와 동일 unsound 클래스),
  이미 constraint+risk-scan 게이트됨. (b)MEMORY 절반: background-review에 memory-제안 arm 자체가 없음
  (skill arm + commitments arm뿐, commitments는 이미 draft-first/사람-확인). hermes 패턴 가치가 Muse엔
  이미 구조적으로 충족 → as-written 클린 윈 아님.
- **리뷰지점:** 6 fire 동안 self-dev 4표면 중 Playbook(1)·whetstone/cli(2,4,5)·memory-consolidation(3,6)
  생산적이나 thinning; reflection/dreaming은 성숙(코드 읽음, 깨끗한 결정론 슬라이스 적음, 나머지 corpus-튜닝);
  skill-authoring은 구조화 tool-필드 prerequisite. 남은 고가치는 design-heavy/corpus/blocked.
- **리스크/권고:** 가짜 일감 만들지 않고 정직 종료. 진안 옵션: (1)테마 repoint(예: orchestration/recall
  -quality 같은 다른 축) (2)corpus-튜닝 슬라이스 허용(reflection-dedup/episodic-threshold를 real-embed
  측정으로) (3)cron 그대로 두고 저수율 수용. 루프 자체는 건강(6 fire PASS·2 머지·회귀0).
- **lesson:** self-improvement 테마의 쉬운 결정론 vein은 ~6 fire에서 thinning; "스킬에 grounding/faithfulness
  게이트"는 반복 misfit(스킬=일반화≠grounded claim) — 다음 루프가 같은 함정 피하도록 증류.

## fire 8 · 2026-06-20 · skill v2.0.0 · `b467b9c3`
meta: value-class=new-capability · pkg=@muse/agent-core (+@muse/cli wiring) · kind=research-grounded/self-consistency-write-gate · verdict=PASS · firesSinceDrill=7
ratchet: testFiles=1064 (tests added to existing correction-distiller.test.ts) · fabrication 0 · gates: agent-core 2512 + cli(격리 통과, check 단일실패=chat-ink-render 포화-timeout 40/40 격리 GREEN) + self-eval ok + lint pass · eval:self-improving=라이브 배터리(결정론 코어는 unit-proven; LOCAL OLLAMA skip≠pass)

- **무엇(연구-기반, 진안 "우리만의 방법 연구"):** `distillConsistentStrategy` — 전략을 ONE 생성이 아니라 k=3 드래프트로 뽑아 **AGREE할 때만**(mean Jaccard ≥0.5) medoid를 bank. 불안정(불일치=환각성) 자기개선은 안 씀. `distillSessionCorrections`에 default-on 배선.
- **왜:** 기존 distill은 단일 생성이라 support/verbatim 게이트를 통과해도 one-off 추측일 수 있음. self-consistency(conformal abstention arXiv:2405.01563 + ReasoningBank MaTTS 2509.25140)를 **WRITE 경로**에 적용 — fabrication=0 floor를 read→learning-write로 확장(우리만의 적용; selfConsistency 0 hits였음).
- **리뷰지점:** ④b 독립 Opus judge PASS — end-to-end 게이팅 실측(reject→recordPlaybookStrategy 스킵), false-reject 위험 측정(동일프롬프트 T=0.3 진짜 패러프레이즈 ≈0.78 admit vs 발산 ≈0.0 reject; 드롭돼도 재증류+reward-decay 발화=영구손실0), majority/medoid/agreement math 정확, 무사이클(playbook↛correction-distiller), mutation 진짜(floor 비활성화→reject case RED). 다양성: agent-core/research-grounded(이전 6 fire와 다른 pkg+kind).
- **리스크:** 낮음 — only blocks unstable writes(non-destructive), k=1 비활성 백-호환, 오프라인 distill 경로라 3× model-call 비용 허용. nit→backlog ◦: rejected-agreement 텔레메트리로 0.5 floor false-reject율 실측 후 조정.
- **lesson:** 쉬운 backlog vein 마르면 멈추지 말고 연구-기반(open arXiv + 우리만의 적용)으로 새 메커니즘을 빌드 — fire 7 EXHAUSTION-종료는 과했음; 연구 경로가 정답(진안 피드백 [[feedback-self-improvement-loop-autonomy]]).

## fire 9 · 2026-06-20 · skill v2.0.0 · (reconcile + merge)
meta: value-class=infra · pkg=n/a · kind=divergence-reconcile+merge · verdict=MERGE · firesSinceDrill=8
ratchet: testFiles ↑ · fabrication 0 · gates: check EXIT=0 (agent-core 2515 · cli 2780 · memory 473, 타임아웃 0)

- **무엇:** 동시-루프가 LOCAL main을 갈라(내 fire-6 FF가 밀려남, fires 4-8이 main에서 이탈) → 브랜치를 현재 main(f3b33736)에 reconcile. rebase가 docs(INDEX) 반복충돌이라 더 깨끗한 경로 선택: `reset --hard main` + 4 feat 커밋 cherry-pick(코드 파일이 main 변경셋과 무겹침=무충돌) + check 재검증(전부 green) + docs 재적용. fires 4-8을 main에 재안착.
- **왜:** Tier1.5 3-fire 머지 지점(fire 9, ×3). 동시 루프들이 같은 LOCAL main에 머지하며 서로의 FF를 밀어내는 알려진 해저드 — 내 작업은 브랜치에 안전했고 cherry-pick으로 손실 0 재landing.
- **리뷰지점:** cherry-pick 후 `pnpm check` EXIT=0(시맨틱 통합 확인 — correction-distiller가 main이 바꾼 knowledge-recall import해도 무탈). 코드 무충돌, 결정론.
- **lesson:** 다중 루프 공유 LOCAL main에서 FF가 밀리면 rebase 반복충돌 대신 reset+cherry-pick(코드 무겹침일 때)이 빠르고 안전; 작업은 항상 브랜치가 source-of-truth. 머지 전 cherry-pick된 코드 check 재검증 필수.
