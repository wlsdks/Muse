# 270 — wake-word detector fired on substrings inside longer words

## Why

`TextScanWakeWordDetector` powers `muse listen --wake` — the
flagship ambient-voice trigger ("Hey Muse …"). goal 121 added
aliases so a user can register a **bare "Muse"** (or "OK Muse",
etc.). Detection was a raw substring scan:

```ts
const haystack = normalise(text);
if (haystack.indexOf(needle) < 0) continue;   // substring, not word
```

`indexOf` matches the needle **anywhere**, including inside a
longer word. With a bare `"muse"` alias, the loop wakes on
"I visited the **muse**um", "pure a**muse**ment", "be**muse**d" —
and even multi-word phrases embed: a `"hey muse"` phrase
substring-matches inside "t**hey muse**ums" ("they museums").
Every false wake records the user's unrelated speech and ships it
to the model as a prompt — the opposite of an ambient assistant
that stays quiet until addressed.

## Scope

`packages/voice/src/wake-word.ts`:

- Replace the substring `indexOf` detection + the separate
  `sliceAfterPhraseInOriginal` residual finder with a single
  `findWholePhrase(original, needle)` that requires a **whole
  token-sequence** match: the needle must sit at the string start
  or after a separator (everything `normalise` collapses to a
  space) on the left, **and** end the string or be followed by a
  separator on the right (not a letter that continues the word).
  Returns `{ matched, residual }`; `scan` uses it for both the
  detect decision and the post-phrase residual, so the two can no
  longer diverge.
- `normalise` is unchanged (still lowercases, maps punctuation /
  symbols to spaces, collapses runs). One detector method + one
  helper rewritten; no API change.

Behaviour for every legitimate utterance is preserved (verified by
the existing basic / whitespace-punctuation / tail-residual /
alias goal-121 / dedup tests staying green); only the
substring-in-longer-word false positives are removed.

## Verify

- `pnpm --filter @muse/voice test` — 59 pass (was 58; +1). New
  test: a `"hey muse" + alias "muse"` detector does **not** fire
  on "museum" / "amusement" / "bemused"; still fires on a
  standalone "muse, what's next?" (with residual "what's next");
  a `"hey muse"` detector does not fire on "they museums are
  open" (the old `t[hey muse]ums` false positive) but does on
  "hey muse open the door". All prior wake/alias/residual tests
  stay green.
- `pnpm check` — every workspace green (voice 59, apps/cli 560,
  apps/api 155, all packages). `pnpm lint` — exit 0.
- No real-LLM request/response path touched (pure synchronous
  text-scan over an already-produced transcript). The deterministic
  unit test is the rigorous verification — false wakes are an
  input-shape problem a live STT round-trip can't reproduce on
  demand.

## Status

done — the text-scan wake-word detector now matches whole phrases
only, so `muse listen --wake` no longer spuriously wakes on
common words that merely contain the wake token, while every
genuine "Hey Muse …" / alias utterance (and its prompt residual)
keeps working.
