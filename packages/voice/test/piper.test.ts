import { writeFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { VoiceProviderError, VoiceValidationError } from "../src/errors.js";
import { PiperTtsProvider, type PiperRunResult, type PiperRunner } from "../src/piper.js";

// Direct coverage for the local Piper TTS adapter (untested module; voice is the
// lowest test-density package). The injected `runner` seam lets us drive the
// whole synthesize() path — arg construction, the WAV round-trip, and the
// error-code mapping — with no real piper binary.

// A fake runner that writes `wavBytes` to the `-f` output path (args[3]) and
// returns the given exit/stderr; capture the call for assertion.
const fakeRunner = (opts: { wavBytes?: Buffer | null; exitCode?: number; stderr?: string } = {}): PiperRunner & { calls: { binary: string; args: readonly string[]; text: string }[] } => {
  const calls: { binary: string; args: readonly string[]; text: string }[] = [];
  const runner = (async (binary: string, args: readonly string[], text: string): Promise<PiperRunResult> => {
    calls.push({ args, binary, text });
    if (opts.wavBytes !== null && opts.wavBytes !== undefined) await writeFile(args[3]!, opts.wavBytes);
    return { exitCode: opts.exitCode ?? 0, stderr: opts.stderr ?? "" };
  }) as PiperRunner & { calls: typeof calls };
  runner.calls = calls;
  return runner;
};

describe("PiperTtsProvider", () => {
  it("constructor requires a modelPath and defaults id 'piper' + describes itself as local", () => {
    expect(() => new PiperTtsProvider({ modelPath: "" })).toThrow(VoiceValidationError);
    const p = new PiperTtsProvider({ modelPath: "/voices/en.onnx", runner: fakeRunner() });
    expect(p.id).toBe("piper");
    expect(p.describe()).toMatchObject({ id: "piper", local: true });
    expect(p.describe().description).toContain("/voices/en.onnx");
  });

  it("synthesize: spawns piper -m <model> -f <out>, pipes the text, and returns the WAV bytes", async () => {
    const runner = fakeRunner({ wavBytes: Buffer.from("RIFF....WAVEdata") });
    const p = new PiperTtsProvider({ binaryPath: "piper", modelPath: "/voices/en.onnx", runner });
    const res = await p.synthesize({ text: "hello there" });
    expect(res).toMatchObject({ format: "wav", mimeType: "audio/wav" });
    expect(Buffer.from(res.audio).toString()).toBe("RIFF....WAVEdata");
    const call = runner.calls[0]!;
    expect(call.binary).toBe("piper");
    expect(call.args.slice(0, 3)).toEqual(["-m", "/voices/en.onnx", "-f"]);
    expect(call.text).toBe("hello there"); // text piped in
  });

  it("rejects empty text and a non-WAV format BEFORE spawning (no runner call)", async () => {
    const runner = fakeRunner();
    const p = new PiperTtsProvider({ modelPath: "/v.onnx", runner });
    await expect(p.synthesize({ text: "   " })).rejects.toMatchObject({ code: "EMPTY_TEXT" });
    await expect(p.synthesize({ format: "mp3", text: "x" })).rejects.toMatchObject({ code: "UNSUPPORTED_FORMAT" });
    expect(runner.calls).toHaveLength(0);
  });

  it("maps a non-zero exit, a thrown runner, a missing output file, and an empty WAV to typed VoiceProviderErrors", async () => {
    const exit = new PiperTtsProvider({ modelPath: "/v.onnx", runner: fakeRunner({ exitCode: 2, stderr: "model load failed" }) });
    await expect(exit.synthesize({ text: "x" })).rejects.toMatchObject({ code: "EXIT_2" });

    const threw = new PiperTtsProvider({ modelPath: "/v.onnx", runner: (async () => { throw new Error("ENOENT piper"); }) as PiperRunner });
    await expect(threw.synthesize({ text: "x" })).rejects.toMatchObject({ code: "SPAWN_FAILED" });

    const noFile = new PiperTtsProvider({ modelPath: "/v.onnx", runner: fakeRunner({ wavBytes: null }) }); // exit 0 but writes nothing
    await expect(noFile.synthesize({ text: "x" })).rejects.toMatchObject({ code: "OUTPUT_MISSING" });

    const empty = new PiperTtsProvider({ modelPath: "/v.onnx", runner: fakeRunner({ wavBytes: Buffer.alloc(0) }) });
    await expect(empty.synthesize({ text: "x" })).rejects.toMatchObject({ code: "EMPTY_BODY" });

    // all the spawn/output failures are VoiceProviderError (the typed surface)
    await expect(exit.synthesize({ text: "x" })).rejects.toBeInstanceOf(VoiceProviderError);
  });
});
