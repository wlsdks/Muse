import { describe, expect, it } from "vitest";

import { resolveIntegrationEnvironment } from "../src/integration-environment.js";
import { evaluateLocalOnlyPosture } from "../src/setup-status.js";

describe("evaluateLocalOnlyPosture — single source of truth for doctor + setup status", () => {
  it("ON + a local model ⇒ ok, egress blocked", () => {
    const p = evaluateLocalOnlyPosture({ MUSE_LOCAL_ONLY: "true", MUSE_MODEL: "ollama/llama3.2" });
    expect(p).toMatchObject({ enabled: true, status: "ok" });
    expect(p.detail).toContain("blocked");
  });

  it("ON + an EXPLICIT cloud model ⇒ fail with the runtime's own refusal reason", () => {
    const p = evaluateLocalOnlyPosture({ MUSE_LOCAL_ONLY: "true", MUSE_MODEL: "gemini/gemini-2.0-flash", GEMINI_API_KEY: "k" });
    expect(p).toMatchObject({ enabled: true, status: "fail" });
    expect(p.detail).toContain("MUSE_LOCAL_ONLY");
  });

  it("ON + an ambient cloud key but NO explicit model ⇒ ok (default resolves local, nothing leaks)", () => {
    const p = evaluateLocalOnlyPosture({ MUSE_LOCAL_ONLY: "true", GEMINI_API_KEY: "k" });
    expect(p).toMatchObject({ enabled: true, status: "ok" });
  });

  it("explicit OFF (opt-out) + cloud credentials ⇒ warn that egress is possible", () => {
    const p = evaluateLocalOnlyPosture({ MUSE_LOCAL_ONLY: "false", OPENAI_API_KEY: "k" });
    expect(p).toMatchObject({ enabled: false, status: "warn" });
    expect(p.detail).toContain("OPENAI_API_KEY");
    expect(p.detail).toContain("off");
  });

  it("explicit OFF (opt-out) + no cloud credentials ⇒ ok (nothing to leak)", () => {
    const p = evaluateLocalOnlyPosture({ MUSE_LOCAL_ONLY: "false", MUSE_MODEL: "ollama/llama3.2" });
    expect(p).toMatchObject({ enabled: false, status: "ok" });
    expect(p.detail).toContain("off");
  });

  it("DEFAULT (unset) ⇒ local-only is OFF, cloud allowed (no key ⇒ nothing to leak)", () => {
    const p = evaluateLocalOnlyPosture({ MUSE_MODEL: "ollama/llama3.2" });
    expect(p).toMatchObject({ enabled: false, status: "ok" });
    expect(p.detail).toContain("off");
  });

  // The embedder reads OLLAMA_BASE_URL independently of the chat model, so a
  // LOCAL non-ollama chat (lmstudio) + a REMOTE OLLAMA_BASE_URL passes the chat
  // router gate (which only checks OLLAMA_BASE_URL when the CHAT provider is
  // ollama) while the embedder would egress the user's text — this fail-closes
  // at runtime, but doctor must SURFACE it (not report a false "🔒 ok").
  it("ON + a LOCAL lmstudio chat but a REMOTE OLLAMA_BASE_URL ⇒ fail (embedder egress surfaced)", () => {
    const p = evaluateLocalOnlyPosture({ MUSE_LOCAL_ONLY: "true", MUSE_MODEL: "lmstudio/llama", OLLAMA_BASE_URL: "http://192.168.1.50:11434" });
    expect(p).toMatchObject({ enabled: true, status: "fail" });
    expect(p.detail).toContain("OLLAMA_BASE_URL");
  });

  it("ON + a LOCAL lmstudio chat + a LOOPBACK OLLAMA_BASE_URL ⇒ ok (embedder stays on-box)", () => {
    const p = evaluateLocalOnlyPosture({ MUSE_LOCAL_ONLY: "true", MUSE_MODEL: "lmstudio/llama", OLLAMA_BASE_URL: "http://127.0.0.1:11434" });
    expect(p).toMatchObject({ enabled: true, status: "ok" });
  });

  it("explicit OFF (opt-out) + a remote OLLAMA_BASE_URL ⇒ NOT flagged by the embedder check (opt-out preserved)", () => {
    const p = evaluateLocalOnlyPosture({ MUSE_LOCAL_ONLY: "false", MUSE_MODEL: "ollama/llama3.2", OLLAMA_BASE_URL: "http://192.168.1.50:11434" });
    expect(p).toMatchObject({ enabled: false, status: "ok" });
  });
});

describe("resolveIntegrationEnvironment — T2-B1 frozen composition input", () => {
  it("returns before remote token or LINE-secret reads under local-only and exposes no raw env", () => {
    const observed = new Set<string>();
    const source = new Proxy({
      MUSE_CALENDAR_FILE: "/tmp/calendar.json",
      MUSE_CREDENTIALS_FILE: "/tmp/credentials.json",
      MUSE_LINE_CHANNEL_SECRET: "line-secret",
      MUSE_LOCAL_ONLY: "true",
      MUSE_MESSAGING_CREDENTIALS_FILE: "/tmp/messaging.json",
      MUSE_TELEGRAM_BOT_TOKEN: "telegram-token"
    }, {
      get(target, property, receiver) {
        if (typeof property === "string" && ["MUSE_LINE_CHANNEL_SECRET", "MUSE_TELEGRAM_BOT_TOKEN"].includes(property)) {
          observed.add(property);
        }
        return Reflect.get(target, property, receiver);
      },
      getOwnPropertyDescriptor: Reflect.getOwnPropertyDescriptor,
      has: Reflect.has,
      ownKeys: Reflect.ownKeys
    });

    const resolved = resolveIntegrationEnvironment(source);

    expect(resolved.localOnly).toBe(true);
    expect(observed).toEqual(new Set());
    expect(resolved.messaging.lineChannelSecret).toBeUndefined();
    expect(resolved.messaging.providers.telegram.envConfigured).toBe(false);
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.calendar)).toBe(true);
    expect(Object.isFrozen(resolved.messaging)).toBe(true);
    expect(Object.isFrozen(resolved.messaging.providers)).toBe(true);
    expect("env" in resolved).toBe(false);
  });

  it("honors an explicit direct-server override before ambient local-only", () => {
    expect(resolveIntegrationEnvironment({ MUSE_LOCAL_ONLY: "true" }, { localOnlyOverride: false }).localOnly).toBe(false);
    expect(resolveIntegrationEnvironment({ MUSE_LOCAL_ONLY: "false" }, { localOnlyOverride: true }).localOnly).toBe(true);
  });
});
