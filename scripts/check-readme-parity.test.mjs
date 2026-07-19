import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { documentTitles, validateReadmeParity } from "./check-readme-parity.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("README parity recognizes Markdown and HTML h1 titles", () => {
  assert.deepEqual(documentTitles("# Muse\n\n<h1 align=\"center\">Muse 日本語</h1>"), ["Muse", "Muse 日本語"]);
});

test("repository README parity manifest passes for all four locales", async () => {
  const result = await validateReadmeParity({
    manifestPath: join(repoRoot, "docs/readme-parity.json"),
    root: repoRoot,
  });

  assert.equal(result.status, "PASS");
  assert.deepEqual(result.locales.map(({ locale }) => locale).sort(), ["en", "ja", "ko", "zh-CN"]);
});

test("README parity manifest rejects unknown root fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "muse-readme-parity-"));
  try {
    const manifestPath = join(root, "manifest.json");
    await writeFile(manifestPath, JSON.stringify({ schemaVersion: "muse-readme-parity.v1", unexpected: true }), "utf8");
    await assert.rejects(() => validateReadmeParity({ manifestPath, root }), /manifest fields mismatch/u);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
