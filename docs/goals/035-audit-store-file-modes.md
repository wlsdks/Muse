# 035 — Audit every ~/.muse JSON store file-mode

## Why

Goal 005 verified the three credential-bearing stores are 0o600. Audit
the other ~10 stores (followups.json, episodes.json, patterns-fired.json,
reminders.json, user-memory.json, proactive-history.json, etc.) — some
may carry sensitive content (user-memory) that warrants 0o600 too.

## Scope

- grep for every writeFile call against a ~/.muse/*.json path.
- For each: classify as sensitive (user-memory, episodes) vs operational
  (cooldown sidecars). Apply 0o600 to sensitive ones.
- Document the classification in a comment per store.

## Verify

- relevant package tests +N (mode lock-ins for the new 0o600 writers).
- All gates green.

## Status

done — classified each ~/.muse/*.json writer + applied 0o600 to
the six sensitive ones: episodes, tasks, reminders, followups,
reminder-history, proactive-history. user-memory was already
0o600 from prior work. patterns-fired + followup-llm-budget left
default — they carry only ids + counters, no PII. Pattern:
`writeFile(tmp, …, { encoding, mode: 0o600 })` + post-rename
`chmod 0o600` fallback. mcp +2 lock-in tests.
