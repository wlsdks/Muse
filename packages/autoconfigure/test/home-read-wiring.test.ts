import { describe, expect, it } from "vitest";

import { createMuseRuntimeAssembly } from "../src/index.js";

describe("createMuseRuntimeAssembly — smart-home READ tools reachability gating", () => {
  it("exposes home_state + home_entities when Home Assistant creds are set", () => {
    const assembly = createMuseRuntimeAssembly({
      env: { MUSE_HOMEASSISTANT_TOKEN: "ha-tok", MUSE_HOMEASSISTANT_URL: "http://ha.local:8123" }
    });
    expect(assembly.toolRegistry.get("home_state")).toBeDefined();
    expect(assembly.toolRegistry.get("home_entities")).toBeDefined();
    // Read tools — ungated perception (not the execute-risk actuator set).
    expect(assembly.toolRegistry.get("home_state")!.definition.risk).toBe("read");
    expect(assembly.toolRegistry.get("home_entities")!.definition.risk).toBe("read");
  });

  it("does NOT expose the home read tools without HA creds (opt-in)", () => {
    expect(createMuseRuntimeAssembly({ env: {} }).toolRegistry.get("home_state")).toBeUndefined();
    // URL without token is incomplete → still off.
    const partial = createMuseRuntimeAssembly({ env: { MUSE_HOMEASSISTANT_URL: "http://ha.local:8123" } });
    expect(partial.toolRegistry.get("home_entities")).toBeUndefined();
  });
});
