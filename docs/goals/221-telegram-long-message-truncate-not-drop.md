# 221 — a long Telegram message must be delivered truncated, not dropped

## Why

Telegram's `sendMessage` hard-caps `text` at 4096 characters,
and `validateOutboundMessage` enforces the same
`MAX_TEXT_LENGTH = 4096` by **throwing**
(`MessagingValidationError`). So a proactive notice, a
`muse today --brief` narrative, or a long agent answer relayed
to Telegram that exceeds 4096 chars fails the whole `send()` —
the user receives **nothing** (the caller fail-soft-logs the
validation error). For a JARVIS that proactively reaches the
user, silently not delivering a long brief is a real UX
failure: the user would far rather get the important first
~4 KB with a clear "[truncated]" marker than nothing at all.

## Scope

- `packages/messaging/src/provider-helpers.ts`: add a shared
  `clampOutboundText(text, max = 4096)` — returns short text
  unchanged; for over-limit text, slices and appends
  `… [truncated]`, with the marker counted *inside* `max` so
  the result never exceeds the platform cap; degrades safely
  when `max` is smaller than the marker. Lives next to the
  other cross-cutting provider primitives (`clampInboundLimit`,
  `tryParseJson`).
- `packages/messaging/src/telegram-provider.ts` `send()`:
  clamp `message.text` first, then `validateOutboundMessage`
  the clamped message and send the clamped text. Normal
  (≤ 4096) messages are byte-for-byte unchanged; the empty-text
  / bad-destination validation still fires (clamp only touches
  length). A long message is now delivered truncated instead
  of throwing.
- `packages/messaging/src/provider-helpers.test.ts`: direct
  unit coverage — short unchanged, over-limit truncated +
  marker + length ≤ max, default 4096 + tighter (2000) cap,
  and the degrade-safe tiny-`max` cases.

Scoped to Telegram (the primary proactive JARVIS channel,
whose 4096 limit is exactly what `validateOutboundMessage`
already throws on). Discord (2000) and Slack should get the
same per-platform clamp — noted as a follow-up to keep this
change tight; the shared helper is ready for them.

## Verify

- `pnpm --filter @muse/messaging test` — 118 pass (4 new
  `clampOutboundText` cases; no regression).
- `pnpm check` exit 0; `pnpm lint` exit 0.
- Outbound-delivery path, no LLM invoked. `clampOutboundText`
  is a pure string function exhaustively unit-tested (the
  authoritative verification per the testing rules) and the
  `send()` wiring is trivial (clamp → validate-clamped →
  send-clamped), covered by the messaging suite. No Telegram
  bot credentials are configured here (and live workspace
  creds must not be committed), so a live send wasn't
  dog-fooded — consistent with how the other pure-helper
  goals (200/211/218) were verified.

## Status

done — a long brief / notice / answer to Telegram is now
delivered truncated with a clear marker instead of being
dropped whole by the 4096-char validation throw. The shared
`clampOutboundText` helper is in place for the Discord/Slack
follow-up.
