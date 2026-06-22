# capability-parity loop journal

Theme: bring Muse to hermes/openclaw-grade PEER on the 4 pure agent capabilities
they have and Muse is thin/missing on, deterministic-first, while keeping the
grounding/local moat as the floor. Source: code-level inventory of
/Users/jinan/ai/hermes-agent + /Users/jinan/ai/openclaw (studied as DATA only —
public IR mechanisms reimplemented on Muse's own primitives, never copied).
Tier1: LOCAL COMMIT ONLY, never push. Worktree /tmp/muse-capability-parity,
branch loop/capability-parity.

## fire 1 · 2026-06-23 · skill v2.0.0 · 97731bcb2
meta: value-class=new-capability · pkg=@muse/recall · kind=lexical-search-core · verdict=PASS · firesSinceDrill=1
ratchet: testFiles 1110→1118 (+8 history-search) · fabrication 0 (no grounding surface touched) · pnpm check green (was RED on a pre-existing byte-hygiene baseline regression, fixed this fire)

- 무엇: `searchHistory(query, records, opts)` in @muse/recall — a deterministic,
  Ollama-free history-search core (Gap1-S1, the biggest gap: both competitors
  have an agent-callable "find where we talked about X"; Muse's episodic recall
  was internal-only). BM25 over CJK-aware content tokens (Muse's own
  `bm25Scores`/`lexicalTokens` from @muse/agent-core — hermes FTS5 / openclaw
  BM25 studied as DATA, Cormack RRF SIGIR 2009), snippet centered on the match,
  precision floor (no token overlap → zero hits), recency tiebreak, topK cap.
  8 vitest cases. The tool wrapper (S2) + hybrid cosine fusion (S3) are later.
- 왜: Gap1 is the largest pure-agent-capability gap vs hermes/openclaw and the
  cleanest high-value slice — a fresh pure module, no shared-loop blast radius,
  fully provable deterministically (OUTCOME = the search returns the right
  ranked hits / empty on no-overlap / Korean query matches Korean records),
  reusing proven CJK-safe primitives instead of reinventing FTS.
- 리뷰지점: searchHistory is a RETRIEVAL helper — it ranks lexical matches and
  asserts nothing is true, so the fabrication=0 / grounding floor is untouched
  (a hit's snippet is a quote of stored text, not a claim). When S2 exposes this
  as an agent tool, the grounding gate still adjudicates any answer built on it.
- 리스크: lexical-only this fire (no embeddings) → a paraphrase with no shared
  content term won't match; that is the intended S3 hybrid-fusion follow-up, not
  a defect. The pre-existing byte-fix (NUL→\x00) is runtime-identical and the
  knowledge-recall-ranking suite (24/24) proves no behavior change.

note: the shared backlog's "★ capability-parity" section existed only as
UNCOMMITTED working-tree edits in the main repo (gap-scout never committed it);
my worktree branched from the committed HEAD legitimately lacked it. Per
concurrent-loop hygiene I did not entangle with that uncommitted work — the
write-back ✓ line went to the top of my worktree's backlog (append-only, low
conflict risk) and the full detail lives here.
