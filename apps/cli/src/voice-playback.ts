/**
 * Shared TTS-and-play helper. Originally inlined in `commands-listen.ts`;
 * extracted so `muse today --brief --speak` (and any future surface that
 * wants to render text through speakers) can reuse the same flow without
 * duplicating the synth → tmp file → afplay/aplay sequence.
 *
 * The shells abstraction (`SpeakerShells`) lets tests inject a fake
 * player so unit tests don't need real audio hardware. Default shells
 * use `afplay` on macOS and `aplay` on Linux, matching `muse listen`.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";
import { platform } from "node:process";

import { buildVoiceRegistry } from "@muse/autoconfigure";
import type { TextToSpeechProvider } from "@muse/voice";

export type AudioFormat = "mp3" | "wav" | "opus" | "aac" | "flac";

export interface SpeakerShells {
  readonly playAudio: (filePath: string) => Promise<void>;
}

export interface SynthesizeAndPlayOptions {
  readonly text: string;
  readonly voice?: string;
  readonly format?: AudioFormat;
}

export async function synthesizeAndPlay(
  tts: TextToSpeechProvider,
  options: SynthesizeAndPlayOptions,
  shells: SpeakerShells = defaultSpeakerShells()
): Promise<void> {
  const synth = await tts.synthesize({
    text: options.text,
    ...(options.voice ? { voice: options.voice } : {}),
    ...(options.format ? { format: options.format } : {})
  });
  const dir = mkdtempSync(pathJoin(tmpdir(), "muse-speak-"));
  const file = pathJoin(dir, `out.${synth.format}`);
  writeFileSync(file, synth.audio);
  try {
    await shells.playAudio(file);
  } finally {
    try {
      unlinkSync(file);
    } catch {
      // best-effort cleanup
    }
  }
}

export function parseAudioFormat(raw: string | undefined): AudioFormat {
  if (!raw) {
    return "mp3";
  }
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === "mp3" || trimmed === "wav" || trimmed === "opus" || trimmed === "aac" || trimmed === "flac") {
    return trimmed;
  }
  return "mp3";
}

/**
 * Build the default voice registry from the current `process.env` and
 * return its primary TTS (or `undefined` when no provider is configured).
 * Lets callers fall back to "no audio" gracefully when the user hasn't
 * set OPENAI_API_KEY yet.
 */
export function loadDefaultTts(): TextToSpeechProvider | undefined {
  const registry = buildVoiceRegistry(process.env);
  return registry?.primaryTts();
}

export function defaultSpeakerShells(): SpeakerShells {
  return {
    playAudio: (filePath) => new Promise<void>((resolve, reject) => {
      const player = platform === "darwin" ? "afplay" : "aplay";
      const child = spawn(player, [filePath], { stdio: ["ignore", "ignore", "pipe"] });
      child.once("error", reject);
      child.once("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`${player} exited with code ${code ?? "unknown"}`));
        }
      });
    })
  };
}
