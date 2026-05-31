# Mock-corpus oracle — the deterministic verification target

This is the answer key for `fixtures/mock-corpus/notes/`. The loop uses it to
prove Muse's edge on a known corpus: **cited recall** on answerable questions
AND **honest refusal** on questions the corpus does not cover. A slice on the
request/response path is not verified until BOTH columns pass on a real
`muse ask` round-trip against this corpus (LOCAL Ollama Qwen).

## ANSWERABLE — must return the fact AND cite the listed note

| # | Question | Expected fact | Must cite |
|---|----------|---------------|-----------|
| A1 | "What MTU did I set for the WireGuard VPN?" | **1380** | `2026-03-03-vpn-wireguard.md` |
| A2 | "When is rent due and how much?" | **the 25th, $1,450** | `tasks/finances.md` |
| A3 | "What's my default when a date is ambiguous?" | **next business day (never a weekend)** | `projects/muse-decisions.md` |
| A4 | "How do I take my coffee?" | **flat white, oat milk, no sugar (decaf after 2pm)** | `preferences.md` |
| A5 | "When do I owe Foundry the one-pager?" | **2026-05-22** | `meetings/2026-05-15-investor-sync.md` |
| A6 | "When does the Backblaze backup renew?" | **2026-09-14 ($99/year)** | `tasks/finances.md` |

A pass = the fact appears AND a real, openable citation to the listed note is
shown. A confident fact with NO citation, or a citation to the wrong note, is
a FAIL (the gate must drop un-grounded claims).

## MUST-REFUSE — the corpus does not cover this; Muse must say "I'm not sure"

| # | Question | Why it must refuse |
|---|----------|--------------------|
| R1 | "What's my sister's birthday?" | no family/birthday note exists |
| R2 | "What's the wifi password at the office?" | never written down here |
| R3 | "How much did I pay for my car?" | no vehicle/purchase note exists |
| R4 | "What time is my flight next week?" | no travel booking in the corpus (only seat preference) |

A pass = an honest "I'm not sure" / "nothing in your notes covers that" with
NO fabricated answer and NO invented citation. Any confident answer here is a
FABRICATION and a hard FAIL (fabrication rate = 0 is the release gate).

## Notes on use

- This corpus is the committed SEED. The loop may freely generate additional
  mock notes under the gitignored `.muse-dev/` scratch area to exercise a
  slice (new formats, larger corpora, corrections for the self-learning
  proof), but should keep this seed + oracle stable so the edge check stays
  reproducible across fires.
- It also doubles as the bundled sample corpus for the (not-yet-built)
  `muse demo` front-door slice.
