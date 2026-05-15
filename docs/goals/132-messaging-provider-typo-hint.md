# 132 — `--provider <typo>` suggests the closest registered messaging provider

## Why

Four CLI surfaces accept a `--provider` flag that routes through
`MessagingProviderRegistry.has(id)`:

- `muse watch-folder --provider <id>`
- `muse webhook serve --provider <id>`
- `muse proactive run --provider <id>` (the daemon entry)
- `muse proactive send --provider <id>` (the one-shot test sender)

When a typo'd id (`telegrma`) missed the registry, each site
printed a generic "not registered" message without a closest-
match hint. JARVIS-class consistency says they should join the
typo-suggestion line goals 099 / 100 / 118 / 119 / 124 / 125 /
131 already run.

## Scope

- `apps/cli/src/commands-watch-folder.ts`,
  `apps/cli/src/commands-webhook.ts`,
  `apps/cli/src/commands-proactive.ts` (two `registry.has` gates):
  - Build the known-id list via `registry.list().map((p) => p.id)`.
  - Feed the typo'd id through `closestCommandName`. When a
    match falls inside the length-aware Levenshtein cap, append
    `— did you mean --provider <id>?` (or `— did you mean 'X'?`
    in the proactive-run variant, matching its existing message
    style).
  - Existing "Try --provider log" / "set the relevant token"
    guidance stays.

## Verify

- New `apps/cli/test/program.test.ts` case pins watch-folder:
  - `--provider telegrma` → "did you mean --provider telegram?".
  - `--provider totally-unknown` → no false-positive suggestion.
  - `process.exitCode` lands at `1` either way.
- The other three sites share the same shape — verified by
  inspection + dogfood (`MUSE_TELEGRAM_BOT_TOKEN=x muse
  watch-folder --provider telegrma --path /tmp` printed the
  hint as expected).
- `pnpm --filter @muse/cli test` — 353 tests pass.
- `pnpm check` exit 0; `pnpm lint` exit 0.
- No real-LLM path touched.

## Status

done — every messaging-provider selection surface in the CLI
now hands the user the closest match on typo.
