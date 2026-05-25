# Default Multi-Agent Workers — Design

Date: 2026-05-25
Branch: `feat/multi-agent-default-workers`

## Problem

A fresh user's `agentSpecRegistry` is empty, so `POST /api/multi-agent/orchestrate`
(and `muse orchestrate`) fail with `NoAgentWorkerError` / HTTP 409
`NO_AGENT_WORKERS`. Multi-agent orchestration is therefore a "blank framework" out
of the box — the completeness check flagged it, and it's the same failure
`smoke:live` hit ("No worker completed the orchestration").

## Goal

Make orchestration work out of the box for the default (in-memory) personal
runtime by seeding two enabled default agent specs, without changing single-agent
chat behaviour and without invasive boot-time mutation of a user's database.

## Design

### Default specs (`@muse/agent-specs`)

Export `DEFAULT_AGENT_SPECS: readonly AgentSpecInput[]` — two specs:

| id | name | mode | tools | keywords | systemPrompt (essence) |
|---|---|---|---|---|---|
| `default-generalist` | Generalist | standard | none | **`[]`** | "Answer the request directly and completely." |
| `default-critic` | Critic | standard | none | **`[]`** | "Review the prior answer for errors, gaps, and overclaims; produce a corrected, sharper result." |

Both `enabled: true`, `independentExecution: true`.

**Why `keywords: []` is load-bearing:** the single-agent router
(`RuleBasedAgentSpecResolver.resolve`, used only by the dedicated
`/agent-specs/resolve` endpoint) scores enabled specs by keyword overlap.
`scoreAgentSpec` returns `undefined` when `keywords.length === 0`, so empty
keywords guarantee the defaults are **never** selected for single-agent routing —
they exist purely as orchestration workers. Orchestration selects workers from
`listEnabled()` independent of keywords (worker `canHandle` is constant), so the
defaults still work as orchestration workers.

**Why no tools:** local Qwen tool-selection reliability (`tool-calling.md`) — pure
reasoning workers avoid adding tool-selection load to the default experience.

### Seeding (`autoconfigure`, `index.ts` ~437)

```
const defaultsOn = parseBoolean(env.MUSE_MULTI_AGENT_DEFAULT_WORKERS, true);
const agentSpecRegistry = db
  ? new KyselyAgentSpecRegistry(db)                      // DB: unchanged (out of scope)
  : new InMemoryAgentSpecRegistry(defaultsOn ? DEFAULT_AGENT_SPECS : []);
```

- In-memory path (the personal default): seed via the constructor — synchronous,
  no await, no persistence side-effect.
- `MUSE_MULTI_AGENT_DEFAULT_WORKERS=false` → empty registry (preserves the
  empty→409 path).

### Out of scope (documented limitations, not half-builds)

- **DB (Kysely) seeding.** A DB-backed deployment is operator-managed; auto-
  inserting rows into the user's Postgres on every boot is invasive. DB users seed
  their own specs (the empty→409 path stays). A future seed-if-empty helper can
  add this if needed.
- No UI/CLI for managing the defaults beyond the env opt-out.

## Data flow

Unchanged. `orchestrate` → `agentSpecRegistry.listEnabled()` → now returns the two
defaults for a fresh in-memory user → `createSpecWorker` × 2 → orchestrator runs.

## Testing

- **`@muse/agent-specs` unit:** `DEFAULT_AGENT_SPECS` has two specs with distinct
  ids/names, `enabled: true`, `keywords: []`; seeding an `InMemoryAgentSpecRegistry`
  with them yields `listEnabled().length === 2`; `scoreAgentSpec(default, anyText)`
  returns `undefined` (no routing hijack).
- **`autoconfigure` unit:** an in-memory `buildMuseContext` exposes an
  `agentSpecRegistry` whose `listEnabled()` returns the two defaults; with
  `MUSE_MULTI_AGENT_DEFAULT_WORKERS=false` it returns `[]`.

## Verification & non-regression (from design review)

- **smoke:broad needs no change:** the "409 when no specs enabled" test self-skips
  when specs already exist; the run/parallel/race tests pass explicit `workerIds`,
  so the two defaults don't affect their assertions.
- No existing autoconfigure/api unit test assumes an empty default registry
  (verified by grep).
- `pnpm lint` 0/0; `@muse/agent-specs` + `@muse/autoconfigure` package tests green;
  full build clean.
