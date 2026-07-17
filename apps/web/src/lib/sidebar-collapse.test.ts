import { describe, expect, it } from "vitest";

import { readSidebarCollapsed, shellClassName, writeSidebarCollapsed } from "./sidebar-collapse.js";

function memoryStorage(initial?: Record<string, string>) {
  const map = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    read: (key: string) => map.get(key) ?? null
  };
}

describe("readSidebarCollapsed", () => {
  it("is true only for the exact stored '1'", () => {
    expect(readSidebarCollapsed(memoryStorage({ "muse.sidebarCollapsed": "1" }))).toBe(true);
  });

  it("is false for '0', absent, or any other value", () => {
    expect(readSidebarCollapsed(memoryStorage({ "muse.sidebarCollapsed": "0" }))).toBe(false);
    expect(readSidebarCollapsed(memoryStorage())).toBe(false);
    expect(readSidebarCollapsed(memoryStorage({ "muse.sidebarCollapsed": "true" }))).toBe(false);
  });

  it("falls back to false when storage throws or is absent", () => {
    const throwing: Pick<Storage, "getItem"> = {
      getItem: () => {
        throw new Error("storage blocked");
      }
    };
    expect(readSidebarCollapsed(throwing)).toBe(false);
    expect(readSidebarCollapsed(undefined)).toBe(false);
  });
});

describe("writeSidebarCollapsed", () => {
  it("persists '1' when collapsed and '0' when expanded", () => {
    const store = memoryStorage();
    writeSidebarCollapsed(store, true);
    expect(store.read("muse.sidebarCollapsed")).toBe("1");
    writeSidebarCollapsed(store, false);
    expect(store.read("muse.sidebarCollapsed")).toBe("0");
  });

  it("never throws when storage is unavailable", () => {
    const throwing: Pick<Storage, "setItem"> = {
      setItem: () => {
        throw new Error("quota exceeded");
      }
    };
    expect(() => writeSidebarCollapsed(throwing, true)).not.toThrow();
    expect(() => writeSidebarCollapsed(undefined, true)).not.toThrow();
  });
});

describe("shellClassName", () => {
  it("adds the sidebar-collapsed modifier only when collapsed", () => {
    expect(shellClassName(true)).toBe("shell sidebar-collapsed");
    expect(shellClassName(false)).toBe("shell");
  });
});
