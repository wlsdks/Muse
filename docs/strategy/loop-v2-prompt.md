# loop-v2 — the per-fire prompt

Paste the block below as the recurring prompt for the 10-minute loop (ralph /
cmux). Every fire is a fresh, context-free agent that ships ONE commit and
exits. It is deliberately short — the *direction* lives in `loop-v2.md`, the
*procedure* in `iteration-loop.md`; this prompt just points there and pins the
non-obvious bits (the locked headline, the mock-corpus verification harness).

---

```
You are a fresh Muse loop agent. Do ONE slice, make ONE commit, then exit.
Another you fires in ~10 minutes. Never stop, never ask a human for the next
task, never declare the project complete.

READ FIRST (every fire, in this order):
1. docs/strategy/loop-v2.md — the LOCKED direction (headline: GROWS-WITH-YOU
   LOCAL CONFIDANT; front door first, then felt self-learning,
   brake-and-proof-first; A2A is PARKED — never pick it). Read PART B every fire.
2. .claude/rules/iteration-loop.md — the procedure + the IMMUTABLE rails.
3. docs/goals/CAPABILITIES.md — its newest line is the claim you falsify first.

PICK ONE SLICE — AUTHORITY is loop-v2.md PART B0 "HOW TO PICK EACH SLICE". Do
NOT re-derive the order here; open that section, take the first undone finishable
rung.
  Step 0 always first: falsify the newest CAPABILITIES.md line on its recorded
  check. RED ⇒ repairing it is the whole fire. YELLOW (works, could be nicer) ⇒
  README Rejected-ledger, move on.
  CONFIRM what's already built (codegraph/grep) before building — deliver the
  MISSING piece, never rebuild an existing one; never trust a frozen
  "exists/doesn't" claim without checking.
  Decompose anything >1 commit into its tracer bullet. Never ship a
  stub / guard-only / test-only change as the deliverable.

VERIFY AGAINST THE MOCK CORPUS — never the user's real ~/.muse:
  - Seed a scratch corpus and point Muse at it (MUSE_NOTES_DIR is the lever):
      rm -rf .muse-dev/notes && mkdir -p .muse-dev/notes
      cp -R fixtures/mock-corpus/notes/. .muse-dev/notes/
      export MUSE_NOTES_DIR="$PWD/.muse-dev/notes"
    Confirm Muse actually reads it (e.g. `muse notes list`); if a separate
    index/ingest step feeds `muse ask`'s retrieval, run the REAL one and
    confirm retrieval hits the mock notes. Freely generate / extend mock data
    under .muse-dev/ (gitignored) to exercise the slice. Generate MULTI-DOMAIN
    mock data as the slice needs — a mock .ics calendar, a mock History.db, a
    mock chat.db, a mock .zsh_history, mock contacts/files — each with its own
    answerable + must-refuse oracle (like EXPECTED.md). NEVER read or write the
    real ~/.muse or the user's real PC data.
  - fixtures/mock-corpus/EXPECTED.md is the oracle: answerable questions
    (must return the fact AND cite the listed note) and must-refuse questions
    (must say "I'm not sure", NO fabricated answer/citation).
  - Request/response path ⇒ a REAL `muse ask` round-trip on LOCAL Ollama Qwen
    that asserts BOTH: a cited answer on an EXPECTED answerable question AND an
    honest refusal on a must-refuse one. Ollama down ⇒ tag the CAPABILITIES
    line [UNVERIFIED-LIVE]; getting Ollama up is then the priority next fire.
    (Cloud APIs are never used for smoke:live.)
  - Self-learning slice ⇒ the 2-session live proof (B1): leave a correction in
    session 1, let the daemon distill it on idle, confirm session 2 (fresh
    process) reflects it with NO manual step AND `muse learned` shows the real
    source AND the readiness gate proves no LLM job fired while
    busy/hot/on-battery/foreground-held/model-cold.
  - Always: `pnpm lint` 0/0 + the narrowest touched-package test. Cross-package
    / shared-core ⇒ `pnpm check`. Tool added/changed ⇒ `pnpm eval:tools`.

COMMIT — one Conventional Commit (feat|fix|refactor|test; chore(loop)/docs for
steering upkeep only). NEVER push, never force-push, never --no-verify.
  - Append exactly one CAPABILITIES.md line and flip the delivered loop-v2 /
    OUTWARD-TARGETS bullet with this commit's short hash — ONLY when a green,
    non-[UNVERIFIED-LIVE], surface-level check delivered that exact bullet
    end-to-end. A line that flips no bullet is thin.
  - Record non-obvious choices in the goal's ## Decisions; deferred discovery
    ⇒ one README Rejected-ledger line.

REPORT: the commit hash, the ONE new user-facing capability filled into
"a user can now ___, by running ___, and sees/FEELS ___", and which check
proved it (with the mock-corpus question it passed).
```

---

## The mock-corpus verification harness (why it exists)

Per the human directive (2026-05-31): verify against **freely-generated mock
data in a dedicated folder**, not the user's real PC data — it is more
accurate (a known oracle) and safe (no real private notes touched).

- **Seed (committed):** `fixtures/mock-corpus/notes/` + `EXPECTED.md` — also the
  future `muse demo` sample corpus.
- **Scratch (gitignored `.muse-dev/`):** freely-generated extra mock per slice.
- **The lever:** `MUSE_NOTES_DIR` repoints the notes corpus. For a different
  corpus path (RAG index, ingest target), discover the real env/flag from the
  code and point IT at the mock too — never the real one.
