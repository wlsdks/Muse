import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { inspectBeliefProvenanceSource, writeBeliefProvenance, type BeliefProvenance } from "./index.js";

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { force: true, recursive: true }))));

const BELIEF: BeliefProvenance = {
  evidenceExcerpt: "I prefer short answers",
  key: "answer_style",
  kind: "preference",
  learnedAt: "2026-07-22T10:00:00.000Z",
  sessionId: "session-1",
  source: "auto",
  userId: "owner",
  value: "short"
};

describe("inspectBeliefProvenanceSource", () => {
  it("reads provenance without changing bytes, stat, or directory", async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), "muse-belief-inspect-"));
    dirs.push(dir);
    const file = join(dir, "belief.json");
    await writeBeliefProvenance(file, [BELIEF], { MUSE_MEMORY_ENCRYPTION_ENABLED: "false" });
    const before = { bytes: await fs.readFile(file), entries: await fs.readdir(dir), stat: await fs.stat(file) };
    await expect(inspectBeliefProvenanceSource(file, { MUSE_MEMORY_ENCRYPTION_ENABLED: "false" })).resolves.toEqual({ result: "available", value: { entries: [BELIEF], excludedCount: 0 } });
    const after = { bytes: await fs.readFile(file), entries: await fs.readdir(dir), stat: await fs.stat(file) };
    expect(after.bytes).toEqual(before.bytes);
    expect(after.entries).toEqual(before.entries);
    expect({ mode: after.stat.mode, mtimeMs: after.stat.mtimeMs, size: after.stat.size }).toEqual({ mode: before.stat.mode, mtimeMs: before.stat.mtimeMs, size: before.stat.size });
  });

  it("does not quarantine malformed provenance", async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), "muse-belief-corrupt-"));
    dirs.push(dir);
    const file = join(dir, "belief.json");
    await fs.writeFile(file, "{broken", "utf8");
    await expect(inspectBeliefProvenanceSource(file)).resolves.toEqual({ errorCode: "invalid-json", result: "corrupt" });
    expect(await fs.readdir(dir)).toEqual(["belief.json"]);
  });
});
