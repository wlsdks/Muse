# docs/audits — 감사 기록 인덱스

일회성 감사는 SNAPSHOT(불변), 원장은 계속 append된다. 새 감사 문서를 추가하면 여기에 행을
더한다.

| 파일 | 성격 | 내용 |
|---|---|---|
| [core-contract-audit-2026-07-15.md](core-contract-audit-2026-07-15.md) | SNAPSHOT | 프로덕션 에이전트 경로의 계약 추적 감사 |
| [typescript-7-configuration-audit-2026-07-16.md](typescript-7-configuration-audit-2026-07-16.md) | SNAPSHOT | tsconfig/프로젝트 그래프 감사 |
| [typescript-7-source-quality-2026-07-16.md](typescript-7-source-quality-2026-07-16.md) | **원장 (활성)** | 레포 전역 소스품질 프로그램의 증거 원장 — 경계별 날짜 엔트리 append |

선행 기록: [docs/quality-review-2026-06-13.md](../quality-review-2026-06-13.md) (superseded —
이 디렉토리가 역할 승계).
