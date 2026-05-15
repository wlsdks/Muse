import { describe, expect, it } from "vitest";

import { AUDIO_FORMATS, parseAudioFormat } from "./voice-playback.js";

describe("parseAudioFormat (goal 169)", () => {
  it("defaults to mp3 when omitted or blank (the legitimate default)", () => {
    expect(parseAudioFormat(undefined)).toBe("mp3");
    expect(parseAudioFormat("")).toBe("mp3");
    expect(parseAudioFormat("   ")).toBe("mp3");
  });

  it("accepts every valid format, case- and whitespace-insensitive", () => {
    for (const fmt of AUDIO_FORMATS) {
      expect(parseAudioFormat(fmt)).toBe(fmt);
      expect(parseAudioFormat(`  ${fmt.toUpperCase()}  `)).toBe(fmt);
    }
  });

  it("throws with a closest-match hint on a typo (no silent mp3 fallback)", () => {
    expect(() => parseAudioFormat("wave")).toThrow(/invalid audio format 'wave'/u);
    expect(() => parseAudioFormat("wave")).toThrow(/did you mean 'wav'/u);
    expect(() => parseAudioFormat("mp4")).toThrow(/did you mean 'mp3'/u);
  });

  it("throws (still) when no candidate is close enough, listing valid values", () => {
    expect(() => parseAudioFormat("zzzzz")).toThrow(/valid: mp3, wav, opus, aac, flac/u);
    expect(() => parseAudioFormat("zzzzz")).not.toThrow(/did you mean/u);
  });
});
