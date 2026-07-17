# builder-evolution loop journal

> 테마: Builder/자동화 트랙 지속 개선 + 사용자 체감 기능 갭 발굴. cron `55ad6e29`(세션, 매시 :23),
> Tier2+(진안 2026-07-18 명시 승인: green일 때만 origin/main push). 중단: CronDelete 55ad6e29.

## fire 1 · 2026-07-18 · skill v2.1.1 · 454c3f797
meta: value-class=reliability · pkg=@muse/cli · kind=reliability · verdict=PASS · firesSinceDrill=1
ratchet: serve-core tests 22->45 · fabrication 0 · self-eval green(envInventory 등록시 수리 0ff19cd3c)
- 무엇: muse serve 수퍼비전 — 자식 예상외 사망시 지수백오프 재기동(1s..30s, 10분창 5회 서킷브레이크, 60s 생존시 리셋), 시그널이 sleep 갭에 와도 재기동 중단+클린 종료. 순수 policy(nextRestartDecision) 주입시계로 완전 유닛테스트.
- 왜: 2026-07-17/18 라이브에서 3회 문 실결함 — 자식 죽어도 수퍼바이저가 포트 빈 채 대기(좀비 클래스의 뿌리 절반).
- 리뷰지점: exit 0(정상 종료)은 재기동 안 함(restart: on-failure 의미론) — admin/shutdown 우회 방지.
- 리스크: give-up 후 수퍼바이저 종료 코드 = 마지막 자식 코드; launchd/systemd 래핑시 이중 재기동 가능성(외부 수퍼바이저와 조합 시 관찰 필요).
- 라이브: kill -9 자식 -> 1s 재기동 실측(새 pid, health 재서빙, 정직 로그) · TERM -> 자식 포함 클린 종료 · 고아 0.

## fire 2 · 2026-07-18 · skill v2.1.1 · (this commit)
meta: value-class=new-capability · pkg=@muse/scheduler+@muse/web+@muse/api · kind=capability-wiring · verdict=PASS(opus) · firesSinceDrill=2
ratchet: scheduler tests 169(+9) · web 529+browser16 · api e2e 신규 1(outcome-graded) · fabrication 0
- 무엇: Builder "도구 실행" 흐름 — 스케줄 잡(jobType mcp_tool)이 루프백 MCP 도구를 실제 실행하도록 `extraTools` 시임 배선(scheduler-runtime + runtime-assembly 주입), 웹 생성/편집 패널에 서버·도구 피커(`readRiskToolOptions`로 risk==="read"만), flow-edit-compile 도구 페이로드 컴파일, dynamic-scheduler 에러 메시지 실메시지 기록 픽스.
- 왜: 기존엔 mcp_tool 잡이 저장만 되고 실행 불가(외부 MCP 연결만 지원) — 빌더의 "도구 호출" 노드가 데드 표면이었음.
- 리뷰지점: write 도구는 실행 가능 집합(createLoopbackMcpToolsFromEnv)에 아예 미구성 — 조작 POST로 muse.messaging.send를 등록해도 not-connected로 FAILED, 무인 send 불가(opus 검증). toolArguments는 projection 비투영 유지.
- 리스크: 무인 write/execute 도구 정책은 [decision]으로 진안에게 — v1은 read-only fail-close.
- 라이브: 실브라우저(격리 HOME 데모서버) — 피커 14서버, messaging=providers/inbox만·reminders=list/search만(음성 케이스 실증), muse.time/now 흐름 생성→테스트 실행→실행 기록 SUCCESS+실타임스탬프 JSON 렌더.
