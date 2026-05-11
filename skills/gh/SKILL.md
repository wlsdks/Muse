---
name: gh
description: "GitHub CLI — read PR status, CI logs, issues, releases, and run arbitrary `gh api` queries."
emoji: "🐙"
homepage: "https://cli.github.com/"
metadata:
  {
    "muse":
      {
        "requires": { "bins": ["gh"] },
        "install":
          [
            { "id": "brew", "kind": "brew", "formula": "gh", "bins": ["gh"], "label": "Install GitHub CLI (brew)" },
            { "id": "apt", "kind": "apt", "package": "gh", "bins": ["gh"], "label": "Install GitHub CLI (apt)" }
          ]
      }
  }
---

# GitHub Skill

Use the `gh` CLI for everything GitHub. Auth runs once via `gh auth
login`; thereafter every command in this skill works.

## When to use

- Reading PR status, reviews, merge readiness
- Tailing or fetching CI / workflow logs
- Creating, closing, commenting on issues
- Querying repos, releases, collaborators, contributors
- Anything that maps cleanly to a GitHub API call

## When NOT to use

- Local git operations (commit, push, pull, branch) — use `git`
  directly via `muse.skills.run` of a future `git` skill, or the
  agent's bash tooling.

## Common invocations

```bash
# PR status
gh pr view 123
gh pr checks 123 --watch

# Workflow runs
gh run list --limit 5
gh run view <run-id> --log

# Issues
gh issue list --state open --label bug
gh issue comment 456 --body "Reproduced on macOS 14.4"

# Raw API
gh api repos/wlsdks/Muse/pulls --paginate
```

## Output handling

Prefer `--json field1,field2,...` for any non-trivial parse. Plain
text output is fine for short reads but is fragile for piping.

## Environment

- `GH_TOKEN` (optional) — overrides the keychain token if set
- `GH_HOST` (optional) — for GitHub Enterprise instances

## Common pitfalls

- `gh pr create` from a detached HEAD silently picks the upstream
  default branch. Always run from a feature branch.
- `gh run watch` and `gh pr checks --watch` block — invoke via
  `muse.skills.run` with a generous `timeoutMs` or skip the watch
  flag entirely.
