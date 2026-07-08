/**
 * Generate the macOS app icon (AppIcon) from the canonical @muse/mascot pixel
 * data — the SAME bluebird that ships in the CLI banner, the README SVG, and the
 * web DeskPet. Single source of truth: no hand-drawn source art.
 *
 * The bird (13x11 sprite) is rendered at a MODERATE integer pixel scale so its
 * edges stay crisp (nearest-neighbour, no blur) while reading as real pixel art
 * rather than 13 giant blocks, centred on a macOS "Big Sur" rounded-square
 * (superellipse) plate with the standard icon safe-area margin.
 *
 * Rasterisation is a pure-Node RGBA buffer + a minimal PNG encoder (zlib is
 * built in) — integer-scaled pixel art needs no canvas/browser dependency, and
 * the output is byte-deterministic.
 *
 *   node scripts/gen-app-icon.mjs --previews                 # 3 variants → scratchpad
 *   node scripts/gen-app-icon.mjs --variant flat --out x.png # one 1024 icon (pipeline)
 *   node scripts/gen-app-icon.mjs --bird --out b.png         # bare bird on transparent
 *
 * Variants: flat (near-black canvas), gradient (indigo→black), glow (black + a
 * soft indigo glow behind the bird). `--bird` renders the bird alone on a
 * transparent canvas (the bundled desktop-companion / Settings-header image).
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

const { FRAMES, PALETTE, GRID_W, GRID_H } = await import(
  resolve(repoRoot, "packages/mascot/dist/pixel-data.js")
);

const CANVAS = "#010102"; // the app's near-black canvas (matches web DeskPet / showroom)
const GLOW = "#5e6ad2"; // indigo glow / gradient hue

// ── colour helpers ────────────────────────────────────────────────────────
function hexRgba(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255;
  return [r, g, b, a];
}
const lerp = (a, b, t) => Math.round(a + (b - a) * t);

// ── minimal PNG encoder (RGBA, 8-bit, no interlace) ───────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // 10..12 = compression / filter / interlace = 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

// ── icon rendering ────────────────────────────────────────────────────────
/** Superellipse (squircle) coverage in [0,1] with 3x3 supersampled AA edges. */
function squircleCoverage(px, py, cx, cy, half, n) {
  let hits = 0;
  for (let sy = 0; sy < 3; sy++) {
    for (let sx = 0; sx < 3; sx++) {
      const x = px + (sx + 0.5) / 3 - 0.5;
      const y = py + (sy + 0.5) / 3 - 0.5;
      const dx = Math.abs(x - cx) / half;
      const dy = Math.abs(y - cy) / half;
      if (Math.pow(dx, n) + Math.pow(dy, n) <= 1) hits++;
    }
  }
  return hits / 9;
}

function renderIcon({ variant, size }) {
  const rgba = Buffer.alloc(size * size * 4); // transparent

  // macOS Big Sur icon grid: rounded plate ≈ 82.4% of the canvas, centred, with
  // a superellipse (n≈5) corner. 1024 → 824 plate, 100px safe-area margin.
  const plate = Math.round(size * 0.824);
  const half = plate / 2;
  const cx = size / 2;
  const cy = size / 2;
  const n = 5;

  const canvas = hexRgba(CANVAS);
  const [gr, gg, gb] = hexRgba(GLOW);
  // gradient endpoints (top indigo-tinted → bottom near-black)
  const top = hexRgba("#1b2145");
  const bot = hexRgba("#010102");

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cov = squircleCoverage(x, y, cx, cy, half, n);
      if (cov <= 0) continue;
      let r, g, b;
      if (variant === "gradient") {
        const t = (y - (cy - half)) / plate; // 0 at plate top → 1 at bottom
        const tc = Math.max(0, Math.min(1, t));
        r = lerp(top[0], bot[0], tc);
        g = lerp(top[1], bot[1], tc);
        b = lerp(top[2], bot[2], tc);
      } else {
        r = canvas[0];
        g = canvas[1];
        b = canvas[2];
        if (variant === "glow") {
          // soft radial indigo glow, brightest a touch above centre (behind the bird)
          const dx = x - cx;
          const dy = y - (cy - size * 0.03);
          const dist = Math.sqrt(dx * dx + dy * dy);
          const radius = plate * 0.42;
          const f = Math.max(0, 1 - dist / radius);
          const glow = Math.pow(f, 2.2) * 0.55; // eased falloff, capped intensity
          r = Math.min(255, r + gr * glow);
          g = Math.min(255, g + gg * glow);
          b = Math.min(255, b + gb * glow);
        }
      }
      const i = (y * size + x) * 4;
      const a = Math.round(cov * 255);
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = a;
    }
  }

  // ── the bird: integer pixel scale, nearest-neighbour, centred ──
  const frame = FRAMES.stand;
  // pick the largest integer scale that keeps the bird within ~58% of the plate
  const targetW = plate * 0.58;
  const scale = Math.max(1, Math.round(targetW / GRID_W));
  const birdW = GRID_W * scale;
  const birdH = GRID_H * scale;
  const ox = Math.round(cx - birdW / 2);
  const oy = Math.round(cy - birdH / 2);

  for (let r = 0; r < GRID_H; r++) {
    const row = frame[r];
    for (let c = 0; c < GRID_W; c++) {
      const ch = row[c];
      const color = PALETTE[ch];
      if (!color || color === "transparent") continue;
      const [pr, pg, pb] = hexRgba(color);
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const x = ox + c * scale + dx;
          const y = oy + r * scale + dy;
          if (x < 0 || y < 0 || x >= size || y >= size) continue;
          const i = (y * size + x) * 4;
          rgba[i] = pr;
          rgba[i + 1] = pg;
          rgba[i + 2] = pb;
          rgba[i + 3] = 255;
        }
      }
    }
  }

  return encodePng(size, size, rgba);
}

/** The bird alone, centred on a transparent square (companion / header image). */
function renderBird({ size }) {
  const rgba = Buffer.alloc(size * size * 4);
  const frame = FRAMES.stand;
  const targetW = size * 0.78;
  const scale = Math.max(1, Math.round(targetW / GRID_W));
  const birdW = GRID_W * scale;
  const birdH = GRID_H * scale;
  const ox = Math.round(size / 2 - birdW / 2);
  const oy = Math.round(size / 2 - birdH / 2);
  for (let r = 0; r < GRID_H; r++) {
    const row = frame[r];
    for (let c = 0; c < GRID_W; c++) {
      const color = PALETTE[row[c]];
      if (!color || color === "transparent") continue;
      const [pr, pg, pb] = hexRgba(color);
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const x = ox + c * scale + dx;
          const y = oy + r * scale + dy;
          if (x < 0 || y < 0 || x >= size || y >= size) continue;
          const i = (y * size + x) * 4;
          rgba[i] = pr;
          rgba[i + 1] = pg;
          rgba[i + 2] = pb;
          rgba[i + 3] = 255;
        }
      }
    }
  }
  return encodePng(size, size, rgba);
}

/**
 * The menu-bar template silhouette (matches MenuBarBird.swift): every
 * non-transparent pixel of the `stand` pose becomes an opaque tint pixel, and
 * the eye ("K") is punched OUT as a hole so the bird still reads. `tint` is the
 * silhouette colour, `bg` the backdrop (transparent by default). This is only a
 * PREVIEW so a human can confirm it reads at menu-bar size — the live macOS
 * item builds the same silhouette natively and lets AppKit tint it.
 */
function renderMenubarSilhouette({ scale = 8, tint = "#000000", bg = null } = {}) {
  const frame = FRAMES.stand;
  const width = GRID_W * scale;
  const height = GRID_H * scale;
  const rgba = Buffer.alloc(width * height * 4);
  if (bg) {
    const [br, bgc, bb, ba] = hexRgba(bg);
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4] = br;
      rgba[i * 4 + 1] = bgc;
      rgba[i * 4 + 2] = bb;
      rgba[i * 4 + 3] = ba;
    }
  }
  const [tr, tg, tb] = hexRgba(tint);
  for (let r = 0; r < GRID_H; r++) {
    const row = frame[r];
    for (let c = 0; c < GRID_W; c++) {
      const ch = row[c];
      if (ch === "." || ch === "K") continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const x = c * scale + dx;
          const y = r * scale + dy;
          const i = (y * width + x) * 4;
          rgba[i] = tr;
          rgba[i + 1] = tg;
          rgba[i + 2] = tb;
          rgba[i + 3] = 255;
        }
      }
    }
  }
  return { png: encodePng(width, height, rgba), width, height };
}

/** A side-by-side preview: silhouette tinted for a LIGHT and a DARK menu bar. */
function renderMenubarPreview({ scale = 8 } = {}) {
  const w = GRID_W * scale;
  const h = GRID_H * scale;
  const pad = scale * 2;
  const cellW = w + pad * 2;
  const totalW = cellW * 2;
  const totalH = h + pad * 2;
  const rgba = Buffer.alloc(totalW * totalH * 4);
  const paint = (bgHex, x0) => {
    const [br, bg, bb] = hexRgba(bgHex);
    for (let y = 0; y < totalH; y++) {
      for (let x = 0; x < cellW; x++) {
        const i = ((y) * totalW + (x0 + x)) * 4;
        rgba[i] = br;
        rgba[i + 1] = bg;
        rgba[i + 2] = bb;
        rgba[i + 3] = 255;
      }
    }
  };
  // Left cell: light menu bar (dark bird). Right cell: dark menu bar (light bird).
  paint("#f2f2f2", 0);
  paint("#1e1e1e", cellW);
  const blit = (tint, x0) => {
    const frame = FRAMES.stand;
    const [tr, tg, tb] = hexRgba(tint);
    for (let r = 0; r < GRID_H; r++) {
      const row = frame[r];
      for (let c = 0; c < GRID_W; c++) {
        const ch = row[c];
        if (ch === "." || ch === "K") continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const x = x0 + pad + c * scale + dx;
            const y = pad + r * scale + dy;
            const i = (y * totalW + x) * 4;
            rgba[i] = tr;
            rgba[i + 1] = tg;
            rgba[i + 2] = tb;
            rgba[i + 3] = 255;
          }
        }
      }
    }
  };
  blit("#1e1e1e", 0);
  blit("#f2f2f2", cellW);
  return encodePng(totalW, totalH, rgba);
}

// ── CLI ───────────────────────────────────────────────────────────────────
function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const VARIANTS = ["flat", "gradient", "glow"];

if (process.argv.includes("--previews")) {
  const outDir = arg("--dir", resolve(here, "preview"));
  mkdirSync(outDir, { recursive: true });
  for (const variant of VARIANTS) {
    const png = renderIcon({ variant, size: 512 });
    const f = resolve(outDir, `app-icon-${variant}-512.png`);
    writeFileSync(f, png);
    console.log(`wrote ${f}`);
  }
} else if (process.argv.includes("--menubar")) {
  const scale = Number(arg("--scale", "8"));
  const previewOut = arg("--out", resolve(here, "preview/menubar-bird-preview.png"));
  mkdirSync(dirname(previewOut), { recursive: true });
  writeFileSync(previewOut, renderMenubarPreview({ scale }));
  console.log(`wrote ${previewOut} (menu-bar silhouette preview: light|dark)`);
  const silOut = arg("--silhouette", resolve(here, "preview/menubar-bird-silhouette.png"));
  writeFileSync(silOut, renderMenubarSilhouette({ scale }).png);
  console.log(`wrote ${silOut} (raw silhouette, black on transparent)`);
} else if (process.argv.includes("--bird")) {
  const size = Number(arg("--size", "512"));
  const out = arg("--out", resolve(here, "../Sources/MuseDesktop/Resources/muse-bird.png"));
  writeFileSync(out, renderBird({ size }));
  console.log(`wrote ${out} (bird, ${size}x${size})`);
} else {
  const variant = arg("--variant", "flat");
  if (!VARIANTS.includes(variant)) {
    console.error(`unknown --variant '${variant}' (expected: ${VARIANTS.join(" | ")})`);
    process.exit(1);
  }
  const size = Number(arg("--size", "1024"));
  const out = arg("--out", resolve(here, `../AppIcon-${variant}-${size}.png`));
  writeFileSync(out, renderIcon({ variant, size }));
  console.log(`wrote ${out} (${variant}, ${size}x${size})`);
}
