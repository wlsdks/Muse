import { describe, expect, it } from "vitest";

import { createHomeEntitiesTool, listHomeAssistantStates } from "../src/index.js";

const noWait = { baseDelayMs: 0, sleep: async () => {} };

function recordingFetch(responses: Array<{ status: number; body: string }>) {
  const calls: string[] = [];
  let i = 0;
  const fetchImpl = (async (url: string) => {
    calls.push(String(url));
    const r = responses[Math.min(i++, responses.length - 1)]!;
    return new Response(r.body, { status: r.status });
  }) as unknown as typeof globalThis.fetch;
  return { calls, fetchImpl };
}

const STATES = JSON.stringify([
  { attributes: { friendly_name: "Front Door" }, entity_id: "lock.front_door", state: "locked" },
  { attributes: {}, entity_id: "light.living_room", state: "on" },
  { attributes: {}, entity_id: "sensor.temp", state: "21.4" },
  { not: "an entity" } // malformed element — skipped
]);

describe("listHomeAssistantStates — discover Home Assistant entities", () => {
  it("GETs /api/states with the Bearer token and parses the entity list (skipping malformed)", async () => {
    const { calls, fetchImpl } = recordingFetch([{ body: STATES, status: 200 }]);
    const entities = await listHomeAssistantStates({ baseUrl: "http://ha.local/", fetchImpl, token: "t" });
    expect(calls[0]).toBe("http://ha.local/api/states");
    expect(entities.map((e) => e.entityId)).toEqual(["lock.front_door", "light.living_room", "sensor.temp"]);
  });

  it("filters by domain prefix", async () => {
    const { fetchImpl } = recordingFetch([{ body: STATES, status: 200 }]);
    const lights = await listHomeAssistantStates({ baseUrl: "http://ha.local", domain: "light", fetchImpl, token: "t" });
    expect(lights.map((e) => e.entityId)).toEqual(["light.living_room"]);
  });

  it("recovers from a transient 503 by retrying (read is idempotent)", async () => {
    const { calls, fetchImpl } = recordingFetch([{ body: "", status: 503 }, { body: STATES, status: 200 }]);
    const entities = await listHomeAssistantStates({ baseUrl: "http://ha.local", fetchImpl, retryOptions: noWait, token: "t" });
    expect(entities.length).toBe(3);
    expect(calls).toHaveLength(2);
  });

  it("a permanent failure / malformed body → [] (never throws)", async () => {
    expect(await listHomeAssistantStates({ baseUrl: "http://ha.local", fetchImpl: recordingFetch([{ body: "nope", status: 500 }]).fetchImpl, retryOptions: noWait, token: "t" })).toEqual([]);
    expect(await listHomeAssistantStates({ baseUrl: "http://ha.local", fetchImpl: recordingFetch([{ body: "<html>", status: 200 }]).fetchImpl, token: "t" })).toEqual([]);
  });

  it("does not enumerate a remote Home Assistant endpoint under local-only", async () => {
    const { calls, fetchImpl } = recordingFetch([{ body: STATES, status: 200 }]);
    await expect(listHomeAssistantStates({ baseUrl: "http://ha.local", fetchImpl, localOnly: true, token: "t" })).resolves.toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe("createHomeEntitiesTool — read-only discovery tool", () => {
  it("is risk:read and returns the entity list", async () => {
    const { fetchImpl } = recordingFetch([{ body: STATES, status: 200 }]);
    const tool = createHomeEntitiesTool({ baseUrl: "http://ha.local", fetchImpl, token: "t" });
    expect(tool.definition.risk).toBe("read");
    const out = await tool.execute({ domain: "lock" }) as { count: number; entities: Array<{ entity: string }> };
    expect(out.count).toBe(1);
    expect(out.entities[0]!.entity).toBe("lock.front_door");
  });

  it("the `state` filter answers 'what's ON?' — returns only matching-state entities", async () => {
    const { fetchImpl } = recordingFetch([{ body: STATES, status: 200 }]);
    const out = await createHomeEntitiesTool({ baseUrl: "http://ha.local", fetchImpl, token: "t" })
      .execute({ state: "ON" }) as { count: number; entities: Array<{ entity: string; state: string }> };
    expect(out.count).toBe(1); // case-insensitive: "ON" matches "on"
    expect(out.entities[0]!.entity).toBe("light.living_room");
  });

  it("combines domain + state ('is the front door unlocked?' → none when it's locked)", async () => {
    const { fetchImpl } = recordingFetch([{ body: STATES, status: 200 }]);
    const tool = createHomeEntitiesTool({ baseUrl: "http://ha.local", fetchImpl, token: "t" });
    const locked = await tool.execute({ domain: "lock", state: "unlocked" }) as { count: number };
    expect(locked.count).toBe(0); // the only lock is "locked"
  });

  it("declares the `state` parameter", () => {
    const tool = createHomeEntitiesTool({ baseUrl: "http://ha.local", token: "t" });
    expect(tool.definition.inputSchema.properties).toHaveProperty("state");
  });

  // listHomeAssistantStates collapses EVERY failure (unreachable host, revoked
  // token, 500) to []  — byte-identical to a genuinely empty home. The tool must
  // surface the real cause instead of reporting "you have no devices".
  it("reports an unreachable host as an error, not an empty-home count:0", async () => {
    const fetchImpl = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof globalThis.fetch;
    const tool = createHomeEntitiesTool({ baseUrl: "http://ha.local:8123", fetchImpl, retryOptions: { baseDelayMs: 0, sleep: async () => {} }, token: "t" });
    const out = await tool.execute({}) as { count: number; entities: unknown[]; error?: string };
    expect(out.count).toBe(0);
    expect(out.entities).toEqual([]);
    expect(out.error).toContain("unreachable");
    expect(out.error).toContain("ha.local:8123");
  });

  it("reports a rejected token (401) distinctly from an unreachable host", async () => {
    const { fetchImpl } = recordingFetch([{ body: "unauthorized", status: 401 }]);
    const tool = createHomeEntitiesTool({ baseUrl: "http://ha.local", fetchImpl, retryOptions: noWait, token: "bad" });
    const out = await tool.execute({}) as { error?: string };
    expect(out.error).toContain("401");
    expect(out.error).toContain("MUSE_HOMEASSISTANT_TOKEN");
  });

  // A small model routinely emits a single-element array for what should be a
  // scalar filter (`domain: ["light"]`) — it must not be silently dropped into
  // "no filter" (returning the FULL unfiltered house with no disclosure).
  it("unwraps a single-element domain array instead of silently returning the unfiltered list", async () => {
    const { fetchImpl } = recordingFetch([{ body: STATES, status: 200 }]);
    const tool = createHomeEntitiesTool({ baseUrl: "http://ha.local", fetchImpl, token: "t" });
    const out = await tool.execute({ domain: ["light"] }) as { count: number; entities: Array<{ entity: string }>; domain?: string };
    expect(out.count).toBe(1);
    expect(out.entities[0]!.entity).toBe("light.living_room");
    expect(out.domain).toBe("light");
  });

  it("rejects a non-string, non-single-array domain instead of silently returning everything", async () => {
    const { fetchImpl } = recordingFetch([{ body: STATES, status: 200 }]);
    const tool = createHomeEntitiesTool({ baseUrl: "http://ha.local", fetchImpl, token: "t" });
    const out = await tool.execute({ domain: { nested: true } }) as { count: number; entities: unknown[]; error?: string };
    expect(out.error).toContain("domain");
    expect(out.entities).toEqual([]);
  });

  it("pages a large entity list — caps the page, reports total/hasMore/nextOffset", async () => {
    const many = JSON.stringify(
      Array.from({ length: 120 }, (_, i) => ({ attributes: {}, entity_id: `light.bulb_${i.toString()}`, state: "on" }))
    );
    const { fetchImpl } = recordingFetch([{ body: many, status: 200 }]);
    const tool = createHomeEntitiesTool({ baseUrl: "http://ha.local", fetchImpl, token: "t" });
    const first = await tool.execute({}) as { count: number; total: number; hasMore: boolean; nextOffset?: number };
    expect(first.count).toBe(50);
    expect(first.total).toBe(120);
    expect(first.hasMore).toBe(true);
    expect(first.nextOffset).toBe(50);

    const { fetchImpl: fetchImpl2 } = recordingFetch([{ body: many, status: 200 }]);
    const tool2 = createHomeEntitiesTool({ baseUrl: "http://ha.local", fetchImpl: fetchImpl2, token: "t" });
    const last = await tool2.execute({ offset: 100 }) as { count: number; hasMore: boolean; nextOffset?: number };
    expect(last.count).toBe(20);
    expect(last.hasMore).toBe(false);
    expect(last.nextOffset).toBeUndefined();
  });
});
