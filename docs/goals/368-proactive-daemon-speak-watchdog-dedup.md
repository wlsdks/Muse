# 368 — proactive daemon `--speak` reused the third unguarded audio spawn

## Why

Goals 366 / 367 closed the unguarded `afplay` / `aplay` spawn in
`commands-brief.ts` and the shared `voice-playback.ts`
`defaultSpeakerShells`. The spawn-site audit flagged a **third**
copy of the exact same bug, and it is the **highest-impact** one:
`apps/cli/src/commands-proactive.ts` (the always-on proactive
ambient-awareness daemon) inlined its own

```ts
await new Promise<void>((resolve, reject) => {
  const child = spawn(player, [audioFile], { stdio: "ignore" });
  child.on("error", reject);
  child.on("close", (code) => code === 0 ? resolve() : reject(...));
});
```

with **no timeout / watchdog**. The other two sites hang a one-shot
command; this one runs inside `muse proactive`'s long-lived
fire-loop. If `afplay` / `aplay` wedges on a busy CoreAudio / ALSA
device while a notice is being read aloud, the `speakFn` Promise
never settles, the daemon's per-notice `await` never returns, and
**every subsequent reminder / notice silently stops firing** — the
JARVIS ambient layer goes dark with no error and no recovery.

`voice-playback.ts` already exports the blessed, directly-tested
`playAudioWithWatchdog(player, file, spawnFn = spawn)` (goal 367,
5 fake-spawn cases incl. fake-timer timeout + double-settle). The
correct fix is to **dedup onto it**, not to add a third hand-rolled
watchdog copy.

## Scope

`apps/cli/src/commands-proactive.ts`: the `--speak` `speakFn` now
`await import("./voice-playback.js")` (consistent with this block's
existing lazy-import style) and calls
`playAudioWithWatchdog(player, audioFile)` instead of the inline
unguarded `spawn(...)` Promise. The `node:child_process` dynamic
import is dropped (no longer needed); `mkdtempSync` / `writeFileSync`
/ `tmpdir` / `platform` / `pathJoin` are unchanged. Behaviour is
preserved on the happy path (resolve on exit 0) and the error path
(the existing `catch` still prints `speak failed: …`); the only
change is that a wedged player is SIGKILLed after 30 s instead of
permanently wedging the daemon loop.

No third test copy is added: the watchdog behaviour is the
goal-367-tested shared helper, and this change is a
behaviour-preserving dedup that routes the daemon through that
already-covered code path (the `speakFn` lives inside the daemon
action closure and has no unit seam — its correctness here is "it
uses the tested helper", verified by the green proactive suite +
typecheck + lint).

## Verify

- `pnpm --filter @muse/cli test` — 647 pass, 55 suites
  (`commands-proactive.test.ts` `parseBoundedFlag` stays green).
- `pnpm check` — every workspace green (apps/cli 647 incl. the
  `test/` glob, apps/api 165, all packages).
- `pnpm lint` — exit 0 (the now-unused `spawn` import is gone, so
  `no-unused-vars` stays clean).
- goal-227/328 byte scan clean on the touched file.
- No real-LLM request/response path touched — a refactor swapping an
  inline audio-player spawn for the shared tested watchdog;
  `tts.synthesize` is unchanged. The goal-367 fake-spawn suite plus
  the green proactive suite are the rigorous verification.

## Status

done — the always-on proactive daemon can no longer be wedged
indefinitely by a stuck `afplay` / `aplay`; all three audio-player
spawn sites (brief 366, shared-speaker 367, proactive daemon 368)
now route through the single directly-tested
`playAudioWithWatchdog`, eliminating the last hand-rolled unguarded
copy of this spawn.
