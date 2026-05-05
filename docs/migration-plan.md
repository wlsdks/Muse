# Muse Migration Plan

Source baseline: Reactor has 31 modules under `/modules`.

Current Muse baseline:
- Packages: 12
- Apps: 2
- Verified gate: `pnpm check`
- Local branch state at plan creation: `main` ahead of `origin/main` by 5 commits

## Current Count

| Bucket | Count | Meaning |
| --- | ---: | --- |
| Migrated foundation modules | 12 | Core concepts exist in Muse and are tested |
| Partially migrated modules | 6 | Surface exists but behavior is not complete |
| Remaining unmigrated modules | 13 | No dedicated Muse equivalent yet |
| Remaining work items | 19 | Partial completions + unmigrated modules |

## Migrated Foundation Modules

| Reactor module | Muse target | Current status |
| --- | --- | --- |
| `approval` | `packages/policy`, `packages/runtime-state` | Approval policy and pending approval stores exist |
| `common` | `packages/shared` | Shared IDs, JSON, and common value types exist |
| `context` | `packages/memory` | Context trimming and message-pair handling exist |
| `guard` | `packages/policy`, `packages/agent-core` | Input/output guards and fail-close runtime integration exist |
| `intent` | `packages/agent-specs` | Agent specs, rule resolver, registry, Kysely mapping exist |
| `memory` | `packages/memory`, `packages/runtime-state` | Context primitives and checkpoint stores exist |
| `model-routing` | `packages/model` | Model provider registry and provider prefix routing exist |
| `observability` | `packages/observability`, `packages/runtime-state` | In-memory tracing/metrics and run history stores exist |
| `persistence-schema` | `packages/db` | Kysely schema and migrations exist |
| `prompts` | `packages/prompts` | Prompt assembly primitives exist |
| `runtime-settings` | `packages/runtime-settings`, `apps/api` | Runtime settings service/store and API surface exist |
| `tool` | `packages/tools` | Tool registry/executor/sanitizer/approval path exists |

## Partially Migrated Modules

| Reactor module | Muse target | Remaining work |
| --- | --- | --- |
| `agent` | `packages/agent-core` | ReAct loop, tool-call execution, streaming, cancellation/timeout boundaries |
| `api` | `apps/api` | Full run lifecycle routes, persisted history routes, request validation |
| `core` | `packages/shared`, `packages/agent-core` | Stable public contracts and package boundaries |
| `hook` | `packages/agent-core` | Hook registry, typed lifecycle payloads, persisted hook traces |
| `response` | `packages/policy`, `packages/agent-core` | Response filters, structured output normalization, source/safety post-processing |
| `web` | `apps/api` | HTTP/SSE run endpoints and OpenAPI-ready route structure |

## Remaining Unmigrated Modules

| Priority | Reactor module | Muse target | Migration scope |
| ---: | --- | --- | --- |
| 1 | `mcp` | `packages/mcp`, `apps/api` | MCP server registry, REST registration, tool catalog projection |
| 2 | `scheduler` | `packages/scheduler`, `apps/api` | Scheduled job model/store/validator/dispatcher |
| 3 | `resilience` | `packages/resilience` | Retry, timeout, circuit breaker primitives |
| 4 | `cache` | `packages/cache` | Response cache with deterministic keys and TTL |
| 5 | `rag` | `packages/rag` | Document chunks, retriever interface, context injection |
| 6 | `auth` | `packages/auth`, `apps/api` | API auth boundary, user/workspace identity extraction |
| 7 | `admin` | `apps/api` | Admin routes for metrics, settings, specs, run history |
| 8 | `slack` | `packages/integrations` | External adapter pattern and Slack-compatible command envelope |
| 9 | `hook-integrations` | `packages/integrations` | Webhook/event adapters for lifecycle hooks |
| 10 | `eval` | `packages/eval` | Evaluation case model, runner, judge abstraction |
| 11 | `promptlab` | `packages/promptlab` | Prompt experiment models and lightweight runner |
| 12 | `multi-agent` | `packages/multi-agent` | Supervisor/handoff contracts over existing agent runtime |
| 13 | `autoconfigure` | `apps/api`, root config | Environment-driven assembly for production defaults |

## Execution Plan

1. Complete `mcp`, then connect it to `tools` and `apps/api`.
2. Complete `agent` ReAct/tool-call execution using the MCP/tool runtime.
3. Add `resilience` and `cache`, then route model calls through them.
4. Add `scheduler`, backed by runtime stores and protected by validation.
5. Add `rag` context injection before model calls.
6. Add `auth` and expand `admin`/history APIs.
7. Add external integrations (`slack`, `hook-integrations`) behind generic adapters.
8. Add `eval`, `promptlab`, and `multi-agent` once execution/runtime surfaces are stable.
9. Finish `autoconfigure` after production assembly choices are clear.

## Migration Rules

- Keep private names, organizations, real traces, credentials, and absolute source paths out of Muse.
- Prefer generic examples such as `user-1`, `workspace-1`, `read_file`, and `provider/model`.
- Each migration unit gets its own conventional commit.
- Run the narrow package tests first, then `pnpm check` before committing.
