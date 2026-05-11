---
name: codex
description: "OpenAI Codex CLI — delegate coding tasks (build features, refactor, review) to a backgrounded agent. Requires OPENAI_API_KEY."
emoji: "🧩"
homepage: "https://github.com/openai/codex"
metadata:
  {
    "muse":
      {
        "requires": { "anyBins": ["codex"] },
        "install":
          [
            { "id": "node", "kind": "node", "package": "@openai/codex", "bins": ["codex"], "label": "Install Codex CLI (npm)" }
          ]
      }
  }
---

# Codex Skill

Use the OpenAI Codex CLI for non-trivial coding work that needs file
exploration, multi-step planning, or background execution.

## When to use

- Building a new feature spanning multiple files
- Refactoring a module or migrating an API surface
- Reviewing a PR locally (clone, run tests, summarise)
- Anything where Muse-side direct edits would balloon the conversation

## When NOT to use

- One-line typo fixes (just edit the file directly)
- Reading code (use the read tools instead)
- Running tests / lint / format (those have dedicated tools)

## Invocation

Always run **one-shot**, never interactive. Use `codex exec` so the
agent runs to completion and prints results to stdout:

```bash
codex exec 'Add a fail-open path to packages/foo/src/bar.ts when env.FOO is unset, with a vitest covering the new branch.'
```

For long tasks (more than a minute or two), invoke via
`muse.skills.run` with `timeoutMs: 600000` so the 60-second default
doesn't kill it mid-flight.

## Environment

- `OPENAI_API_KEY` (required) — Codex reads this directly
- `CODEX_PROJECT_ROOT` (optional) — sets the working directory

## Output handling

Codex prints a structured plan + diff + test result block. Read the
output, then either:
- Accept the changes (they're already written to disk)
- Ask Codex to revise via a follow-up `codex exec`
- Roll back via `git restore` if the change is wrong

## Common pitfalls

- Don't pass `--interactive` — Codex will hang waiting for stdin.
- Don't run Codex against directories outside the current workspace
  unless you've reviewed the prompt for path leaks.
- Long-running Codex sessions can write large amounts to stdout;
  the 16KB-per-stream cap on `muse.skills.run` will truncate. For
  audits use `--output-file` to capture full output to disk.
