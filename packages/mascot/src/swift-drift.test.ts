/**
 * Drift guard for the NATIVE macOS companion. `apps/desktop` renders the bird
 * live in Swift from a codegen'd `MascotFrames.swift` (produced by
 * `apps/desktop/scripts/gen-mascot-swift.mjs` from THIS package). This test reads
 * that Swift file as TEXT and asserts every pose matrix + palette colour is
 * byte-identical to the canonical `FRAMES` / `PALETTE`. Edit a matrix here (or by
 * hand in the Swift file) without regenerating and this goes RED.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { FRAMES, PALETTE } from "./pixel-data.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SWIFT_SOURCE = resolve(HERE, "../../../apps/desktop/Sources/MuseDesktop/MascotFrames.swift");

/** Pose-matrix rows are strings made only of the drawing charset. */
function extractMatrixRows(source: string): string[] {
  return [...source.matchAll(/"([.BSWKCATL]{13})"/g)].map((m) => m[1]!);
}

describe("mascot Swift codegen drift guard", () => {
  it("MascotFrames.swift matrices are byte-identical to @muse/mascot's canonical frames", () => {
    // Skip gracefully if the desktop app isn't checked out alongside (CI slices).
    if (!existsSync(SWIFT_SOURCE)) {
      return;
    }
    const swiftRows = extractMatrixRows(readFileSync(SWIFT_SOURCE, "utf8"));
    const canonicalRows = Object.values(FRAMES).flatMap((frame) => [...frame]);

    expect(swiftRows.length).toBe(canonicalRows.length);
    expect(swiftRows).toEqual(canonicalRows);
  });

  it("MascotFrames.swift palette matches the canonical PALETTE (transparent omitted)", () => {
    if (!existsSync(SWIFT_SOURCE)) {
      return;
    }
    const swift = readFileSync(SWIFT_SOURCE, "utf8");
    for (const [ch, hex] of Object.entries(PALETTE)) {
      if (hex === "transparent") {
        continue;
      }
      expect(swift, `palette entry ${ch} -> ${hex}`).toContain(`"${ch}": "${hex}"`);
    }
  });
});
