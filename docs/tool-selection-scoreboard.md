# Tool-selection measured-improvement scoreboard

The trend anchor for the tool-selection loop (plan:
`docs/superpowers/plans/2026-06-12-tool-selection-measured-improvement-loop.md`).
Each fire appends: date · `eval:tools` pass^k score · failing cases · the change.

| date | k | eval:tools | failing cases | change / note |
|------|---|------------|---------------|---------------|
| 2026-06-12 | 1 | **134/134 (100%)** | none | **Fire 1 baseline.** Single-run accuracy is SATURATED (threshold 85%). No single-run headroom on the current golden set. pass^k (k=3) measurement running to find reliability flakiness — if clean, the lever is exhausted and the loop switches to grounding false-refusal recall per the plan's decision 6. |

## Key finding (Fire 1)

`eval:tools` at k=1 is already 100% (134/134). The golden set covers EN+KO across
time-tools, file-read, browser-control, personal-crud, recall-vs-crud confusable
sets and no-tool/IrrelAcc traps — all pass on gemma4:12b in one shot. So the
"move the accuracy number" headroom on THIS set is zero; the only remaining
tool-selection headroom is **pass^k reliability** (does every case pass on ALL k
repeats?). If k=3 is also clean, the principled move (plan decision 6) is to
switch the primary lever to **grounding false-refusal recall** (documented 0.08
baseline = real headroom, core edge, high user value), verified with real
`muse ask` on grounded questions — not to manufacture harder golden cases without
real-usage failures to draw from.
