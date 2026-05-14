# 036 — Final sweep for env-only probes that bypass mergeModelKeysFromFile

## Why

Iters 44-46 + 53 closed the major env-only-probe sites. Sweep one more
time — anything still reading MUSE_MODEL / *_API_KEY directly without
the file-overlay merge?

## Scope

- grep \"process.env.MUSE_MODEL\b\|process.env.GEMINI_API_KEY\"
  + similar across apps + packages.
- For each hit: confirm overlay-correct OR fix.
- Lock-in test per fix.

## Verify

- All gates green.
- grep returns only intentional env-only sites (e.g., tests).

## Status

done — full sweep complete, no surviving env-only probes that
bypass `mergeModelKeysFromFile`. Confirmed sites:

- `apps/cli/src/job-worker.ts:57-60` + `chat-repl.ts:200,538` —
  WRITES (sets env from CLI args). Not read probes.
- `apps/cli/src/commands-doctor.ts:116` — reads `env.MUSE_MODEL`
  where `env` is the merged view (iter 45).
- `packages/mcp/src/loopback-status.ts:208` — documented
  backward-compat fallback (iter 53), not a bug.
- `packages/autoconfigure/src/autoconfigure-model-provider.ts` —
  reads `env.*_API_KEY` where `env` is the caller-supplied merged
  view.
- `packages/autoconfigure/src/setup-status.ts:144` — explicit
  `mergeModelKeysFromFile(process.env)` before any field read.

Iters 44/45/46/53 + this sweep close the env-only-probe class. No
code change needed.
