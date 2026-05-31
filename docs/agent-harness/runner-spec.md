---
title: 하네스 러너 스펙 (Harness Runner)
audience: [개발자, AI 에이전트]
purpose: 핸드오프·역할·게이트를 "사람이 양식을 채움"에서 "런타임이 강제"로 올리는 실행 규약
status: draft
updated: 2026-05-31
sources_basis: [harness-acceptance 실측 9회, team-roles·role-prompts·handoff-template·verification-and-guardrails·loop-budget, Anthropic 3-agent harness(컨텍스트 리셋·핸드오프 아티팩트)]
related: [team-roles.md, handoff-template.md, role-prompts.md, verification-and-guardrails.md, loop-budget.md, architecture.md, README.md]
---

# 하네스 러너 스펙 (Harness Runner)

> **왜 이 칸인가?** 지금 하네스는 역할·양식·게이트가 다 정의됐고 실제 Claude Code로 9회 돌아갔지만,
> 그 흐름을 **사람이 손으로** 이어붙였습니다([harness-acceptance §7.5](harness-acceptance.md)의 연쇄가
> 그 증거). "엄청나게 좋은 하네스"가 되려면 그 사이클을 **런타임이 강제**해야 합니다 — 누가 돌려도
> 같은 양식·같은 게이트가 자동으로 적용되도록. 이 문서는 그 러너의 **동작 규약**(무엇을 강제하나)을
> 말로 정의합니다. 구현이 아니라 "러너가 반드시 지킬 계약"입니다.

## 0. 한 줄 원칙

**사이클은 사람이 아니라 러너가 돌린다.** 역할 프롬프트·핸드오프 양식·게이트·한도를 러너가 자동으로
끼우고, 사람은 승인 지점에서만 개입합니다.

## 1. 한 작업의 강제 사이클

러너는 한 작업을 다음 순서로 돌리고, **각 전이마다 게이트를 통과해야** 다음으로 갑니다.

```
요청 ─▶ [PLAN] 플래너 ──(계획 게이트)──▶ [BUILD] 워커 ──▶ [EVAL] 평가자
                                                              │
                                  PASS ─▶ [LEARN] 큐레이터 ─▶ DONE
                                  FAIL ─▶ 피드백 → [BUILD] (반복 한도까지)
```

- 각 단계는 [role-prompts](role-prompts.md)의 해당 블록을 **자동 주입**받는다(사람이 안 붙임).
- 단계 산출은 [handoff-template](handoff-template.md)의 자기 섹션에만 기록되고, 다음 단계는 그
  양식만 입력으로 받는다(컨텍스트 리셋).

## 2. 러너가 강제하는 것 (계약)

- **양식 강제** — 각 역할의 출력이 핸드오프 양식 스키마에 맞아야 한다. 안 맞으면 한 번 재요청, 그래도
  안 되면 BLOCKED.
- **계획 게이트(앞단)** — BUILD 전에 계획의 **자체 정합성**을 점검(수용 기준이 서로 모순 없나, 예시와
  기준이 일치하나). 통과해야 BUILD 진입. (※ 골든 측정에서 본 "계획이 틀리면 하류가 다 어긋난다"의
  방어 — [golden-set] 관찰 참고.)
- **완료 게이트(뒷단)** — 평가자 PASS + (가능하면) 자동 채점이 통과해야 DONE. 불확실은 막힘 우선.
- **만든 자 ≠ 판정하는 자** — BUILD와 EVAL은 서로 다른 에이전트 인스턴스로 강제(평가자가 자기 빌드를
  못 본다).
- **루프 한도** — 횟수·시간·예산 하드 캡([loop-budget](loop-budget.md)). BUILD↔EVAL 반복도 상한, 넘으면
  BLOCKED로 사람에게 올림.
- **압축·체크포인트** — 길어지면 압축([context-compaction](context-compaction.md)), 분기점마다
  체크포인트(실패 시 재개).

## 3. 사람이 개입하는 지점 (HITL)

러너는 자동이되, **이 셋은 반드시 사람**:
- **외부 전송/상태 변경** — draft-first, 사람 확인 후에만([verification-and-guardrails](verification-and-guardrails.md)).
- **받은 노하우 승격** — 격리된 스킬은 사람이 올려야 활성([skills-and-mcp](skills-and-mcp.md)).
- **BLOCKED 해소** — 열린 질문·한도 초과는 사람이 판단.

## 4. 관측 (러너가 남기는 것)

- 모든 전이·도구 호출·게이트 판정을 **상관 ID 하나로** 추적([debugging-and-dx](debugging-and-dx.md)).
- 각 실행은 **재현 가능한 트레이스** + 비용·단계 기록. 골든 과제로 회귀([harness-acceptance](harness-acceptance.md)).

## 5. 지금과의 간극 (정직)

- **현재**: 역할·양식·게이트가 **문서로 정의**됐고 사람이 claude를 손으로 이어 9회 돌려 흐름을 입증.
- **이 스펙이 정의하는 것**: 그 강제·자동 끼움·게이트 통과를 **러너가** 하는 계약.
- **아직 아닌 것**: 이 스펙을 실행하는 코드(러너 구현)는 없음 — 다음 단계는 이 계약을 만족하는 최소
  러너를 만들고, 골든 묶음으로 그 러너 자체를 검증하는 것.

## 한 줄 요약 (러너 체크리스트)

1. 역할 프롬프트가 **자동 주입**되나(사람이 안 붙임)?
2. 단계 전이마다 **게이트 통과**가 강제되나(계획 앞·완료 뒤)?
3. BUILD≠EVAL 인스턴스가 **강제 분리**되나?
4. 루프 **하드 캡** + 압축·체크포인트가 걸리나?
5. 외부전송·승격·BLOCKED만 **사람**에게 가나?
6. 전 과정이 **상관 ID 트레이스**로 남나?

---

## 출처 (근거)

- [harness-acceptance §7.5](harness-acceptance.md) (실제 Claude Code 9회 실측 — 현재는 사람이 사이클을 이어붙임)
- [team-roles](team-roles.md) · [handoff-template](handoff-template.md) · [role-prompts](role-prompts.md) (강제 대상)
- [verification-and-guardrails](verification-and-guardrails.md) · [loop-budget](loop-budget.md) · [debugging-and-dx](debugging-and-dx.md) (게이트·한도·관측)
- Anthropic — [3-agent harness](https://www.infoq.com/news/2026/04/anthropic-three-agent-harness-ai/) (컨텍스트 리셋 + 구조화 핸드오프 아티팩트)
