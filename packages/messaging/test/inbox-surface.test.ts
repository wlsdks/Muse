import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FileBackedInboxContextProvider, filterFresh } from "../src/inbox-surface.js";
import { readInboxInjectionCursor } from "../src/inbox-injection-cursor.js";
import type { InboundMessage } from "../src/types.js";

let workdir: string;

beforeEach(async () => {
  workdir = await mkdtemp(join(tmpdir(), "muse-inbox-surface-"));
});

afterEach(async () => {
  await rm(workdir, { recursive: true, force: true });
});

async function writeInbox(file: string, messages: readonly InboundMessage[]): Promise<void> {
  await writeFile(file, JSON.stringify({ inbox: messages, version: 1 }, null, 2), "utf8");
}

const sampleMessages: readonly InboundMessage[] = [
  {
    messageId: "1",
    providerId: "slack",
    receivedAtIso: "2026-05-11T08:00:00.000Z",
    source: "C1",
    text: "hello"
  },
  {
    messageId: "2",
    providerId: "slack",
    receivedAtIso: "2026-05-11T08:05:00.000Z",
    source: "C1",
    text: "world"
  },
  {
    messageId: "3",
    providerId: "slack",
    receivedAtIso: "2026-05-11T08:10:00.000Z",
    source: "C2",
    text: "another channel"
  }
];

describe("filterFresh", () => {
  it("filters out messages older than the cursor per source", () => {
    const fresh = filterFresh(sampleMessages, { C1: "2026-05-11T08:00:00.000Z" }, 10);
    expect(fresh.map((m) => m.messageId)).toEqual(["2", "3"]);
  });

  it("caps to perProviderLimit (newest first)", () => {
    const fresh = filterFresh(sampleMessages, {}, 2);
    expect(fresh).toHaveLength(2);
  });
});

describe("FileBackedInboxContextProvider", () => {
  it("returns recent messages and advances the cursor", async () => {
    const inboxFile = join(workdir, "slack-inbox.json");
    const cursorFile = join(workdir, "slack-cursor.json");
    await writeInbox(inboxFile, sampleMessages);

    const provider = new FileBackedInboxContextProvider({
      sources: [{ cursorFile, inboxFile, providerId: "slack" }]
    });
    const first = await provider.resolve();
    expect(first?.messages.length).toBe(3);

    // Second call: cursor has advanced — should now return nothing
    const second = await provider.resolve();
    expect(second).toBeUndefined();

    const cursor = await readInboxInjectionCursor(cursorFile);
    expect(cursor.C1).toBe("2026-05-11T08:05:00.000Z");
    expect(cursor.C2).toBe("2026-05-11T08:10:00.000Z");
  });

  it("returns undefined when no messages exist", async () => {
    const inboxFile = join(workdir, "slack-inbox.json");
    const cursorFile = join(workdir, "slack-cursor.json");
    await writeInbox(inboxFile, []);

    const provider = new FileBackedInboxContextProvider({
      sources: [{ cursorFile, inboxFile, providerId: "slack" }]
    });
    expect(await provider.resolve()).toBeUndefined();
  });
});
