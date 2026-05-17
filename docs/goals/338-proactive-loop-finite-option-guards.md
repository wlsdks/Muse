# 338 — a non-finite leadMinutes silently disabled the entire proactive daemon

## Why

Continuing the `?? `-doesn't-catch-NaN sweep (336
`executionTimeoutMs`, 337 `maxRetryCount`) into the flagship
ambient JARVIS feature. `runProactiveNoticeLoop` resolved:

```ts
const leadMinutes = options.leadMinutes ?? 10;
…
const cutoff = new Date(nowDate.getTime() + leadMinutes * 60_000);
```

`??` only catches `null`/`undefined`. An env-misconfigured
`MUSE_PROACTIVE_LEAD_MINUTES` (`Number("")` / `Number("abc")`
→ `NaN`) flows straight through, so `cutoff = new
Date(now + NaN*60_000)` is an **Invalid Date** and every
candidate filter `event.startsAt.getTime() <= cutoff.getTime()`
is `x <= NaN` → `false`. The always-on proactive daemon then
**silently surfaces nothing** — no "meeting in 10 min", no
"task due soon", with no error, ever. The CLI one-shot path is
guarded (`Number.parseInt(env) || 10`), but the shared library
the API daemon uses is not — an inconsistency exactly like the
CLI-vs-daemon split this sweep keeps closing.

Phase D has the identical hole: `const window =
options.activeSessionWindowMs ?? DEFAULT_ACTIVE_WINDOW_MS` then
`now - lastMs <= window` — a NaN window makes the comparison
always `false`, silently disabling agent-initiated synthesis
(it degrades to the flat-string notice).

Same class as 280/284/289/308/310/336/337; env-derived NaN is
the documented `computeRetryDelay` concern.

## Scope

`packages/mcp/src/proactive-notice-loop.ts` — two option
resolutions:

- `leadMinutes` and `activeSessionWindowMs` now use
  `typeof x === "number" && Number.isFinite(x) ? x : <default>`.
  Finite values (incl. 0 / negative — not this layer's range
  concern, unchanged) and `undefined`/`null` behave exactly as
  before; only `NaN`/`±Infinity` now fall back to the default.
  One short WHY comment at each (the Invalid-Date-cutoff /
  `<= NaN` rationale is non-derivable). Both fixed together —
  identical bug, same function file, same fix shape (sibling
  bundling, as in goals 319/321).

## Verify

- `pnpm --filter @muse/mcp test` — 355 pass (was 354; +1).
  New test: `runDueProactiveNotices({ leadMinutes: NaN })` with
  an event 5 min out → `summary.fired === 1` and the notice is
  sent (pre-fix: NaN → Invalid Date cutoff → 0 fired, silent
  dead daemon). Existing retry / give-up / DND / opt-out
  proactive suites stay green.
- `pnpm check` — every workspace green (mcp 355, apps/cli 563,
  apps/api 161, all packages). `pnpm lint` — exit 0. The
  goal-227 enforcement test (328) stays green.
- No real-LLM request/response path touched — deterministic
  option resolution + window math. The deterministic regression
  is the rigorous verification (a live run can't manufacture a
  misconfigured env value) — same stance as the non-finite
  sweep siblings.

## Status

done — the proactive loop's `leadMinutes` and
`activeSessionWindowMs` now fall back to their defaults on a
non-finite value, so an env misconfiguration can no longer
silently kill the always-on proactive daemon (Phases A/B/C) or
Phase D synthesis. The non-finite-`??` class is now closed
across the scheduler (336/337) and the proactive loop (338).
