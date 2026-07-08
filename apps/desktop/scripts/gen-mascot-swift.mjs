/**
 * Codegen the canonical @muse/mascot bluebird pose matrices + palette into a
 * Swift source file, so the native macOS companion animates from the SAME single
 * source of truth as the CLI banner, the README SVG, and the web DeskPet — no
 * hand-copied pixels that can drift.
 *
 * This mirrors gen-app-icon.mjs (which renders ONE frame to muse-bird.png): here
 * we emit ALL frames + the palette + the closed-eye set as Swift data, which
 * CharacterView.swift renders live via Core Graphics with a small idle loop.
 *
 *   node scripts/gen-mascot-swift.mjs                 # write MascotFrames.swift
 *   node scripts/gen-mascot-swift.mjs --check         # fail (exit 1) if stale
 *
 * Regenerate after packages/mascot/src/pixel-data.ts changes (and rebuild dist:
 * `pnpm --filter @muse/mascot build`). A drift check is wired into the desktop
 * package's test target parity with the web mirror's drift-guard.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const OUT = resolve(here, "../Sources/MuseDesktop/MascotFrames.swift");

const { FRAMES, PALETTE, CLOSED_EYE_FRAMES, GRID_W, GRID_H } = await import(
  resolve(repoRoot, "packages/mascot/dist/pixel-data.js")
);

function swiftStringArray(rows, indent) {
  const pad = " ".repeat(indent);
  return rows.map((r) => `${pad}"${r}"`).join(",\n");
}

function render() {
  const paletteEntries = Object.entries(PALETTE)
    .filter(([, hex]) => hex !== "transparent") // "." transparent → drawn as nothing
    .map(([ch, hex]) => `        "${ch}": "${hex}"`)
    .join(",\n");

  const closed = [...CLOSED_EYE_FRAMES].map((n) => `"${n}"`).join(", ");

  const frameEntries = Object.entries(FRAMES)
    .map(
      ([name, rows]) =>
        `        "${name}": [\n${swiftStringArray(rows, 12)}\n        ]`
    )
    .join(",\n");

  return `// GENERATED from @muse/mascot — do not edit by hand.
// Regenerate: node apps/desktop/scripts/gen-mascot-swift.mjs
// Source of truth: packages/mascot/src/pixel-data.ts (the SAME bluebird the CLI
// banner, the README SVG, and the web DeskPet render from).

import Foundation

/// Canonical bluebird pose matrices + palette, single-sourced from @muse/mascot.
/// CharacterView renders these live (Core Graphics) with a gentle idle loop.
enum MascotFrames {
    /// Grid is authored facing RIGHT on a fixed ${GRID_W}x${GRID_H} grid.
    static let width = ${GRID_W}
    static let height = ${GRID_H}

    /// char -> hex colour. The transparent "." is omitted (drawn as nothing).
    static let palette: [Character: String] = [
${paletteEntries}
    ]

    /// Poses whose eye is shut (a 2px dark line instead of the single pixel).
    static let closedEyeFrames: Set<String> = [${closed}]

    /// Every pose is a ${GRID_W}-wide x ${GRID_H}-tall grid of palette chars.
    static let frames: [String: [String]] = [
${frameEntries}
    ]
}
`;
}

const out = render();

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(OUT, "utf8");
  } catch {
    current = "";
  }
  if (current !== out) {
    console.error(
      "MascotFrames.swift is STALE — run `node apps/desktop/scripts/gen-mascot-swift.mjs` (mascot pixel data changed)."
    );
    process.exit(1);
  }
  console.log("MascotFrames.swift is up to date.");
} else {
  writeFileSync(OUT, out);
  console.log(`wrote ${OUT}`);
}
