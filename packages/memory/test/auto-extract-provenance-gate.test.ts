import { describe, expect, it } from "vitest";
import type { ModelProvider } from "@muse/model";

import { createUserMemoryAutoExtractHook, dropModelAssertedValues } from "../src/memory-auto-extract.js";
import { InMemoryUserMemoryStore } from "../src/memory-user-store.js";

describe("dropModelAssertedValues — keep what the USER said, drop what the MODEL asserted", () => {
  it("drops a value the model asserted in its reply but the user never said (the WireGuard leak)", () => {
    const out = dropModelAssertedValues(
      { wireguard_default_mtu: "1420" },
      "what is WireGuard's standard default MTU in bytes?",
      "The standard default MTU for WireGuard is 1420 bytes."
    );
    expect(out).toEqual({});
  });

  it("keeps a value the user stated themselves (its token is in the user turn)", () => {
    const out = dropModelAssertedValues({ home_city: "Seoul" }, "I just moved to Seoul", "Noted — Seoul it is.");
    expect(out).toEqual({ home_city: "Seoul" });
  });

  it("keeps an inferred boolean fact ('yes') even when the reply echoes it (no distinctive token to attribute)", () => {
    const out = dropModelAssertedValues(
      { allergy_penicillin: "yes" },
      "I'm allergic to penicillin",
      "Yes, noted — you are allergic to penicillin."
    );
    expect(out).toEqual({ allergy_penicillin: "yes" });
  });

  it("keeps a value present in BOTH the user turn and the reply", () => {
    const out = dropModelAssertedValues({ spouse_name: "Mina" }, "my wife is Mina", "Got it, Mina.");
    expect(out).toEqual({ spouse_name: "Mina" });
  });

  it("drops a multi-token general-knowledge answer the user only QUESTIONED", () => {
    const out = dropModelAssertedValues(
      { capital_of_france: "Paris" },
      "what's the capital of France?",
      "The capital of France is Paris."
    );
    expect(out).toEqual({});
  });

  it("keeps everything when the reply is terse and carries no value tokens (sanitize-style)", () => {
    const out = dropModelAssertedValues({ editor: "vim", f2: "v2" }, "tell muse my editor", "noted.");
    expect(out).toEqual({ editor: "vim", f2: "v2" });
  });
});

function extractorStub(output: string): ModelProvider {
  return {
    id: "stub",
    listModels: async () => [],
    generate: async () => ({ id: "r", model: "stub", output }),
    stream: async function* () { /* unused */ }
  };
}

function context(userMessage: string) {
  return {
    input: {
      runId: "run-1",
      metadata: { userId: "u1" },
      messages: [{ content: userMessage, role: "user" as const }]
    }
  };
}

describe("auto-extract hook — provenance gate end-to-end", () => {
  it("persists NOTHING when the extracted fact's value was the model's assertion (user only asked)", async () => {
    const store = new InMemoryUserMemoryStore();
    const payload = JSON.stringify({ facts: { wireguard_default_mtu: "1420" }, preferences: {}, vetoes: [], goals: [] });
    const hook = createUserMemoryAutoExtractHook({ model: "stub", modelProvider: extractorStub(payload), store, extractionCooldownMs: 0 });
    await hook.afterComplete!(
      context("what is WireGuard's default MTU in bytes?"),
      { id: "r", model: "stub", output: "The standard default MTU for WireGuard is 1420 bytes." }
    );
    expect(await store.findByUserId("u1")).toBeUndefined();
  });

  it("persists a fact the USER stated even when the same hook runs (no over-drop)", async () => {
    const store = new InMemoryUserMemoryStore();
    const payload = JSON.stringify({ facts: { home_city: "Seoul" }, preferences: {}, vetoes: [], goals: [] });
    const hook = createUserMemoryAutoExtractHook({ model: "stub", modelProvider: extractorStub(payload), store, extractionCooldownMs: 0 });
    await hook.afterComplete!(context("I just moved to Seoul"), { id: "r", model: "stub", output: "Noted." });
    const mem = await store.findByUserId("u1");
    expect(mem?.facts.home_city).toBe("Seoul");
  });
});
