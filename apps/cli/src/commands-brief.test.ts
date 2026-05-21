import { EventEmitter } from "node:events";
import type { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { BRIEF_AUDIO_PLAYER_TIMEOUT_MS, playAudioFile, playSynthesizedAudio } from "./commands-brief.js";

interface FakeChild extends EventEmitter {
  kill: (signal?: string) => boolean;
  killedWith?: string;
}

function makeFakeSpawn(): { spawnFn: typeof spawn; child: FakeChild } {
  const child = new EventEmitter() as FakeChild;
  child.kill = (signal?: string): boolean => {
    child.killedWith = signal ?? "SIGTERM";
    return true;
  };
  const spawnFn = (() => child) as unknown as typeof spawn;
  return { child, spawnFn };
}

describe("playAudioFile (muse brief --speak player watchdog)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves when the player exits 0", async () => {
    const { child, spawnFn } = makeFakeSpawn();
    const promise = playAudioFile("afplay", "/tmp/brief.wav", spawnFn);
    child.emit("close", 0);
    await expect(promise).resolves.toBeUndefined();
  });

  it("rejects with the exit code on a non-zero exit", async () => {
    const { child, spawnFn } = makeFakeSpawn();
    const promise = playAudioFile("aplay", "/tmp/brief.wav", spawnFn);
    child.emit("close", 3);
    await expect(promise).rejects.toThrow(/aplay exit 3/u);
  });

  it("rejects on a spawn error (player not installed)", async () => {
    const { child, spawnFn } = makeFakeSpawn();
    const promise = playAudioFile("afplay", "/tmp/brief.wav", spawnFn);
    child.emit("error", new Error("ENOENT afplay"));
    await expect(promise).rejects.toThrow(/ENOENT afplay/u);
  });

  it("SIGKILLs and rejects when the player wedges past the timeout", async () => {
    vi.useFakeTimers();
    const { child, spawnFn } = makeFakeSpawn();
    const promise = playAudioFile("afplay", "/tmp/brief.wav", spawnFn);
    const assertion = expect(promise).rejects.toThrow(/afplay timed out after 30000ms and was killed/u);
    await vi.advanceTimersByTimeAsync(BRIEF_AUDIO_PLAYER_TIMEOUT_MS);
    await assertion;
    expect(child.killedWith).toBe("SIGKILL");
  });

  it("does not double-settle: a late close after the timeout is ignored", async () => {
    vi.useFakeTimers();
    const { child, spawnFn } = makeFakeSpawn();
    const promise = playAudioFile("afplay", "/tmp/brief.wav", spawnFn);
    const assertion = expect(promise).rejects.toThrow(/timed out/u);
    await vi.advanceTimersByTimeAsync(BRIEF_AUDIO_PLAYER_TIMEOUT_MS);
    child.emit("close", 0);
    await assertion;
  });
});

describe("playSynthesizedAudio cleans up its mkdtempSync directory after playback so `muse brief --speak` doesn't leak a /tmp/muse-brief-speak-* directory + audio file on every invocation", () => {
  it("removes the temp dir on the happy path (player exits 0)", async () => {
    const { child, spawnFn } = makeFakeSpawn();
    const audio = new Uint8Array([1, 2, 3, 4]);
    const promise = playSynthesizedAudio(audio, "wav", { playerCommand: "afplay", playerSpawn: spawnFn });
    child.emit("close", 0);
    const result = await promise;
    expect(existsSync(result.dir)).toBe(false);
  });

  it("removes the temp dir on the error path (player exits non-zero) — finally fires regardless of success/failure", async () => {
    let capturedAudioFile = "";
    const child = new EventEmitter() as FakeChild;
    child.kill = () => true;
    const spawnFn = ((_player: string, args: readonly string[]) => {
      capturedAudioFile = String(args[0]);
      return child;
    }) as unknown as typeof spawn;
    const audio = new Uint8Array([1, 2, 3, 4]);
    const promise = playSynthesizedAudio(audio, "wav", { playerCommand: "afplay", playerSpawn: spawnFn });
    const assertion = expect(promise).rejects.toThrow(/afplay exit/u);
    child.emit("close", 7);
    await assertion;
    expect(capturedAudioFile.length).toBeGreaterThan(0);
    expect(existsSync(capturedAudioFile)).toBe(false);
    expect(existsSync(dirname(capturedAudioFile))).toBe(false);
  });
});
