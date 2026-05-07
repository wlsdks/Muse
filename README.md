# Muse

A provider-neutral, JARVIS-style AI conductor. One coherent reasoning
loop, any LLM, any tool, any MCP server.

[한국어 README →](README.ko.md)

## What Muse is

Muse orchestrates an LLM-powered agent without locking you into a
single vendor. The same `agent-core` runtime drives the API server,
the CLI, and the (in-progress) web UI — and you choose the model
provider at runtime, not at build time.

- **Model-neutral core.** OpenAI, Anthropic, Google Gemini, OpenRouter,
  Ollama, LM Studio, and any OpenAI-compatible endpoint live behind a
  single `ModelProvider` adapter. The runtime calls the abstraction,
  never a vendor SDK directly.
- **Tool & MCP first.** Tools are first-class — read, write, or
  execute — with explicit risk levels, approval gates, and
  deterministic loop limits. The MCP layer ships eight built-in
  loopback servers (`muse.time`, `muse.text`, `muse.math`,
  `muse.json`, `muse.url`, `muse.crypto`, `muse.diff`, `muse.regex`)
  alongside stdio / SSE / streamable-HTTP transports for external
  servers.
- **Multi-agent orchestration.** Sequential or parallel worker
  fan-out, an in-memory cross-agent message bus, per-run history
  with full conversation snapshots, and aggregate stats — all
  exposed over HTTP and SSE.
- **Deterministic safety.** Guards are fail-close, hooks are
  fail-open, and security lives in code (not in prompt instructions).
  Tool output is untrusted until sanitised. Risky local execution
  flows through a separate Rust runner (`crates/runner`).

## Architecture at a glance

```
apps/
  api/        Fastify API server (chat, agent specs, multi-agent, MCP, scheduler, RAG, …)
  cli/        terminal agent (commander + Ink TUI)
  web/        React UI (early scaffold)

packages/
  agent-core/         ReAct + Plan-Execute loops, guard pipeline, hook registry
  model/              ModelProvider interface + provider adapters
  tools/              tool registry, executor, sanitiser, approval path
  multi-agent/        SupervisorAgent, MultiAgentOrchestrator, message bus, history
  mcp/                MCP transports + loopback servers
  policy/             input / output guards, approval policies, adversarial red-team harness
  memory/             context trimming, conversation summaries, user-memory store
  rag/                chunking, BM25/RRF retrieval, reranking, HyDE, decomposition
  observability/      tracing, latency / token-cost queries, JARVIS snapshot
  runtime-state/      run history, hook traces, approval store
  db/                 Kysely schema + SQL migrations
  scheduler/          cron jobs + distributed locks
  ...

crates/
  runner/             Rust sandbox: shell / process / file execution
```

## Quick start

```bash
# Requirements: Node.js 24 LTS + pnpm 10
pnpm install
pnpm build
pnpm test

# Bring up the API with a real provider:
GEMINI_API_KEY=… MUSE_MODEL=gemini/gemini-2.0-flash MUSE_MODEL_PROVIDER_ID=gemini \
  pnpm --filter @muse/api dev

# Talk to it:
curl -X POST http://127.0.0.1:3000/api/chat \
  -H 'content-type: application/json' \
  -d '{"message":"What time is it? Use a tool."}'

# Or use the CLI:
node apps/cli/dist/index.js \
  --api-url http://127.0.0.1:3000 \
  chat "What time is it? Use a tool."
```

## Verification

Tests are the only form of verification. The repo ships four gates:

```bash
pnpm check                                      # build + test for every workspace
pnpm smoke:broad                                # 49 HTTP endpoints, diagnostic provider
pnpm smoke:live                                 # 6 HTTP endpoints, real LLM (auto-skips without key)
pnpm verify:reactor-routes                      # parity check vs the legacy source
```

`smoke:live` runs against the first available `*_API_KEY`
(`GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) and
asserts the model→tool→model loop end-to-end, including the
streaming SSE tool-call frames.

## Provider configuration

Pick a model at runtime via env:

| Env | Example | Notes |
| --- | --- | --- |
| `MUSE_MODEL` | `gemini/gemini-2.0-flash` | `<providerId>/<modelId>` form |
| `MUSE_MODEL_PROVIDER_ID` | `gemini` | optional override; inferred from prefix |
| `MUSE_MODEL_API_KEY` | `…` | per-provider env vars (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`) also work |
| `MUSE_MODEL_BASE_URL` | `http://localhost:11434/v1` | overrides for OpenAI-compatible endpoints (Ollama, LM Studio, custom) |

## Contributing

This repo follows a lean-contract style for Claude Code
collaboration:

- [`CLAUDE.md`](CLAUDE.md) — the contract every Claude Code agent reads first.
- [`AGENTS.md`](AGENTS.md) — cross-agent product brief.
- [`.claude/rules/`](.claude/rules/) — domain-specific rules (architecture, testing, commits, …).
- [`.claude/commands/`](.claude/commands/) — reusable slash commands.
- [`.claude/agents/`](.claude/agents/) — subagent definitions.
- [`docs/migration-plan.md`](docs/migration-plan.md) — running iteration log.

Use Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`,
`docs:`, `chore:`). All commits and PR descriptions are written in
English.

## License

TBD. The runtime, adapters, and tooling are intended to be open
source.
