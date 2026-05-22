import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FileAmbientSignalSource, parseAmbientNoticeRules } from "@muse/mcp";
import { MessagingProviderRegistry, type MessagingProvider, type OutboundMessage, type OutboundReceipt } from "@muse/messaging";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { startAmbientTick } from "../src/ambient-tick.js";
import { startAmbientDaemonIfConfigured } from "../src/tick-daemons.js";

function capturingProvider(sent: OutboundMessage[]): MessagingProvider {
  return {
    describe: () => ({ description: "test", displayName: "Test", id: "telegram" }),
    id: "telegram",
    async send(message: OutboundMessage): Promise<OutboundReceipt> {
      sent.push(message);
      return { destination: message.destination, messageId: "m1", providerId: "telegram" };
    }
  };
}

const RULES = parseAmbientNoticeRules(JSON.stringify([
  { id: "standup", match: { window: "standup" }, message: "Standup at 14:00 — open your notes.", title: "Standup" }
]));

let dir: string;
let file: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "muse-ambient-tick-"));
  file = join(dir, "ambient.json");
});
afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
});

describe("startAmbientTick — delivers a matched ambient notice through the messaging registry", () => {
  it("tickOnce sends the notice to the configured provider/destination", async () => {
    await writeFile(file, JSON.stringify({ app: "Calendar", window: "Team Standup — 14:00" }), "utf8");
    const sent: OutboundMessage[] = [];
    const registry = new MessagingProviderRegistry([capturingProvider(sent)]);
    const handle = startAmbientTick({
      destination: "555",
      providerId: "telegram",
      registry,
      rules: RULES,
      source: new FileAmbientSignalSource(file)
    });
    try {
      await handle.tickOnce();
      await handle.tickOnce(); // edge-triggered: same signal → no second send
    } finally {
      handle.stop();
    }
    expect(sent).toHaveLength(1);
    expect(sent[0]!.destination).toBe("555");
    expect(sent[0]!.text).toContain("Standup at 14:00");
  });

  it("no matching rule → nothing sent", async () => {
    await writeFile(file, JSON.stringify({ window: "Spotify" }), "utf8");
    const sent: OutboundMessage[] = [];
    const handle = startAmbientTick({
      destination: "555",
      providerId: "telegram",
      registry: new MessagingProviderRegistry([capturingProvider(sent)]),
      rules: RULES,
      source: new FileAmbientSignalSource(file)
    });
    try {
      await handle.tickOnce();
    } finally {
      handle.stop();
    }
    expect(sent).toHaveLength(0);
  });
});

function fakeServer() {
  const hooks: { name: string; fn: () => unknown }[] = [];
  return {
    hooks,
    server: { addHook: (name: string, fn: () => unknown) => hooks.push({ fn, name }), log: { info: () => undefined, warn: () => undefined } }
  };
}

describe("startAmbientDaemonIfConfigured — env-gated registration", () => {
  const options = { messaging: new MessagingProviderRegistry([capturingProvider([])]) } as unknown as Parameters<typeof startAmbientDaemonIfConfigured>[2];
  const env = {
    MUSE_AMBIENT_DESTINATION: "555",
    MUSE_AMBIENT_ENABLED: "true",
    MUSE_AMBIENT_PROVIDER: "telegram",
    MUSE_AMBIENT_RULES: JSON.stringify([{ id: "s", match: { window: "standup" }, message: "m", title: "t" }])
  } as unknown as NodeJS.ProcessEnv;

  it("registers an onClose stop hook when fully configured", () => {
    const { hooks, server } = fakeServer();
    startAmbientDaemonIfConfigured(env, server as never, options);
    expect(hooks.filter((h) => h.name === "onClose")).toHaveLength(1);
  });

  it("absent env / no rules ⇒ NOT started", () => {
    const { hooks, server } = fakeServer();
    startAmbientDaemonIfConfigured({} as NodeJS.ProcessEnv, server as never, options);
    startAmbientDaemonIfConfigured({ ...env, MUSE_AMBIENT_RULES: "[]" } as NodeJS.ProcessEnv, server as never, options);
    expect(hooks).toHaveLength(0);
  });
});
