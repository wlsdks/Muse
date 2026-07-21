import { describe, expect, it } from "vitest";

import { createHomeStateTool, readHomeAssistantState } from "../src/index.js";

const noWait = { baseDelayMs: 0, sleep: async () => {} };

function recordingFetch(responses: Array<{ status: number; body: string }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let i = 0;
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ init, url });
    const r = responses[Math.min(i++, responses.length - 1)]!;
    return new Response(r.body, { status: r.status });
  }) as unknown as typeof globalThis.fetch;
  return { calls, fetchImpl };
}

const lockedBody = JSON.stringify({
  attributes: { friendly_name: "Front Door" },
  entity_id: "lock.front_door",
  state: "locked"
});

describe("readHomeAssistantState — retry-hardened home perception", () => {
  it("GETs /api/states/<id> with the Bearer token and returns the parsed state", async () => {
    const { calls, fetchImpl } = recordingFetch([{ body: lockedBody, status: 200 }]);
    const state = await readHomeAssistantState({
      baseUrl: "http://homeassistant.local:8123/",
      entityId: "lock.front_door",
      fetchImpl,
      token: "abc"
    });
    expect(state).toEqual({ attributes: { friendly_name: "Front Door" }, entityId: "lock.front_door", state: "locked" });
    expect(calls[0]!.url).toBe("http://homeassistant.local:8123/api/states/lock.front_door");
    expect((calls[0]!.init!.headers as Record<string, string>)["authorization"]).toBe("Bearer abc");
  });

  it("recovers from a transient 503 by retrying (the P19 failure mode)", async () => {
    const { calls, fetchImpl } = recordingFetch([
      { body: "", status: 503 },
      { body: lockedBody, status: 200 }
    ]);
    const state = await readHomeAssistantState({
      baseUrl: "http://ha.local",
      entityId: "lock.front_door",
      fetchImpl,
      retryOptions: noWait,
      token: "t"
    });
    expect(state?.state).toBe("locked");
    expect(calls).toHaveLength(2);
  });

  it("a permanent 404 (unknown entity) → undefined, never throws", async () => {
    const { fetchImpl } = recordingFetch([{ body: "Not found", status: 404 }]);
    const state = await readHomeAssistantState({ baseUrl: "http://ha.local", entityId: "lock.nope", fetchImpl, retryOptions: noWait, token: "t" });
    expect(state).toBeUndefined();
  });

  it("a malformed body (200 but not the HA shape) → undefined", async () => {
    const { fetchImpl } = recordingFetch([{ body: "<html>maintenance</html>", status: 200 }]);
    const state = await readHomeAssistantState({ baseUrl: "http://ha.local", entityId: "lock.front_door", fetchImpl, token: "t" });
    expect(state).toBeUndefined();
  });

  it("does not fetch a remote direct provider under local-only", async () => {
    const { calls, fetchImpl } = recordingFetch([{ body: lockedBody, status: 200 }]);
    const state = await readHomeAssistantState({
      baseUrl: "http://ha.local:8123",
      entityId: "lock.front_door",
      fetchImpl,
      localOnly: true,
      token: "t"
    });
    expect(state).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it("canonicalizes localhost and refuses to follow a loopback read redirect", async () => {
    const { calls, fetchImpl } = recordingFetch([{ body: "", status: 302 }]);
    const state = await readHomeAssistantState({
      baseUrl: "http://localhost:8123/",
      entityId: "lock.front_door",
      fetchImpl,
      localOnly: true,
      token: "t"
    });
    expect(state).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("http://127.0.0.1:8123/api/states/lock.front_door");
    expect(calls[0]!.init?.redirect).toBe("manual");
  });
});

describe("createHomeStateTool — read-only agent tool", () => {
  it("is risk:read (ungated) and reports the entity state", async () => {
    const { fetchImpl } = recordingFetch([{ body: lockedBody, status: 200 }]);
    const tool = createHomeStateTool({ baseUrl: "http://ha.local", fetchImpl, token: "t" });
    expect(tool.definition.risk).toBe("read");
    const out = await tool.execute({ entity: "lock.front_door" });
    expect(out).toMatchObject({ entity: "lock.front_door", found: true, state: "locked" });
  });

  it("an unreachable / unknown entity reports found:false instead of crashing", async () => {
    const { fetchImpl } = recordingFetch([{ body: "", status: 500 }]);
    const tool = createHomeStateTool({ baseUrl: "http://ha.local", fetchImpl, retryOptions: noWait, token: "t" });
    const out = await tool.execute({ entity: "lock.front_door" });
    expect(out).toMatchObject({ found: false });
  });

  // "no state returned (unknown entity or Home Assistant unreachable)" named two
  // mutually exclusive causes — a dead host and a typo'd entity id are different
  // facts, and only one of them tells the model to try home_entities next.
  it("distinguishes a genuinely unknown entity (404) from an unreachable host", async () => {
    const { fetchImpl } = recordingFetch([{ body: "Entity not found", status: 404 }]);
    const tool = createHomeStateTool({ baseUrl: "http://ha.local", fetchImpl, retryOptions: noWait, token: "t" });
    const out = await tool.execute({ entity: "lock.nope" }) as { found: boolean; reason: string };
    expect(out.found).toBe(false);
    expect(out.reason).toContain("lock.nope");
    expect(out.reason).toContain("home_entities");
  });

  it("reports a network-unreachable host distinctly from an unknown entity", async () => {
    const fetchImpl = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof globalThis.fetch;
    const tool = createHomeStateTool({ baseUrl: "http://ha.local:8123", fetchImpl, retryOptions: noWait, token: "t" });
    const out = await tool.execute({ entity: "lock.front_door" }) as { found: boolean; reason: string };
    expect(out.found).toBe(false);
    expect(out.reason).toContain("unreachable");
    expect(out.reason).toContain("ha.local:8123");
  });

  it("reports a rejected token (401) distinctly, naming the fix", async () => {
    const { fetchImpl } = recordingFetch([{ body: "unauthorized", status: 401 }]);
    const tool = createHomeStateTool({ baseUrl: "http://ha.local", fetchImpl, retryOptions: noWait, token: "bad" });
    const out = await tool.execute({ entity: "lock.front_door" }) as { found: boolean; reason: string };
    expect(out.found).toBe(false);
    expect(out.reason).toContain("401");
    expect(out.reason).toContain("MUSE_HOMEASSISTANT_TOKEN");
  });
});
