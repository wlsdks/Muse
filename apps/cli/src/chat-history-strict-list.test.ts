import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { listConversationsStrict, peekActiveConversationId } from "./chat-history.js";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("strict read-only chat listing", () => {
  it("publishes only provenance-safe exact context references and does not initialize the pointer", async () => {
    const root = await mkdtemp(join(tmpdir(), "muse-chat-strict-list-"));
    roots.push(root);
    vi.stubEnv("HOME", root);
    const museDir = join(root, ".muse");
    await mkdir(museDir);
    const cli = {
      createdAt: "2026-07-22T01:00:00.000Z", id: "conv_0a1b2c3d", origin: "cli", title: "Owner plan",
      turns: [{ content: "Plan this", role: "user" }], updatedAt: "2026-07-22T01:02:00.000Z"
    };
    const messaging = { ...cli, id: "matrix:room", origin: "matrix" };
    const file = join(museDir, "conversations.json");
    const raw = `${JSON.stringify({ conversations: { [cli.id]: cli, [messaging.id]: messaging }, version: 1 }, null, 2)}\n`;
    await writeFile(file, raw, "utf8");

    await expect(listConversationsStrict()).resolves.toMatchObject({
      continuityReferences: [{ artifactId: cli.id, artifactType: "conversation", providerId: "local", role: "context" }],
      summaries: [{ id: cli.id }, { id: messaging.id }]
    });
    await expect(peekActiveConversationId()).resolves.toBeUndefined();
    expect(await readFile(file, "utf8")).toBe(raw);
    await expect(readFile(join(museDir, "active-conversation.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not quarantine or rewrite a malformed active pointer while listing", async () => {
    const root = await mkdtemp(join(tmpdir(), "muse-chat-strict-pointer-"));
    roots.push(root);
    vi.stubEnv("HOME", root);
    const museDir = join(root, ".muse");
    await mkdir(museDir);
    await writeFile(join(museDir, "conversations.json"), '{"conversations":{},"version":1}\n', "utf8");
    const pointer = join(museDir, "active-conversation.json");
    const malformed = "{not json\n";
    await writeFile(pointer, malformed, "utf8");

    await expect(listConversationsStrict()).resolves.toMatchObject({ summaries: [] });
    await expect(peekActiveConversationId()).resolves.toBeUndefined();
    expect(await readFile(pointer, "utf8")).toBe(malformed);
  });

  it("does not advertise a control-only role-user turn as Continuity context", async () => {
    const root = await mkdtemp(join(tmpdir(), "muse-chat-control-only-"));
    roots.push(root);
    vi.stubEnv("HOME", root);
    const museDir = join(root, ".muse");
    await mkdir(museDir);
    const item = {
      createdAt: "2026-07-22T01:00:00.000Z", id: "conv_0a1b2c3d", origin: "cli", title: "No prompt",
      turns: [{ content: "\u001b\u0000\u007f", role: "user" }], updatedAt: "2026-07-22T01:02:00.000Z"
    };
    await writeFile(join(museDir, "conversations.json"), `${JSON.stringify({ conversations: { [item.id]: item }, version: 1 })}\n`, "utf8");
    await expect(listConversationsStrict()).resolves.toMatchObject({ continuityReferences: [] });
  });
});
