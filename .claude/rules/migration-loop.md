# Reactor → Muse migration loop

A 10-minute recurring loop drives this migration. Every iteration is a
fresh agent with no prior context — read this file plus
`docs/migration-plan.md` first.

## Per-iteration discipline

1. **Orient (≤ 2 minutes):**
   - `git log --oneline -20`
   - read the last "Recent Completion Notes" entry in `docs/migration-plan.md`
   - `git status -sb` (clean tree before starting)

2. **Pick exactly one gap.** Priority order (updated round 157 —
   pivot to **Context Engineering** as the JARVIS-grade differentiator
   after the audit in `docs/migration-plan.md`'s round 157 note
   identified concrete gaps vs Anthropic / Letta / OpenJarvis 2025
   best practices):
   1. **Context Engineering** (top priority until landed):
      a. Working-budget compaction trigger (~40% of nominal) +
         persona/user-model re-injection at the boundary
      b. Tool-output context-aware trimming (token-measured + ID
         retention)
      c. Typed user-memory slots (replace free-text
         `Record<string,string>` with structured slots)
      d. Just-in-time retrieval discipline (IDs in context, fetch
         on demand, not preload)
      e. Sub-agent fan-out + summary fan-in (multi-agent already
         exists — wire it for context isolation)
   2. Risk-graded permission policy + event-driven proactive
      triggers (the JARVIS-grade gaps that need #1 to land first)
   3. Real bugs surfaced during the work
   4. Personal-irrelevant code removal (multi-tenant residue, etc)
   5. Big-file decomposition (only when it serves #1-#2)
   6. Generic external integration via MCP

   The 4-area ranking (a-e) above is the work order. Don't jump
   ahead — each later step assumes the prior one's primitives.

3. **Verify by HTTP, not just unit tests:**
   - `pnpm smoke:broad` for diagnostic-provider end-to-end
   - `pnpm smoke:live` (when a provider key is set) for real-LLM round-trip

4. **Quality gates each iteration:**
   - `pnpm check` green
   - `verify:reactor-routes` 0 missing
   - `verify:reactor-db` 0 missing if schema changed
   - 1–2 conventional commits per iteration
   - one-line entry appended to `docs/migration-plan.md`'s "Recent Completion Notes"

5. **Forbidden in loop iterations:**
   - Pushing to remote, force-push, `--no-verify`
   - Adding emojis (unless preserving Reactor strings)
   - Live-credential integrations (Jira / Confluence / Bitbucket / Slack workspace)
   - Bloating `CLAUDE.md` past 100 lines — add to `.claude/rules/<topic>.md`

## Stop conditions

The loop stops when ALL of these hold:

- 0 missing Reactor routes / tables (already true).
- Every Reactor module's *deep behavior* (not just route shape) has Muse coverage with package + integration tests.
- `apps/api` passes a comprehensive HTTP smoke covering chat / agent specs / approvals / RAG / scheduler / MCP / runtime settings / token-cost / latency / audit, with real assertions.
- At least 3 generic external-system MCP integrations work end-to-end without private credentials.
- JARVIS-style capabilities are documented and exercised: persistent memory across sessions, multi-step plan-execute, cross-tool reasoning, observability dashboards.
- Code quality: no monolithic files, clear module boundaries, comprehensive types, no TODO comments in core runtime.

When all met, write a final audit to `docs/audits/` and stop scheduling.

## When you finish your iteration

Post a short summary, then return. The runtime fires the next iteration
automatically. If you discover a multi-iteration plan, write it as a
follow-up plan file under `docs/superpowers/plans/` so the next
iteration can resume.
