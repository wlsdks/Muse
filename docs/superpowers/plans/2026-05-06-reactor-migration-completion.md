# Reactor Migration Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining Reactor-to-Muse migration gaps with evidence-backed parity checks, DB-backed runtime state, and missing product surfaces.

**Architecture:** Treat Reactor as the behavioral baseline, not a Spring module template. Muse keeps TypeScript package boundaries and migrates queryable state into Kysely stores, while route compatibility and product surfaces call those stores instead of process-local maps.

**Tech Stack:** TypeScript, Node.js 24 LTS, pnpm workspace, Fastify, Kysely, PostgreSQL, Vitest, Playwright, Testcontainers, Rust runner.

---

## Current Baseline

Run these commands before and after each milestone:

```bash
REACTOR_SOURCE_DIR=/Users/stark/ai/reactor pnpm verify:reactor-routes
REACTOR_SOURCE_DIR=/Users/stark/ai/reactor pnpm verify:reactor-db
pnpm check
```

Expected current state on May 6, 2026:

```text
verify:reactor-routes: 255 Reactor routes, 0 missing
verify:reactor-db: 52 Reactor tables, 62 Muse tables, 0 missing
pnpm check: passes, with Node v22 warning in the current shell
```

## Priority Order

1. DB parity tooling and backlog.
2. Auth/users/session persistence.
3. Admin audit, metrics, alerts, pricing, quota, and SLO persistence.
4. Feedback, prompt lab, personas, prompt templates, and intent persistence.
5. Guard and tool policy persistence.
6. Memory, conversation summaries, task memory, and user memory persistence.
7. RAG ingestion persistence.
8. Slack bot, FAQ, feedback tracking, and proactive channel persistence.
9. Agent eval, debug replay, and run-log persistence.
10. Observability OpenTelemetry/pino/persisted trace integration. Persisted trace-event sink is present; OpenTelemetry/pino export remains.
11. Provider adapter completeness. Initial OpenAI, Anthropic, Gemini, OpenRouter, Ollama, and OpenAI-compatible adapters are present.
12. CLI local/remote parity, `.muse/runs`, auth store, and Ink TUI.
13. Rust runner crate and tool bridge. Initial crate and `run_command` tool bridge are present.
14. Web UI and Playwright coverage.

### Task 1: DB Parity Audit Tool

**Files:**
- Create: `scripts/verify-reactor-db-parity.mjs`
- Create: `packages/db/test/reactor-db-parity-script.test.ts`
- Modify: `package.json`
- Modify: `docs/migration-plan.md`

- [x] **Step 1: Add parser coverage**

Add Vitest coverage for `CREATE TABLE`, comments, duplicate table definitions, family grouping, and missing-table output.

- [x] **Step 2: Implement the CLI**

The CLI accepts `--reactor`, `--muse`, and `--json`, defaults Muse to `process.cwd()`, reads Reactor SQL from `modules/persistence-schema` and `modules/admin`, reads Muse SQL from `packages/db/src/migrations.ts`, and exits `1` while required Reactor tables are missing.

- [x] **Step 3: Wire the npm script**

```json
"verify:reactor-db": "node scripts/verify-reactor-db-parity.mjs"
```

- [x] **Step 4: Verify**

```bash
pnpm --filter @muse/db test
REACTOR_SOURCE_DIR=/Users/stark/ai/reactor pnpm verify:reactor-db
```

Expected: package tests pass; DB parity command fails with a deterministic missing-table report until stores and migrations are added.

### Task 2: Auth/Users Persistence

**Files:**
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/src/migrations.ts`
- Modify: `packages/db/test/migrations.test.ts`
- Modify: `packages/db/test/schema.test.ts`
- Modify: `packages/auth/src/index.ts`
- Modify: `packages/auth/package.json`
- Modify: `packages/auth/test/auth.test.ts`
- Modify: `packages/autoconfigure/src/index.ts`
- Modify: `packages/autoconfigure/test/autoconfigure.test.ts`

- [x] **Step 1: Add `users`, `user_identities`, and `auth_token_revocations` to `MuseDatabase`**

Add Kysely table interfaces matching Muse naming and Reactor semantics: normalized account/email lookup, role preservation, created timestamp, identity provider lookup, and token revocation expiry.

- [x] **Step 2: Add explicit SQL migration**

Extend `0001_runtime_state` or create `0002_auth_state` with:

```sql
CREATE TABLE IF NOT EXISTS users (...);
CREATE TABLE IF NOT EXISTS user_identities (...);
CREATE TABLE IF NOT EXISTS auth_token_revocations (...);
```

Use synthetic defaults only. Do not migrate Reactor demo seed data.

- [x] **Step 2.5: Add remaining Reactor table-name parity**

All remaining Reactor persistent table names have Muse migration targets. This closes table-name parity, but it does
not complete store wiring.

- [x] **Step 3: Add async-capable Kysely stores without breaking the existing sync interface**

Keep `InMemoryUserStore` and `InMemoryTokenRevocationStore` as local/test defaults. Add `KyselyUserStore` and `KyselyTokenRevocationStore` behind a new async-compatible auth assembly path, then adapt `AuthService` only where API/autoconfigure can await.

- [x] **Step 4: Wire production assembly**

When `createMuseRuntimeAssembly({ db })` receives a Kysely handle, auth uses DB-backed user and token revocation stores.

- [x] **Step 5: Verify**

```bash
pnpm --filter @muse/db test
pnpm --filter @muse/auth test
pnpm --filter @muse/autoconfigure test
REACTOR_SOURCE_DIR=/Users/stark/ai/reactor pnpm verify:reactor-db
```

Verified with `pnpm --filter @muse/auth test`, `pnpm --filter @muse/auth build`, `pnpm --filter @muse/autoconfigure test`, `pnpm --filter @muse/api build`, and `pnpm --filter @muse/api test` under the current Node v22 shell. Full Node 24 verification remains required.

### Task 3: Admin Audit, Metrics, Alerts, Pricing, Quota, SLO

**Files:**
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/src/migrations.ts`
- Modify: `packages/runtime-state/src/admin-operations.ts`
- Modify: `apps/api/src/admin-routes.ts`
- Modify: `apps/api/src/reactor-compat-routes.ts`
- Modify: `apps/api/test/server.test.ts`

- [x] Add DB tables for `admin_audits`, `tenants`, `model_pricing`, `alert_rules`, `alert_instances`, `slo_config`, and `metric_*`.
- [x] Replace admin/audit/metric compatibility Maps with Kysely-backed stores.
  - [x] Move admin audit and metric audit event persistence into runtime-state stores.
  - [x] Move platform pricing and alert-rule compatibility Maps into stores.
- [x] Verify admin route contracts and `verify:reactor-db` count reduction for the `admin/audit/metrics` family.

### Task 4: Feedback, Prompt Lab, Persona, Intent Persistence

**Files:**
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/src/migrations.ts`
- Modify: `packages/promptlab/src/index.ts`
- Modify: `packages/agent-specs/src/kysely-store.ts`
- Modify: `apps/api/src/reactor-compat-routes.ts`
- Modify: `apps/api/test/server.test.ts`

- [x] Add DB tables for `feedback`, `experiments`, `trials`, `experiment_reports`, `personas`, `prompt_templates`, `prompt_versions`, and `intent_definitions`.
- [x] Move compatibility route state from local Maps into package-level stores.
  - [x] Move feedback compatibility state into `packages/promptlab` stores.
  - [x] Move prompt lab experiments, trials, and reports into `packages/promptlab` stores.
  - [x] Move persona, template, and intent compatibility state into stores.
- [x] Preserve Reactor response envelopes and optimistic/version checks.

### Task 5: Guard And Tool Policy Persistence

**Files:**
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/src/migrations.ts`
- Modify: `packages/policy/src/index.ts`
- Modify: `apps/api/src/reactor-compat-routes.ts`
- Modify: `apps/api/test/server.test.ts`

- [x] Add `input_guard_rules`, `output_guard_rules`, `output_guard_rule_audits`, and `tool_policy`.
- [x] Add Kysely-backed `tool_policy` store and wire `/api/tool-policy` compatibility through it.
- [x] Move input/output guard rules and output guard audits into Kysely-backed policy stores.
- [x] Keep guard fail-close and hook fail-open behavior unchanged.
- [x] Add tests for guard rule store mapping and preserve route list/create/update/delete/simulate/audit behavior coverage.

### Task 6: Memory And Context Persistence

**Files:**
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/src/migrations.ts`
- Modify: `packages/memory/src/index.ts`
- Modify: `packages/runtime-state/src/kysely-stores.ts`
- Modify: `apps/api/src/reactor-compat-routes.ts`
- Modify: `packages/memory/test/memory.test.ts`

- [x] Add Kysely-backed conversation summary store.
- [x] Preserve deterministic trimming and assistant/tool pair integrity.
- [x] Add Kysely-backed task memory and user memory stores.
- [x] Add Kysely-backed session tag store and wire admin session tag routes through runtime assembly.

### Task 7: RAG Ingestion Persistence

**Files:**
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/src/migrations.ts`
- Modify: `packages/rag/src/index.ts`
- Modify: `apps/api/src/reactor-compat-routes.ts`
- Modify: `packages/rag/test/rag.test.ts`

- [x] Add `rag_ingestion_policy` and `rag_ingestion_candidates`.
- [x] Persist ingestion review state and seed results.
- [x] Keep document bodies synthetic/redacted in tests.

### Task 8: Slack Persistence

**Files:**
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/src/migrations.ts`
- Modify: `packages/integrations/src/index.ts`
- Modify: `apps/api/src/slack-routes.ts`
- Modify: `apps/api/src/reactor-compat-routes.ts`
- Modify: `packages/integrations/test/integrations.test.ts`
- Modify: `apps/api/test/server.test.ts`

- [x] Add `slack_bot_instances` and `channel_faq_registrations`.
- [x] Persist bot config and FAQ registrations.
- [x] Persist response tracking and feedback metadata.
- [x] Preserve signature verification, retry deduplication, and mrkdwn formatting tests.

### Task 9: Eval, Debug Replay, And Run Logs

**Files:**
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/src/migrations.ts`
- Modify: `packages/eval/src/index.ts`
- Modify: `packages/runtime-state/src/run-history.ts`
- Modify: `apps/api/src/reactor-compat-routes.ts`
- Modify: `packages/eval/test/eval.test.ts`
- Modify: `apps/api/test/server.test.ts`

- [x] Add `agent_run_logs`, `agent_eval_cases`, `agent_eval_results`, and `debug_replay_captures`.
- [x] Persist replay source run, deterministic replay run, LLM judge output, and regression results.
- [x] Keep model calls behind Muse `ModelProvider`.

### Task 10: Product Surface Completion

**Files:**
- Create: `apps/web`
- Create: `crates/runner`
- Modify: `apps/cli/src/program.ts`
- Add tests under `apps/cli/test`, `apps/web`, and `crates/runner`

- [x] Add the initial `crates/runner` Rust child-process scaffold with JSON stdin/stdout protocol, timeout handling, output truncation, cwd/env controls, and shell-path rejection.
- [x] Add the `packages/tools` Rust runner bridge as an opt-in `run_command` execute-risk tool.
- [x] Add the initial `apps/web` Vite/React/TanStack Query operator surface for API health, chat, approvals, and recent runs.
- [x] Add `.muse/runs/*.jsonl` workspace state for remote CLI chat runs.
- [x] Build CLI local mode using `packages/agent-core`.
- [x] Add remote mode over SSE or WebSocket.
- [x] Add OS keychain or encrypted auth store.
- [ ] Add Ink TUI.
- [x] Add Rust runner process and TypeScript bridge for risky shell/process/file execution.
- [x] Add React + Vite + TanStack Query web UI.
- [ ] Add Playwright smoke tests for web flows.

## Completion Criteria

The migration is not complete until all of these are true:

```bash
REACTOR_SOURCE_DIR=/Users/stark/ai/reactor pnpm verify:reactor-routes
REACTOR_SOURCE_DIR=/Users/stark/ai/reactor pnpm verify:reactor-db
pnpm check
```

All three commands must pass under Node.js 24 LTS. The DB parity command must reach `Missing Reactor tables in Muse: 0`.
After table-name parity is green, each compatibility route family still needs Kysely-backed store wiring and behavior
tests before the migration can be called complete.
