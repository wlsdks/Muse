# Voice Mode — Design Doc

Status: **Proposal** (not started). Last updated 2026-05-10.

This doc captures the design space for adding a voice interface to
Muse: speak to it in natural language, hear it speak back.
The goal is to scope what "voice mode" means concretely, rule out
the bad options early, and converge on a default tech stack so the
work can be picked up by a future iteration without re-litigating
the choices.

## What "voice mode" means here

Three user-visible flows, each useful on its own:

1. **Push-to-talk CLI**: hold a key in the Muse CLI (or `muse listen`),
   speak a prompt, hear the agent's reply through the system speaker.
2. **Always-on web UI listener**: web Settings panel exposes a
   microphone button, browser captures audio, posts to the agent,
   plays back the response.
3. **Wake-word ambient**: the CLI process passively listens for a
   wake word ("hey muse"), then captures the prompt, replies. This
   is the JARVIS-shaped flow — **out of scope for v1**.

V1 ships flows 1 + 2. Flow 3 needs a wake-word detector (Picovoice
Porcupine, openWakeWord, or similar) plus a long-running mic capture
loop, which doubles the integration surface.

## Pieces required

| Piece | Flow 1 (CLI) | Flow 2 (Web) |
| --- | --- | --- |
| Mic capture | Native module (sox / arecord / SoundDevice) | Browser MediaRecorder API |
| STT (speech → text) | Provider call or local model | Provider call or Web Speech API |
| Agent invocation | Existing `/api/chat` POST | Existing `/api/chat` POST |
| TTS (text → speech) | Provider call → audio bytes → system play (afplay / aplay) | Provider call → blob URL → `<audio>` |
| Plumbing | New CLI command `muse listen` | New Web component `<VoicePanel>` |

Both flows hit the same `/api/chat` for the agent step. Voice is
strictly an I/O wrapper around the existing chat surface.

## Tech choices

### STT

| Option | Cost | Latency | Quality | Setup pain | Verdict for v1 |
| --- | --- | --- | --- | --- | --- |
| **OpenAI Whisper API** | $0.006 / min | ~1 s | High | None (API key) | **Default** |
| Whisper.cpp (local) | Free | ~3-10 s first call (model load) | High | C++ build, ~150 MB model download | Optional / privacy mode |
| Web Speech API | Free | Realtime | OK in EN, weak in KO | Browser-only | Web-only fallback |
| Gemini Live (streaming) | Bundled | Realtime | High | Beta API, less stable | Defer until GA |
| Apple Speech (macOS) | Free | Realtime | High | macOS-only, no streaming for CLI | Defer (per-OS effort) |

Recommendation: **provider-neutral `SpeechToTextProvider` interface**
mirroring `ModelProvider`. Ship `OpenAIWhisperSttProvider` as the
default backend. Add `WhisperCppSttProvider` and `WebSpeechSttProvider`
as opt-in. Apple/Google/Gemini-Live land later as additional adapters.

### TTS

| Option | Cost | Quality | Setup | Verdict for v1 |
| --- | --- | --- | --- | --- |
| **OpenAI `tts-1`** | $15 / 1M chars | Good (multiple voices) | API key | **Default** |
| ElevenLabs | $5 / 30k chars | Best | API key | Optional / premium |
| macOS `say` | Free | Mediocre | None | Optional / offline |
| Piper (local) | Free | Good | C++ build, model download | Optional / privacy |
| Gemini Live | Bundled | Good | Beta | Defer until GA |

Recommendation: same pattern. Provider-neutral
`TextToSpeechProvider` interface with `OpenAITtsProvider` default.

### Mic capture (CLI)

This is the real implementation hazard. Options:

- **`node-record-lpcm16`** + system `sox` / `arecord`: works but adds
  a system dependency the user has to install separately. Common
  failure: silent install with sox-wrong-path.
- **`@discordjs/voice` style native bindings**: heavier, less idiomatic.
- **Shell-out to `rec` / `arecord`**: stdout is a wav stream we pipe
  to STT directly. Simpler, same dependency.

Recommendation: shell-out to `rec` (sox), document the sox install in
the `muse listen` command help. If sox isn't on PATH, exit with a
clear "install sox: `brew install sox` (macOS) / `apt install sox` (Linux)"
message instead of a stack trace.

### Mic capture (Web)

Browser MediaRecorder + WebM/Opus → POST to a new `/api/voice/stt`
endpoint that proxies to the configured `SpeechToTextProvider`. This
keeps the user's API keys out of the browser.

## Provider abstraction shape

```ts
interface SpeechToTextProvider {
  readonly id: string;
  describe(): SttProviderInfo;
  transcribe(input: { readonly audio: Buffer; readonly mimeType: string; readonly language?: string }): Promise<{
    readonly text: string;
    readonly durationMs?: number;
    readonly raw?: unknown;
  }>;
}

interface TextToSpeechProvider {
  readonly id: string;
  describe(): TtsProviderInfo;
  synthesize(input: { readonly text: string; readonly voice?: string; readonly format?: "mp3" | "wav" | "opus" }): Promise<{
    readonly audio: Buffer;
    readonly mimeType: string;
    readonly raw?: unknown;
  }>;
}
```

Mirrors `ModelProvider` / `CalendarProvider` / `NotesProvider`. Two
new packages or one combined: `packages/voice/` with
`stt-providers.ts` + `tts-providers.ts`. Lean toward one package
since the two are always paired in voice-mode flows.

## Rollout

1. **Phase A (this doc)**: design doc + provider interfaces.
   Zero runtime impact.
2. **Phase B**: `@muse/voice` package with interfaces +
   `OpenAIWhisperSttProvider` + `OpenAITtsProvider`. Unit tests with
   mocked fetch. No CLI / Web changes yet.
3. **Phase C**: `muse listen` CLI command. Sox dependency check,
   push-to-talk via stdin, reply pipes through `afplay` / `aplay`.
4. **Phase D**: `/api/voice/stt` + `/api/voice/tts` API endpoints
   that proxy to the configured providers (auth-gated, same as
   `/api/calendar/credentials`).
5. **Phase E**: Web voice button (`<VoicePanel>`) — captures via
   MediaRecorder, posts to the API, plays response audio.
6. **Phase F (deferred)**: wake-word ambient mode + local
   Whisper.cpp / Piper providers + Gemini Live.

Each phase is independently shippable. Phase B is the smallest
foundation we can land before phases C/D/E need anything.

## Open questions

- Do we need streaming STT, or is one-shot fine for personal use?
  (One-shot is dramatically simpler. Default to one-shot.)
- Does the agent reply word-by-word audio (TTS streaming) or one
  blob at the end? (One blob for v1; TTS streaming is a Phase F
  enhancement.)
- Where does the audio cache go? (Probably nowhere — TTS for the
  same text on the same day rarely repeats, and re-running is
  cheap.)
- Voice cloning / custom voices? (Out of scope. ElevenLabs custom
  voices are the obvious extension but defer to Phase F.)

## Why this doc is short

Voice mode is a separate sub-project, not a single iteration. The
above is the "decided enough to start" baseline — concrete enough
that whoever picks Phase B can write the `@muse/voice` skeleton
without re-asking the same questions.
