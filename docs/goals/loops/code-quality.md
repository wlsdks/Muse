# code-quality loop — 소스코드 구조/퀄리티 개선

브랜치 `loop/code-quality`, 워크트리 `/tmp/muse-code-quality`, cron `dc08dcdc` (20분).
모델 티어링: 분석 haiku · 계획 fable · 구현 sonnet · 난제만 opus.
행위-보존 리팩터/정리/테스트 보강만 — 기능 추가 없음. main 직접 push 금지.

## 커버리지 (한 fire = 한 영역, 전 패키지 순회)

| 영역 | 최근 fire | 상태 |
|---|---|---|
| packages/agent-core | – | 미방문 |
| packages/model | – | 미방문 |
| packages/cli (apps/cli) | – | 미방문 |
| packages/memory | – | 미방문 |
| packages/recall | – | 미방문 |
| packages/multi-agent | – | 미방문 |
| packages/shared | – | 미방문 |
| apps/api | – | 미방문 |
| apps/web | – | 미방문 |
| 기타 packages/* | – | 미방문 |

## 대기 발견 큐

(분석에서 나왔지만 아직 집행 안 된 발견)

## Fire 로그

| # | 대상 | 출하 | 검증 |
|---|---|---|---|
