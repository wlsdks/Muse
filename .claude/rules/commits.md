# Commits & push policy

## Conventional Commits

- `feat:` user-visible feature or new project capability
- `fix:` bug fix
- `refactor:` behavior-preserving restructuring
- `test:` test-only change
- `docs:` documentation-only change
- `chore:` tooling, config, dependency, repository maintenance

Subjects and bodies are written in English.

Make small commits after coherent milestones. One iteration goal
per commit (or two when a `feat:` naturally pairs with a `test:`).
Don't mix unrelated work into one commit.

## Push policy

- **Don't push, force-push, or `--no-verify`** without explicit user approval.
- Don't commit live Jira / Confluence / Bitbucket / Slack-workspace credentials.
- Don't commit `.claude/scheduled_tasks.lock` or other transient session-state files.
- **Rebase onto `origin/main` before starting a slice AND again immediately
  before every push**: `git fetch origin && git rebase origin/main`. Several
  agents push from this repo on the same machine; a branch that's stale
  relative to origin is the #1 cause of a non-fast-forward rejection or a
  silent revert of someone else's just-landed work.

## Worktree & branch lifecycle

- **One slice = one branch with a FRESH descriptive name.** Never reuse a
  previous slice's branch for a new slice — reuse makes "is this merged
  yet?" ambiguous for anyone auditing branch state later.
- **Work in a dedicated worktree OUTSIDE the main checkout**
  (`~/muse-worktrees/<slice>`), never inside it — the main worktree belongs
  to the owner. A failed `cd` into that worktree is a **HARD STOP**: never
  run a git command after a `cd` you haven't confirmed succeeded — a stray
  git mutation lands in the owner's live main checkout instead.
- **On completion (evaluator PASS + pushed/merged to `origin/main`), delete
  the branch and remove the worktree IMMEDIATELY**: `git worktree remove
  <path>` and `git branch -d <branch>`. A finished worktree left behind is
  rot — it goes stale, a cleanup pass can GC it mid-use by someone else, and
  it confuses future merged-state audits.
- **Abandoned or blocked work is never silently left in a dangling
  worktree.** Either commit a WIP to its branch with a defer note explaining
  why, or remove the worktree/branch outright.
- **Sweep check after each batch of slices**: `git branch --merged
  origin/main` should list no leftover slice branches — any that show up
  are cleanup debt, not history.

## Versioned git hooks (`scripts/githooks/`, wired via `core.hooksPath`)

Hooks live in `scripts/githooks/` (checked in) instead of the unversioned
`.git/hooks/*` — `scripts/setup-githooks.mjs` points `core.hooksPath` there
(runs automatically on `pnpm install` via `postinstall`; safe to re-run).
`core.hooksPath` is a normal, non-worktree-scoped git config key, so it is
**shared across every worktree of the repo** — setting it from any worktree
affects all of them.

`pre-push` runs three stages in order:

1. **Push-window lock** (`scripts/githooks/lib/pushlock.sh`) — serializes the
   whole hook run (and the `git push` right after it) across same-machine
   agents, closing the race where several agents pass their checks against a
   stale branch tip and then collide pushing at once. macOS ships no
   `flock(1)`, so the primary mechanism is a portable mkdir-spinlock (`mkdir`
   is atomic on any POSIX filesystem) with a ~10-minute stale-lock timeout so
   a crashed holder can't deadlock every future push.
2. **Fail-CLOSED compile gate** — `pnpm -s typecheck:fast` plus a direct
   `tsc --noEmit` for `apps/web` (outside the `tsc -b` reference graph by
   design, see `architecture.md`). A push whose code doesn't compile, or
   whose environment can't even resolve `pnpm`, is **blocked** — never
   silently skipped.
3. **Fail-OPEN grounding tripwire** — `pnpm -s precheck:grounding`, unchanged
   from the original hook: skips itself when pnpm/Ollama aren't reachable so
   it never hard-blocks a model-less box.

Two escape env vars, both documented and greppable — prefer either to
`--no-verify`:

- `MUSE_SKIP_PREPUSH=1` — skips stage 3 (grounding) only; the compile gate
  still runs.
- `MUSE_SKIP_PREPUSH_ALL=1` — skips every stage, including the compile gate.
  Genuine emergencies only.

## After-correction protocol

When the user corrects Claude on a recurring mistake, end the
iteration by adding the rule to the matching `.claude/rules/*.md` (or
open a new rules file). The goal is for the rule set to absorb every
correction so the same mistake doesn't recur.
