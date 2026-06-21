# Loop journal — poisoned-source (GROUNDED≠TRUE 출처-진위 방어)

Theme: oversee that poisoned notes/episodes/MCP sources can't launder past the
grounding gate. Worktree `/tmp/muse-poisoned-source`, branch `loop/poisoned-source`,
cron `cb79365d` (20m, session-only, Tier2 push + merge-to-main every 3 fires).

## fire 1 · 2026-06-21 · poisoned-source · (no-ship — ④ judge FAIL, rolled back)

meta: value-class=new-capability · pkg=@muse/agent-core · kind=injection-pattern · verdict=FAIL(rolled back) · firesSinceDrill=1

ratchet: testFiles unchanged · fabrication 0 · no eval delta (code reverted)

WHAT: attempted T1-a-ko-resid — the Korean analogs of the English output-clamp
("reply only with") + role-hijack ("act as … instead") injection patterns in
`MEMORY_INJECTION_PATTERNS` (the deterministic neutralizer under all 4 stored
grounding surfaces + live tool/MCP output). Designed two tightly-anchored
patterns (`오직/오로지 … 만 … <answer-imperative>` clamp + `인 척 … <behavior-imperative>`
role) that passed a 51-note hand corpus at 0 FP and 10/10 malicious.

WHY (no-ship): an INDEPENDENT Opus ④ judge (maker≠judge) ran its OWN 49-note
benign corpus and found 8.2% false-positives + a ReDoS regression — the same FP
failure class that rolled this item back once before (core-hardening fire 6). The
deterministic gates were all green (agent-core 2570 tests + mutation-RED proven,
pnpm check all-workspace, lint, eval:memory-poisoning, eval:action-log-tamper);
the judge caught what the author's narrower corpus missed. Rolled back per the
④ FAIL contract; the system worked — the independent judge stopped a security +
FP regression before it shipped.

REVIEW POINT: the slice is a known-hard regex problem on Korean, not a quick win;
the sharpened blocker (3 concretely-pinned sub-problems) is in backlog.md.

RISK: none shipped (code/test reverted to origin/main state).

lesson: Korean injection-pattern anchoring still false-positives on (a) REPORTED
SPEECH (`V-라고/하라고` + `했다/조언했다` embeds the imperative form), (b) BARE VERB
STEMS that are substrings of connective/descriptive continuations (`굴어`⊂`굴어서`,
`대답해`⊂`대답해 주는`), and (c) the `오직 X만 [benign gap] verb` shape admits
intervening benign content. ALSO: the `\s*` + lazy `.{0,N}?` regex idiom is
catastrophic-backtracking ReDoS on the UNCAPPED `capToolOutput` surface — never
place two whitespace-consuming quantifiers adjacent. A 0-FP hand corpus of
DECLARATIVES is not enough: any future probe MUST include reported-speech,
connective-suffix, and app-description shapes, and a ReDoS scaling measurement.
A 3rd attempt needs `(?!고)` exclusion + terminal-imperative-only verbs (no bare
stems) + ReDoS-safe filler, all together — or this stays deferred as a real
design problem (not a loop-sized quick win).
