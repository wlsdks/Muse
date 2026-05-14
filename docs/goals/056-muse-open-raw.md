# 056 — muse open <id> --raw

## Why

Emit just the raw record JSON (no kind header, no formatting). For
piping into jq.

## Scope

- --raw flag.
- Suppresses everything but the JSON.

## Verify

- cli +1 test.

## Status

done — `muse open <id> --raw` emits ONLY the matched record JSON
(no `{ kind, record: ... }` envelope, no formatted header).
On 0-match / ambiguous paths the diagnostic JSON shape stays
identical to `--json` so jq pipelines still see structured data
in every case. cli +1 unit test asserts the raw record has its
own fields (id / summary) and lacks the envelope keys
(kind / record).
