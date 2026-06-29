# Loop journal — competitor-parity (openclaw + hermes → Muse gap-filling)

Theme: study /Users/jinan/ai/openclaw (TS, MIT) + /Users/jinan/ai/hermes-agent (Python, MIT/Apache),
find what Muse LACKS, reimplement the pattern (attributed, no verbatim copy), in BIG chunks per fire.
Tier1 (local commit, no push). Worktree: /tmp/muse-competitor-parity. Slug: competitor-parity.

## Candidate gaps (seed — each fire VERIFIES the gap is real before building; Muse may already have it)
- ◦ Plugin SDK / third-party extension package contract (openclaw plugin-sdk, plugin-package-contract) — Muse has `skills` but not a versioned plugin package system. VERIFY vs packages/skills first.
- ◦ Web-content extraction (openclaw web-content-core) — page → clean readable markdown. Muse has `browser`; check if clean-extraction exists.
- ◦ Context compression sophistication (hermes context_compressor.py / context_engine.py) — vs Muse auto-compaction + context-engineering. Measure the delta.
- ◦ Model catalog with capabilities (openclaw model-catalog-core) — vs Muse `model`. Check if a queryable capability catalog exists.
- ◦ A2A / ACP interop depth (openclaw acp-core, hermes acp_adapter) — Muse has `a2a`; compare contract coverage.

## Fires

## fire 1 · 2026-06-30 · skill v2.0 · fire1
meta: value-class=new-capability · pkg=@muse/model+@muse/cli · kind=catalog+CLI · verdict=PASS · firesSinceDrill=1
ratchet: pkg(model,cli)/kind(new-capability) — fire-0 was docs/chore, this is model+cli (diverse). fabrication 0.
- WHAT: model CAPABILITY catalog — `MODEL_CATALOG` + query fns (byCapability/findCatalogModel/localCatalogModels/byProvider) in @muse/model, + `muse models [--vision|--tools|--local|--provider|--json]` CLI. Big-chunk (catalog + query + CLI + tests).
- WHY (gap): openclaw has model-catalog-core; Muse had per-adapter ModelInfo but NO unified queryable capability index nor a `muse models` command (freshness-guarded: 0 ModelCatalog/byCapability/muse-models hits). Complements `muse setup cloud` — pick a model by capability, offline.
- REVIEW: behavioral tests (query/filter logic, not config assertions) + mutation RED + live CLI (--local --vision → gemma4 only). Reimplemented in Muse's ModelInfo shape, openclaw (MIT) attributed, no verbatim copy.
- RISK: catalog DATA is curated/static (capability values conservative; may lag new models) — the QUERY logic is what's tested. `local` honestly = ollama-only (no cloud mislabeled local).
