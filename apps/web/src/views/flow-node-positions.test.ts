import { describe, expect, it } from "vitest";

import { readNodePositions, writeNodePosition } from "./flow-node-positions.js";

function memoryStorage(initial?: Record<string, string>) {
  const map = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    read: (key: string) => map.get(key) ?? null
  };
}

describe("readNodePositions", () => {
  it("round-trips a written position under the flow's own key", () => {
    const store = memoryStorage();
    writeNodePosition(store, "job_1", "job_1::action", { x: 340, y: 120 });
    expect(readNodePositions(store, "job_1")).toEqual({ "job_1::action": { x: 340, y: 120 } });
    expect(store.read("muse.flowNodePositions.job_1")).toContain("340");
  });

  it("keeps flows isolated — another flow's layout never leaks in", () => {
    const store = memoryStorage();
    writeNodePosition(store, "job_1", "n", { x: 1, y: 2 });
    expect(readNodePositions(store, "job_2")).toEqual({});
  });

  it("merges: writing a second node keeps the first", () => {
    const store = memoryStorage();
    writeNodePosition(store, "job_1", "a", { x: 1, y: 2 });
    writeNodePosition(store, "job_1", "b", { x: 3, y: 4 });
    expect(readNodePositions(store, "job_1")).toEqual({ a: { x: 1, y: 2 }, b: { x: 3, y: 4 } });
  });

  it("fail-safe: corrupt JSON, non-object entries, and non-finite coords are dropped", () => {
    expect(readNodePositions(memoryStorage({ "muse.flowNodePositions.f": "{not json" }), "f")).toEqual({});
    expect(readNodePositions(memoryStorage({ "muse.flowNodePositions.f": "[1,2]" }), "f")).toEqual({});
    const mixed = JSON.stringify({ bad1: "nope", bad2: { x: "a", y: 1 }, bad3: { x: Infinity, y: 0 }, good: { x: 5, y: 6 } });
    expect(readNodePositions(memoryStorage({ "muse.flowNodePositions.f": mixed }), "f")).toEqual({ good: { x: 5, y: 6 } });
  });

  it("fail-safe: absent storage or throwing storage yields {} and write never throws", () => {
    expect(readNodePositions(undefined, "f")).toEqual({});
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); } };
    expect(readNodePositions(throwing, "f")).toEqual({});
    expect(() => writeNodePosition(throwing, "f", "n", { x: 1, y: 2 })).not.toThrow();
    expect(() => writeNodePosition(undefined, "f", "n", { x: 1, y: 2 })).not.toThrow();
  });

  it("refuses to persist a non-finite position (a NaN drag must not corrupt the layout)", () => {
    const store = memoryStorage();
    writeNodePosition(store, "f", "n", { x: Number.NaN, y: 2 });
    expect(readNodePositions(store, "f")).toEqual({});
  });
});
