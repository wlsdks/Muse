# 139 — `appendProactiveHistory` scrubs `title` / `text` / `error` at the chokepoint

## Why

`proactive-history.json` is the long-lived audit log for every
proactive notice Muse fires. The proactive-notice loop scrubs
the synthesised `text` before calling `appendProactiveHistory`
(goal 086), but two adjacent fields still landed verbatim:

- `title` — the **raw task or calendar event title** from the
  user's store. A task titled `"rotate sk-proj-…"` (a real-world
  shape — users name tasks after the action) flowed straight to
  disk and reappeared in `muse status`'s last-notice block.
- `error` — upstream exception text. Telegram / Discord / Slack
  errors sometimes echo the request payload, which itself can
  carry credentials.

Centralising the scrub at the persist chokepoint protects every
caller (proactive loop, watch-folder bridge, webhook bridge,
future direct writers) the same way goal 111 protected every
messaging-send caller.

## Scope

- `packages/mcp/src/personal-proactive-history-store.ts`
  `appendProactiveHistory`:
  - Build a `scrubbed` entry by running `title`, `text`, and
    `error` (when set) through `redactSecretsInText`.
  - Persist `scrubbed` instead of the raw `entry`.
  - No control-flow change; rotation / capacity logic unchanged.

## Verify

- New `packages/mcp/test/mcp.test.ts` case pins:
  - Delivered entry with `title: "rotate ghp_…"` and
    `text: "rotate sk-proj-…"` → `[redacted-github-pat]` +
    `[redacted-openai-key]` on disk; surrounding prose ("rotate",
    "due in 10 min") survives.
  - Failed entry with `error: "send failed with sk-ant-…"` →
    `[redacted-anthropic-key]`.
- `pnpm --filter @muse/mcp test` — 321 tests pass.
- `pnpm check` exit 0; `pnpm lint` exit 0.
- No real-LLM path touched.

## Status

done — proactive-history joins the credential-hygiene line
(086 / 107 / 108 / 109 / 111 / 112 / 116 / 138). Every
long-lived on-disk Muse artefact that holds user-text now goes
through `redactSecretsInText` at the write boundary.
