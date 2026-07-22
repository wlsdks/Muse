import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";

import { formatConversationList, registerChatsCommands } from "./commands-chats.js";
import type { ConversationSummary } from "@muse/stores";

const NOW = new Date("2026-07-14T12:00:00.000Z");

function summary(over: Partial<ConversationSummary>): ConversationSummary {
  return {
    createdAt: "2026-07-14T09:00:00.000Z",
    id: "conv_deadbeef",
    origin: "cli",
    title: "a conversation",
    turnCount: 4,
    updatedAt: "2026-07-14T09:00:00.000Z",
    ...over
  };
}

describe("formatConversationList", () => {
  it("reports 'no conversations yet' for an empty list", () => {
    expect(formatConversationList([], undefined, NOW)).toContain("No conversations yet");
  });

  it("keeps the chats list JSON shape and adds only exact context references", async () => {
    const root = await mkdtemp(join(tmpdir(), "muse-chats-command-"));
    const conversationsFile = join(root, "conversations.json");
    const activeFile = join(root, "active.json");
    const item = {
      createdAt: "2026-07-22T01:00:00.000Z", id: "conv_0a1b2c3d", origin: "cli", title: "Owner plan",
      turns: [{ content: "Continue this plan", role: "user" }], updatedAt: "2026-07-22T01:02:00.000Z"
    };
    await writeFile(conversationsFile, `${JSON.stringify({ conversations: { [item.id]: item }, version: 1 })}\n`, "utf8");
    await writeFile(activeFile, `${JSON.stringify({ activeId: item.id, version: 1 })}\n`, "utf8");
    vi.stubEnv("MUSE_CONVERSATIONS_FILE", conversationsFile);
    vi.stubEnv("MUSE_ACTIVE_CONVERSATION_FILE", activeFile);
    const stdout: string[] = [];
    try {
      const program = new Command().exitOverride();
      registerChatsCommands(program, { stderr: () => undefined, stdout: (message) => stdout.push(message) });
      await program.parseAsync(["node", "muse", "chats", "list", "--json"]);
      expect(JSON.parse(stdout.join(""))).toEqual({
        activeId: item.id,
        continuityReferences: [{ artifactId: item.id, artifactType: "conversation", providerId: "local", role: "context" }],
        conversations: [{ createdAt: item.createdAt, id: item.id, origin: "cli", title: item.title, turnCount: 1, updatedAt: item.updatedAt }],
        total: 1
      });
      expect(await readFile(conversationsFile, "utf8")).toContain(item.id);

      await rm(activeFile);
      stdout.length = 0;
      const missingPointerProgram = new Command().exitOverride();
      registerChatsCommands(missingPointerProgram, { stderr: () => undefined, stdout: (message) => stdout.push(message) });
      await missingPointerProgram.parseAsync(["node", "muse", "chats", "list", "--json"]);
      expect(JSON.parse(stdout.join(""))).toMatchObject({ activeId: item.id, total: 1 });
      await expect(readFile(activeFile, "utf8")).rejects.toMatchObject({ code: "ENOENT" });

      const malformed = "{not json\n";
      await writeFile(activeFile, malformed, "utf8");
      stdout.length = 0;
      const malformedPointerProgram = new Command().exitOverride();
      registerChatsCommands(malformedPointerProgram, { stderr: () => undefined, stdout: (message) => stdout.push(message) });
      await malformedPointerProgram.parseAsync(["node", "muse", "chats", "list", "--json"]);
      expect(JSON.parse(stdout.join(""))).toMatchObject({ activeId: item.id, total: 1 });
      expect(await readFile(activeFile, "utf8")).toBe(malformed);

      await writeFile(conversationsFile, '{"conversations":{},"version":1}\n', "utf8");
      stdout.length = 0;
      const emptyProgram = new Command().exitOverride();
      registerChatsCommands(emptyProgram, { stderr: () => undefined, stdout: (message) => stdout.push(message) });
      await emptyProgram.parseAsync(["node", "muse", "chats", "list", "--json"]);
      expect(JSON.parse(stdout.join(""))).toMatchObject({ activeId: null, conversations: [], total: 0 });
    } finally {
      vi.unstubAllEnvs();
      await rm(root, { force: true, recursive: true });
    }
  });

  it("numbers each row and includes id prefix, title, turn count, relative time", () => {
    const text = formatConversationList(
      [summary({ id: "conv_aaaaaaaa", title: "plan Q3", turnCount: 6, updatedAt: "2026-07-14T11:55:00.000Z" })],
      undefined,
      NOW
    );
    expect(text).toMatch(/^1\. \[conv_aaaaaaaa\] plan Q3 — 6 turns, updated 5m ago\n$/u);
  });

  it("singularizes 'turn' for a 1-turn conversation", () => {
    const text = formatConversationList([summary({ turnCount: 1 })], undefined, NOW);
    expect(text).toContain("— 1 turn,");
    expect(text).not.toContain("1 turns");
  });

  it("marks the active conversation with '(active)' and no others", () => {
    const text = formatConversationList(
      [
        summary({ id: "conv_aaaaaaaa", title: "first" }),
        summary({ id: "conv_bbbbbbbb", title: "second" })
      ],
      "conv_bbbbbbbb",
      NOW
    );
    const lines = text.trim().split("\n");
    expect(lines[0]).not.toContain("(active)");
    expect(lines[1]).toContain("(active)");
  });

  it("lists in the order given (list() sorts by updatedAt desc — this function only numbers)", () => {
    const text = formatConversationList(
      [summary({ id: "conv_aaaaaaaa", title: "newest" }), summary({ id: "conv_bbbbbbbb", title: "older" })],
      undefined,
      NOW
    );
    const lines = text.trim().split("\n");
    expect(lines[0]).toContain("newest");
    expect(lines[1]).toContain("older");
  });

  it("sanitizes hostile titles and prints a copy-ready context-only reference", () => {
    const text = formatConversationList(
      [summary({ id: "conv_aaaaaaaa", title: "Before\u001b[31m\nAfter" })],
      undefined,
      NOW,
      new Set(["conv_aaaaaaaa"])
    );
    expect(text).toContain("Before[31m After");
    expect(text.replaceAll("\n", "")).not.toMatch(/[\x00-\x1f\x7f-\x9f]/u);
    expect(text).toContain("muse thread link <thread-id> conversation conv_aaaaaaaa --role context");
  });
});
