import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { encryptFileAtRest } from "../../stores/src/encrypted-file.js";
import { isBeliefProvenanceEncrypted, readBeliefProvenance, writeBeliefProvenance, type BeliefProvenance } from "../src/belief-provenance-store.js";

const KEY = { MUSE_MEMORY_KEY: "belief-prov-test-key-A" } as NodeJS.ProcessEnv;
const WRONG = { MUSE_MEMORY_KEY: "belief-prov-test-key-B" } as NodeJS.ProcessEnv;

let dir = "";
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), "muse-belief-enc-")); });
afterAll(async () => { await rm(dir, { force: true, recursive: true }); });
const freshFile = () => join(dir, `belief-${randomUUID()}.json`);

const entry = (key: string): BeliefProvenance => ({
  key,
  kind: "fact",
  learnedAt: "2026-06-28T00:00:00Z",
  userId: "u",
  value: `secret-value-${key}`
});

describe("belief-provenance store encryption-at-rest (facts-about-you provenance — personal)", () => {
  it("round-trips: encrypt then read returns the same entries; on-disk is an envelope, not the value", async () => {
    const file = freshFile();
    await writeBeliefProvenance(file, [entry("plate")], KEY);
    expect(await isBeliefProvenanceEncrypted(file)).toBe(false);

    expect((await encryptFileAtRest(file, KEY)).alreadyEncrypted).toBe(false);
    expect(await isBeliefProvenanceEncrypted(file)).toBe(true);

    const onDisk = JSON.parse(await readFile(file, "utf8")) as { algorithm?: string };
    expect(onDisk.algorithm).toBe("aes-256-gcm");
    expect(await readFile(file, "utf8")).not.toContain("secret-value-plate"); // ciphertext

    const back = await readBeliefProvenance(file, KEY);
    expect(back.map((e) => e.key)).toEqual(["plate"]);
  });

  it("a WRONG key fails CLOSED (throws) — never returns plaintext or []", async () => {
    const file = freshFile();
    await writeBeliefProvenance(file, [entry("plate")], KEY);
    await encryptFileAtRest(file, KEY);
    await expect(readBeliefProvenance(file, WRONG)).rejects.toThrow();
  });

  it("preserves the encrypted format on a subsequent write (provenance doesn't silently revert to plaintext)", async () => {
    const file = freshFile();
    await writeBeliefProvenance(file, [entry("a")], KEY);
    await encryptFileAtRest(file, KEY);
    await writeBeliefProvenance(file, [entry("a"), entry("b")], KEY);
    expect(await isBeliefProvenanceEncrypted(file)).toBe(true);
    expect((await readBeliefProvenance(file, KEY)).map((e) => e.key).sort()).toEqual(["a", "b"]);
  });
});
