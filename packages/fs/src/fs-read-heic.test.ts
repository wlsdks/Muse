/**
 * HEIC is the default camera format on macOS and iPhone, so it is the single
 * most likely file a user points file_read at — and the local vision model
 * cannot decode it (verified against a real .heic: Ollama answers "Failed to
 * load image or audio file"). Classifying it as an image would turn a clean
 * refusal into a provider error, so the refusal stays and instead names the one
 * command that fixes it.
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createFileReadTool } from "./fs-read-tools.js";

const ctx = { runId: "r", userId: "u" };

/** A byte-accurate HEIC header: `....ftypheic`, which is what sniffing sees. */
function writeHeic(dir: string, name: string): string {
  const path = join(dir, name);
  const header = Buffer.from([0, 0, 0, 0x18]);
  writeFileSync(path, Buffer.concat([header, Buffer.from("ftypheicmif1", "latin1"), Buffer.alloc(64)]));
  return path;
}

describe("file_read on a HEIC photo", () => {
  it("refuses, and names the conversion command instead of a generic reason", async () => {
    const dir = mkdtempSync(join(tmpdir(), "muse-heic-"));
    const path = writeHeic(dir, "IMG_0421.heic");
    const tool = createFileReadTool({ roots: [dir] });

    const result = await tool.execute({ path }, ctx) as { read?: boolean; reason?: string };

    expect(result.read).toBe(false);
    expect(result.reason).toContain("HEIC");
    expect(result.reason).toContain("sips -s format jpeg");
    expect(result.reason).toContain("IMG_0421.jpg");
  });

  it("keeps the generic reason for other unreadable binaries", async () => {
    const dir = mkdtempSync(join(tmpdir(), "muse-bin-"));
    const path = join(dir, "archive.zip");
    writeFileSync(path, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]));
    const tool = createFileReadTool({ roots: [dir] });

    const result = await tool.execute({ path }, ctx) as { read?: boolean; reason?: string };

    expect(result.read).toBe(false);
    expect(result.reason).toContain("not a readable document");
    expect(result.reason).not.toContain("sips");
  });
});
