import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { collectAutoImageAttachments } from "../src/commands-ask.js";

// A real 1x1 PNG so loadImageAttachment's byte sniff passes.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64"
);

describe("collectAutoImageAttachments (--auto-image real-deps wiring)", () => {
  it("attaches a real image path mentioned in the message", async () => {
    const dir = mkdtempSync(join(tmpdir(), "muse-autoimg-"));
    const img = join(dir, "receipt.png");
    writeFileSync(img, PNG_1X1);
    const out = await collectAutoImageAttachments(`정리해줘 ${img}`);
    expect(out).toHaveLength(1);
    expect(out[0]!.mimeType).toBe("image/png");
    expect(out[0]!.dataBase64.length).toBeGreaterThan(0);
  });

  it("returns nothing when the message has no image path", async () => {
    expect(await collectAutoImageAttachments("what's on my calendar today?")).toEqual([]);
  });

  it("skips a non-existent image path (never errors)", async () => {
    expect(await collectAutoImageAttachments("see /no/such/dir/ghost.png")).toEqual([]);
  });
});
