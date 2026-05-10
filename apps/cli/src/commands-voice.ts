/**
 * `muse voice` command group, extracted-style command for the voice
 * provider surface. Matches the DI injection pattern used by
 * scheduler / orchestrate / mcp / specs / config / auth.
 *
 * Currently ships one read-only command (`muse voice providers`)
 * that lists the configured STT / TTS providers via the
 * `/api/voice/providers` endpoint. With `OPENAI_API_KEY` set, the
 * server registers OpenAI Whisper STT + OpenAI TTS-1; without it,
 * the command returns 404 / "voice routes are not registered".
 *
 * `muse voice tts <text>` (synthesize to a file) is a future iter —
 * needs raw binary handling that the current `apiRequest` helper
 * doesn't expose, and is a separate scope from listing providers.
 */

import type { Command } from "commander";

import type { ProgramIO } from "./program.js";

export interface VoiceCommandHelpers {
  readonly apiRequest: (
    io: ProgramIO,
    command: Command,
    path: string,
    body?: Record<string, unknown>,
    method?: "GET" | "POST"
  ) => Promise<unknown>;
  readonly writeOutput: (io: ProgramIO, value: unknown, textField?: string) => void;
}

export function registerVoiceCommands(program: Command, io: ProgramIO, helpers: VoiceCommandHelpers): void {
  const voice = program.command("voice").description("Voice provider surface (STT / TTS)");

  voice
    .command("providers")
    .description("GET /api/voice/providers — list configured STT and TTS providers")
    .action(async (_options, command) => {
      helpers.writeOutput(io, await helpers.apiRequest(io, command, "/api/voice/providers"));
    });
}
