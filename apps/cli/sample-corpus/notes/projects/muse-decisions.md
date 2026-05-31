# Muse — product decisions

Running log of decisions I don't want to re-litigate.

- **2026-04-12 — Scheduling default.** When a date is ambiguous ("next week",
  "soon"), default to the **next business day**, never a weekend. Strict
  `Number()` parsing, not `parseFloat`, so "4h" is rejected, not silently 4.
- **2026-04-20 — Local-only is the floor.** Ship with cloud egress refused in
  code. A stray cloud API key must NOT flip the default model to a cloud one.
- **2026-05-02 — Honesty over coverage.** A weak-grounding answer becomes
  "I'm not sure", never a confident guess. Fabrication rate = 0 is a release
  gate, not a nice-to-have.
- **2026-05-10 — One presence.** No second "personality" model pass over a
  cited claim; wit lives in framing only.
