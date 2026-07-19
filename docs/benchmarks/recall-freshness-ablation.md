# Recall freshness ablation

**UNCHANGED** — local-live retrieval component evidence only. No generative model requests were made.

Dataset: 60 synthetic cases · 480 case-trials · 960 arm verdicts · dataset SHA-256 `1276decb403f5f2583ee0cedb8ffb3860d54126fd5dccb7a87e31a9531b2fe89`.

| Model | Calibrated | Confidence | Pair retained in raw top-4 | Raw correction | Muse correction | Delta | Non-regression |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| nomic-embed-text | yes | 0.55 | 1/20 | 1/20 | 1/20 | +0.00 | PASS |
| nomic-embed-text-v2-moe | yes | 0.45 | 5/20 | 4/20 | 4/20 | +0.00 | PASS |
| embeddinggemma | no | 0.55 | 1/20 | 1/20 | 1/20 | +0.00 | PASS |
| qwen3-embedding:0.6b | no | 0.55 | 1/20 | 1/20 | 1/20 | +0.00 | PASS |

Non-calibrated models use the conservative 0.55 fallback confidence threshold. Rates are checked per model and category; aggregation cannot hide a regression.

**Interpretation:** all four model deltas are 0, so the qualified result is **UNCHANGED**. Both correction sources survived the required diversified raw top-4 in only 8/80 model-case observations; 72/80 were `PAIR_MISSING`. `demoteStale` can reorder retained candidates but cannot restore a pair member removed by retrieval/MMR, making raw top-4 pair retention the measured bottleneck.

This benchmark uses synthetic controlled cases against local embedding, ranking, confidence, and freshness code. It is not an agent/LLM evaluation and does not prove organic personal effectiveness. The qualified 10/11 live aggregate remains 10/11.

**organic personal effectiveness = NOT_PROVEN · agent capability = NOT_RUN · generative requests = 0**
