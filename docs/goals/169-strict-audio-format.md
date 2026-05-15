# 169 — strict audio `--format` with typo hint (+ dedupe)

## Why

Two duplicate parsers — `voice-playback.ts parseAudioFormat`
and `commands-listen.ts parseFormat` — both hardcoded the same
5 formats and both **silently fell back to "mp3"** for any
unrecognised value. `muse today --speak --audio-format wave`
(typo for `wav`) silently produced mp3 with no signal: the
exact silent-enum-fallback anti-pattern fixed across the CLI
in goals 137 / 151 / 157, still live in the voice path.

## Scope

- `voice-playback.ts`:
  - `AUDIO_FORMATS` exported tuple (single source; `AudioFormat`
    derived from it).
  - `parseAudioFormat`: absent/blank → "mp3" (legitimate
    default, most callers omit it); a non-empty unrecognised
    value now **throws** with a `closestCommandName` hint
    (`'wave'` → "did you mean 'wav'?") + the valid list,
    matching the goal-137/151/157 voice.
- `commands-listen.ts`: deleted the duplicate `parseFormat`;
  imports the shared `parseAudioFormat`.
- `voice-playback.test.ts` (new): default, all-valid
  (case/whitespace), typo→hint+throw, no-close-match→throw
  with valid list.

Callers (`muse today --audio-format`, `speakPlain`,
`muse listen --format`) let the thrown error bubble to the CLI
handler — same surface behaviour as goal 143's strict `--hours`.

## Verify

- `pnpm --filter @muse/cli test` — 433 pass (4 new).
- `pnpm check` exit 0; `pnpm lint` exit 0.
- No real-LLM path touched (pure string validation; smoke:live
  not required).

## Status

done — the audio-format surface joins the strict-enum line;
one parser instead of two; a `--format` typo is now a clear
rejection, not a silent wrong-codec.
