import { mkdtemp, readFile, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ConversationExactReadError,
  EXACT_CONVERSATION_FILE_MAX_BYTES,
  readExactConversation,
  readExactConversationCatalog
} from "../src/index.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true }))));

async function fixture(payload?: unknown): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "muse-exact-conversation-"));
  roots.push(root);
  const file = join(root, "conversations.json");
  if (payload !== undefined) await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return file;
}

function conversation(id = "conv_0a1b2c3d") {
  return {
    createdAt: "2026-07-22T01:00:00.000Z",
    id,
    origin: "cli",
    title: "Plan the exact next step",
    turns: [
      { at: "2026-07-22T01:00:00.000Z", content: "First question", role: "user" },
      { at: "2026-07-22T01:01:00.000Z", content: "Answer", role: "assistant", untrustedOnly: true },
      { at: "2026-07-22T01:02:00.000Z", content: "Latest owner prompt", role: "user" }
    ],
    updatedAt: "2026-07-22T01:02:00.000Z"
  };
}

describe("strict exact conversation readers", () => {
  it("reads a complete v1 archive and resolves only a byte-identical id", async () => {
    const item = conversation();
    const file = await fixture({ conversations: { [item.id]: item }, version: 1 });

    await expect(readExactConversationCatalog(file)).resolves.toEqual([item]);
    await expect(readExactConversation(file, item.id)).resolves.toEqual(item);
    await expect(readExactConversation(file, item.id.slice(0, -1))).resolves.toBeUndefined();
    await expect(readExactConversation(file, `${item.id}\n`)).resolves.toBeUndefined();
  });

  it("treats a missing archive as empty without creating or changing it", async () => {
    const file = await fixture();
    await expect(readExactConversationCatalog(file)).resolves.toEqual([]);
    await expect(readExactConversation(file, "conv_0a1b2c3d")).resolves.toBeUndefined();
    await expect(readFile(file, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("fails the whole archive closed on malformed records, key mismatches, timestamps, or extras", async () => {
    const base = conversation();
    const invalid = [
      { conversations: { [base.id]: { ...base, id: "conv_deadbeef" } }, version: 1 },
      { conversations: { [base.id]: { ...base, updatedAt: "2026-07-22T01:02:00Z" } }, version: 1 },
      { conversations: { [base.id]: { ...base, surprise: true } }, version: 1 },
      { conversations: { [base.id]: { ...base, turns: [{ content: "x", role: "user", surprise: true }] } }, version: 1 },
      { conversations: { [base.id]: base }, version: 2 }
    ];
    for (const payload of invalid) {
      const file = await fixture(payload);
      await expect(readExactConversationCatalog(file)).rejects.toBeInstanceOf(ConversationExactReadError);
    }
  });

  it("rejects duplicate keys and invalid UTF-8 without quarantine or rewrite", async () => {
    const duplicate = await fixture();
    const duplicateRaw = '{"version":1,"version":1,"conversations":{}}\n';
    await writeFile(duplicate, duplicateRaw, "utf8");
    await expect(readExactConversationCatalog(duplicate)).rejects.toBeInstanceOf(ConversationExactReadError);
    expect(await readFile(duplicate, "utf8")).toBe(duplicateRaw);

    const invalidUtf8 = await fixture();
    await writeFile(invalidUtf8, new Uint8Array([0x7b, 0xff, 0x7d]));
    await expect(readExactConversationCatalog(invalidUtf8)).rejects.toBeInstanceOf(ConversationExactReadError);
  });

  it("enforces the physical file cap before parsing", async () => {
    const file = await fixture({ conversations: {}, version: 1 });
    await truncate(file, EXACT_CONVERSATION_FILE_MAX_BYTES + 1);
    await expect(readExactConversationCatalog(file)).rejects.toThrow("size limit");
  });

  it("enforces the conversation and per-conversation turn budgets", async () => {
    const records = Object.fromEntries(Array.from({ length: 5_001 }, (_, index) => {
      const id = `conv_${index.toString().padStart(8, "0")}`;
      return [id, conversation(id)];
    }));
    await expect(readExactConversationCatalog(await fixture({ conversations: records, version: 1 })))
      .rejects.toBeInstanceOf(ConversationExactReadError);

    const item = { ...conversation(), turns: Array.from({ length: 201 }, () => ({ content: "x", role: "user" })) };
    await expect(readExactConversationCatalog(await fixture({ conversations: { [item.id]: item }, version: 1 })))
      .rejects.toBeInstanceOf(ConversationExactReadError);
  });

  it("accepts structurally valid non-linkable origins and ids for listing", async () => {
    const item = { ...conversation("matrix room/opaque"), origin: "matrix:room" };
    const file = await fixture({ conversations: { [item.id]: item }, version: 1 });
    await expect(readExactConversationCatalog(file)).resolves.toEqual([item]);
  });
});
