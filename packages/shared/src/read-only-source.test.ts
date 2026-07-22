import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { inspectReadOnlyJsonSource } from "./read-only-source.js";

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { force: true, recursive: true }))));

describe("inspectReadOnlyJsonSource", () => {
  it("distinguishes absent, invalid JSON, invalid schema, and available", async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), "muse-read-only-source-"));
    dirs.push(dir);
    const file = join(dir, "source.json");
    const parse = (value: unknown): string | undefined => value && typeof value === "object" && (value as { ok?: unknown }).ok === true ? "ok" : undefined;
    await expect(inspectReadOnlyJsonSource(file, parse)).resolves.toEqual({ errorCode: "missing", result: "absent" });
    await fs.writeFile(file, "{broken", "utf8");
    await expect(inspectReadOnlyJsonSource(file, parse)).resolves.toEqual({ errorCode: "invalid-json", result: "corrupt" });
    await fs.writeFile(file, "{}\n", "utf8");
    await expect(inspectReadOnlyJsonSource(file, parse)).resolves.toEqual({ errorCode: "invalid-schema", result: "corrupt" });
    await fs.writeFile(file, '{"ok":true}\n', "utf8");
    await expect(inspectReadOnlyJsonSource(file, parse)).resolves.toEqual({ result: "available", value: "ok" });
  });

  it("does not mutate bytes, metadata, or parent entries", async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), "muse-read-only-stable-"));
    dirs.push(dir);
    const file = join(dir, "source.json");
    await fs.writeFile(file, '{"ok":true}\n', { mode: 0o600 });
    const before = { bytes: await fs.readFile(file), entries: await fs.readdir(dir), stat: await fs.stat(file) };
    await inspectReadOnlyJsonSource(file, (value) => value);
    const after = { bytes: await fs.readFile(file), entries: await fs.readdir(dir), stat: await fs.stat(file) };
    expect(after.bytes).toEqual(before.bytes);
    expect(after.entries).toEqual(before.entries);
    expect({ mode: after.stat.mode, mtimeMs: after.stat.mtimeMs, size: after.stat.size }).toEqual({ mode: before.stat.mode, mtimeMs: before.stat.mtimeMs, size: before.stat.size });
  });
});
