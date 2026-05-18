import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { FastifyInstance } from "fastify";

import { MessagingProviderRegistry, TelegramProvider } from "@muse/messaging";
import { describe, expect, it } from "vitest";

import { startSituationalBriefingDaemonIfConfigured } from "../src/tick-daemons.js";
import type { ServerOptions } from "../src/server.js";

function fakeServer() {
  const hooks: { name: string; fn: () => unknown }[] = [];
  const server = {
    addHook: (name: string, fn: () => unknown) => {
      hooks.push({ fn, name });
    },
    log: { info: () => {}, warn: () => {} }
  } as unknown as FastifyInstance;
  return { hooks, server };
}

function configuredOptions(): ServerOptions {
  const dir = mkdtempSync(join(tmpdir(), "muse-brief-daemon-"));
  return {
    briefingSidecarFile: join(dir, "briefing-fired.json"),
    messaging: new MessagingProviderRegistry([
      new TelegramProvider({ baseUrl: "https://tg.test", fetch: async () => new Response("{}"), token: "T" })
    ]),
    objectivesFile: join(dir, "objectives.json")
  } as unknown as ServerOptions;
}

const ENV = {
  MUSE_BRIEFING_DESTINATION: "555",
  MUSE_BRIEFING_PROVIDER: "telegram"
} as unknown as NodeJS.ProcessEnv;

describe("startSituationalBriefingDaemonIfConfigured — P9-b2 child 2/2 (briefing env-gated registration)", () => {
  it("with env + options + a registered provider: registers an onClose stop hook (started + stoppable)", () => {
    const { hooks, server } = fakeServer();
    startSituationalBriefingDaemonIfConfigured(ENV, server, configuredOptions());
    const onClose = hooks.filter((h) => h.name === "onClose");
    expect(onClose).toHaveLength(1);
    // The registered stop hook runs cleanly (the daemon is real + stoppable).
    expect(() => onClose[0]!.fn()).not.toThrow();
  });

  it("absent env ⇒ NOT started (no hook registered)", () => {
    const { hooks, server } = fakeServer();
    startSituationalBriefingDaemonIfConfigured({} as NodeJS.ProcessEnv, server, configuredOptions());
    expect(hooks).toHaveLength(0);
  });

  it("env present but the required options are missing ⇒ NOT started", () => {
    const { hooks, server } = fakeServer();
    startSituationalBriefingDaemonIfConfigured(ENV, server, { messaging: undefined } as unknown as ServerOptions);
    expect(hooks).toHaveLength(0);
  });

  it("env present but the named provider is not registered ⇒ NOT started", () => {
    const { hooks, server } = fakeServer();
    const opts = configuredOptions();
    const noProvider = { ...opts, messaging: new MessagingProviderRegistry([]) } as unknown as ServerOptions;
    startSituationalBriefingDaemonIfConfigured(ENV, server, noProvider);
    expect(hooks).toHaveLength(0);
  });
});
