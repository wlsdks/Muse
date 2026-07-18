import { mkdtempSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readChannelOwner, resolveSinglePairedChannel } from "./paired-channel.js";

function tmpOwnersFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "muse-paired-channel-"));
  return join(dir, "channel-owners.json");
}

function registryOf(...ids: readonly string[]): { readonly has: (providerId: string) => boolean } {
  const set = new Set(ids);
  return { has: (id) => set.has(id) };
}

describe("readChannelOwner", () => {
  it("an absent file has no owner", async () => {
    expect(await readChannelOwner(tmpOwnersFile(), "telegram")).toBeUndefined();
  });

  it("a malformed file has no owner (fail-close, never throws)", async () => {
    const file = tmpOwnersFile();
    await writeFile(file, "not json");
    expect(await readChannelOwner(file, "telegram")).toBeUndefined();
  });

  it("reads a paired owner by provider id", async () => {
    const file = tmpOwnersFile();
    await writeFile(file, JSON.stringify({ owners: { telegram: "555" }, version: 1 }));
    expect(await readChannelOwner(file, "telegram")).toBe("555");
    expect(await readChannelOwner(file, "discord")).toBeUndefined();
  });
});

describe("resolveSinglePairedChannel", () => {
  it("zero paired channels ⇒ undefined (fail-close)", async () => {
    const file = tmpOwnersFile();
    await writeFile(file, JSON.stringify({ owners: {}, version: 1 }));
    expect(await resolveSinglePairedChannel(file, registryOf("telegram"))).toBeUndefined();
  });

  it("exactly one paired AND registered channel ⇒ that channel", async () => {
    const file = tmpOwnersFile();
    await writeFile(file, JSON.stringify({ owners: { telegram: "555" }, version: 1 }));
    expect(await resolveSinglePairedChannel(file, registryOf("telegram"))).toEqual({
      destination: "555",
      providerId: "telegram"
    });
  });

  it("paired but NOT registered ⇒ undefined (a stale pairing with no live provider is not a target)", async () => {
    const file = tmpOwnersFile();
    await writeFile(file, JSON.stringify({ owners: { telegram: "555" }, version: 1 }));
    expect(await resolveSinglePairedChannel(file, registryOf("discord"))).toBeUndefined();
  });

  it("more than one paired + registered channel ⇒ undefined (never guesses which one)", async () => {
    const file = tmpOwnersFile();
    await writeFile(file, JSON.stringify({ owners: { discord: "999", telegram: "555" }, version: 1 }));
    expect(await resolveSinglePairedChannel(file, registryOf("telegram", "discord"))).toBeUndefined();
  });
});
