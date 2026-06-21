import { describe, expect, it } from "vitest";

import { NAV } from "./App.js";
import { LEADER_KEY } from "./useShortcuts.js";

describe("NAV leader-key shortcuts", () => {
  it("never assigns a view the reserved leader key (a g-leader jump to it is impossible)", () => {
    const collisions = NAV.filter((n) => n.key === LEADER_KEY).map((n) => n.id);
    expect(collisions, `views colliding with leader "${LEADER_KEY}"`).toEqual([]);
  });

  it("gives every view a distinct jump key (g+letter is unambiguous)", () => {
    const keys = NAV.map((n) => n.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
