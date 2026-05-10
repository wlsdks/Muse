/**
 * `muse voice` command group.
 *
 * Two subcommands today:
 *   - `muse voice providers` — wraps `GET /api/voice/providers`,
 *     prints the configured STT / TTS providers as JSON.
 *   - `muse voice tts <text>` — POSTs to `/api/voice/tts` and writes
 *     the binary audio response to `--out <path>`. Skips the JSON
 *     `apiRequest` helper and uses a raw fetch directly so the
 *     response body can be read as binary.
 *
 * Same DI injection convention as scheduler / orchestrate / mcp /
 * specs / config / auth — the program-level helpers stay in
 * `program.ts` and are passed in here.
 */

import { writeFile } from "node:fs/promises";

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
  readonly readApiOptions: (
    io: ProgramIO,
    command: Command,
    options?: { readonly includeStoredToken?: boolean }
  ) => Promise<{ readonly baseUrl: string; readonly token?: string }>;
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

  voice
    .command("tts")
    .description("POST /api/voice/tts — synthesize audio for <text> and write it to --out")
    .argument("<text...>", "Text to synthesize")
    .requiredOption("--out <path>", "File path to write the audio response")
    .option("--voice <id>", "Voice id (alloy / echo / fable / onyx / nova / shimmer)")
    .option("--format <format>", "Audio format (mp3 / wav / opus / aac / flac)", "mp3")
    .option("--provider <id>", "Specific TTS provider id (default: server-side primary)")
    .action(async (
      textParts: readonly string[],
      options: { readonly out: string; readonly voice?: string; readonly format?: string; readonly provider?: string },
      command
    ) => {
      const text = textParts.join(" ").trim();
      if (text.length === 0) {
        throw new Error("text is required");
      }

      const { baseUrl, token } = await helpers.readApiOptions(io, command);
      const url = new URL("/api/voice/tts", baseUrl).toString();
      const body = JSON.stringify({
        format: options.format,
        ...(options.provider ? { providerId: options.provider } : {}),
        text,
        ...(options.voice ? { voice: options.voice } : {})
      });
      const response = await (io.fetch ?? globalThis.fetch)(url, {
        body,
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        method: "POST"
      });
      if (!response.ok) {
        const detail = await safeReadText(response);
        throw new Error(`Muse API ${response.status}: ${detail || response.statusText}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      await writeFile(options.out, buffer);

      const providerHeader = response.headers.get("x-voice-provider") ?? "(unknown)";
      const formatHeader = response.headers.get("x-voice-format") ?? options.format ?? "(unknown)";
      io.stdout(`Wrote ${buffer.byteLength} bytes (${formatHeader}, ${providerHeader}) to ${options.out}\n`);
    });
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
