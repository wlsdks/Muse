# 222 — a long Discord message must be delivered truncated, not dropped

## Why

The Discord half of goal 221's noted follow-up — and a
*worse* gap than Telegram. Discord's message `content`
hard-limits at **2000** characters, but
`validateOutboundMessage` only throws above **4096**. So a
2001–4096-char proactive notice / brief / answer relayed to
Discord:

1. **passes** `validateOutboundMessage` (≤ 4096), then
2. is sent raw as `content: message.text`, and
3. Discord's API rejects it with a 400
   (`BASE_TYPE_MAX_LENGTH`) → `MessagingProviderError
   UPSTREAM_FAILED`, message **dropped**.

Unlike Telegram (where the 4096 validate-throw at least
catches it deterministically), the 2001–4096 band here
*silently passes Muse's own validation* and only fails at the
remote API — a confusing, user-invisible non-delivery.
`>4096` was already dropped by the validate throw too. Either
way a long Discord message never reaches the user.

Slack needs no change: its limit (~40000) is far above the
4096 validation cap, so Slack-bound text is already bounded
≤ 4096 by `validateOutboundMessage`.

## Scope

- `packages/messaging/src/discord-provider.ts` `send()`:
  reuse the goal-221 shared `clampOutboundText(message.text,
  2000)` — clamp first, then `validateOutboundMessage` the
  clamped message and post the clamped `content`. Normal
  (≤ 2000) messages are byte-for-byte unchanged; the
  empty-text / bad-destination validation still fires. A long
  message is now delivered truncated (`… [truncated]`)
  instead of 400-dropped. No new helper — the shared one from
  goal 221 already supports a custom `max`.
- `packages/messaging/test/messaging.test.ts`: new
  `DiscordProvider` case capturing the posted `content` —
  a 5000-char message is truncated to exactly 2000 ending
  with the marker; a short message is posted unchanged.

## Verify

- `pnpm --filter @muse/messaging test` — 119 pass (1 new; no
  regression; the shared `clampOutboundText` already has its
  own 4 unit cases from goal 221 incl. the `2000` cap).
- `pnpm check` exit 0; `pnpm lint` exit 0.
- Outbound Discord-delivery path, no LLM invoked. The wiring
  is trivial (clamp → validate-clamped → post-clamped) and
  directly tested at the provider level. No Discord bot
  credentials are configured here (live workspace creds must
  not be committed), so no live send was dog-fooded —
  consistent with goals 221/200/211/218.

## Status

done — Telegram (221, 4096) and Discord (222, 2000) both now
deliver a long brief / notice / answer truncated with a clear
marker instead of dropping it; Slack is already bounded by
the 4096 validation cap. The goal-221 follow-up is closed.
