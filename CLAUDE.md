# Muse - Claude Code Instructions

Claude Code should use this file as the local working guide for Muse. `AGENTS.md` is the shared
cross-agent source of truth. Keep this file aligned with `AGENTS.md` when architecture or workflow rules
change.

## Current Mission

Muse is being created as the migration target for Reactor. The goal is not to recreate Reactor's
Kotlin/Spring Boot module structure. The goal is to carry over Reactor's agent runtime discipline into a
new TypeScript-first product with server, CLI, web UI, and a Rust execution runner.

## Fixed Technical Direction

```text
Language: TypeScript
Runtime: Node.js 24 LTS
Package manager: pnpm workspace
Server: Fastify
Database: PostgreSQL
DB access: Kysely
Web UI: React + Vite + TanStack Query
CLI: TypeScript CLI + Ink TUI
Runner: Rust separate process
Model core: Muse-owned ModelProvider interface
Workflow framework: no default LangGraph.js dependency
```

## Non-Negotiable Architecture Rules

- `agent-core` must be model-agnostic.
- Provider SDKs belong behind adapters in `packages/model`.
- Do not make OpenAI, Anthropic, Vercel AI SDK, or LangGraph the runtime owner.
- Server and CLI must share the same agent runtime packages.
- Rust owns risky local execution: shell, process, filesystem, and sandbox boundaries.
- Guard logic is fail-close.
- Hook logic is fail-open.
- Security must be deterministic code, not prompt instruction.
- Tool output is untrusted.
- Tool loops need explicit limits and timeouts.
- Message pair integrity must be preserved.
- Prompt and protocol changes need tests or snapshots once the scaffold exists.

## Planned Layout

```text
apps/
  api/
  web/
  cli/

packages/
  agent-core/
  model/
  tools/
  policy/
  memory/
  db/
  tracing/
  shared/

crates/
  runner/
```

## CLI Product Rules

The CLI is not a wrapper afterthought.

- Use `commander` for commands.
- Use `@clack/prompts` for setup and small interactions.
- Use Ink for full TUI flows.
- Store user config at `~/.config/muse/config.json`.
- Store workspace run state under `.muse/runs/*.jsonl`.
- Support both local mode and remote API mode.
- Keep credentials in OS keychain or an encrypted auth store.
- Execute risky local operations through the Rust runner.

## Model Provider Rules

Model support should be OpenCode-like: users can connect multiple providers and choose models without
changing agent code.

Required provider families:

- OpenAI
- Anthropic
- Google Gemini
- OpenRouter
- Ollama
- LM Studio or another OpenAI-compatible local endpoint
- Custom OpenAI-compatible endpoint

Every model entry must expose capabilities such as streaming, tool calling, structured output, vision,
reasoning, prompt caching, context window, output limit, local/remote, cost, and latency profile.

## Working Rules for Claude Code

- Read `AGENTS.md` before making architecture decisions.
- Check `git status --short --branch` before editing.
- Keep changes scoped to the current migration milestone.
- Do not rewrite unrelated files.
- Prefer `rg` for code search.
- Use small, conventional commits after coherent units of work.
- Use `git diff --check` for documentation/config-only changes.
- When the TypeScript scaffold exists, run the relevant package tests before committing.
- When the Rust runner exists, run crate-level `cargo test` for runner changes.

## Commit Style

Use Conventional Commits:

- `feat:`
- `fix:`
- `refactor:`
- `test:`
- `docs:`
- `chore:`

For this repository, migration setup commits should usually be `docs:` or `chore:` until executable
scaffolding exists.
