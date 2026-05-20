import { describe, expect, it } from "vitest";

import { HookRegistry } from "./hook-registry.js";
import type { HookStage } from "./types.js";

function stub(id: string): HookStage {
  return { id };
}

describe("HookRegistry", () => {
  it("constructor seeds the registry from an iterable", () => {
    const registry = new HookRegistry([stub("a"), stub("b"), stub("c")]);
    expect(registry.list().map((h) => h.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("constructor defaults to an empty iterable when none is passed", () => {
    expect(new HookRegistry().list()).toEqual([]);
  });

  it("register adds a hook visible via list", () => {
    const registry = new HookRegistry();
    registry.register(stub("x"));
    expect(registry.list().map((h) => h.id)).toEqual(["x"]);
  });

  it("register REPLACES an existing hook with the same id (last-writer-wins by id)", () => {
    const registry = new HookRegistry();
    const first: HookStage = { beforeStart: () => undefined, id: "shared" };
    const second: HookStage = { afterComplete: () => undefined, id: "shared" };
    registry.register(first);
    registry.register(second);
    const listed = registry.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toBe(second);
  });

  it("unregister returns true when the id was present and false on the next call", () => {
    const registry = new HookRegistry([stub("alpha")]);
    expect(registry.unregister("alpha")).toBe(true);
    expect(registry.unregister("alpha")).toBe(false);
    expect(registry.list()).toEqual([]);
  });

  it("unregister returns false for an id that was never registered (no throw)", () => {
    expect(new HookRegistry().unregister("never")).toBe(false);
  });

  it("list returns a SNAPSHOT — mutating the returned array does not affect the registry", () => {
    const registry = new HookRegistry([stub("only")]);
    const snapshot = registry.list();
    (snapshot as HookStage[]).pop();
    expect(snapshot).toHaveLength(0);
    expect(registry.list().map((h) => h.id)).toEqual(["only"]);
  });
});
