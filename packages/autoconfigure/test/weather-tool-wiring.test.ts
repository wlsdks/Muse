import { describe, expect, it } from "vitest";

import { createMuseRuntimeAssembly } from "../src/index.js";

describe("createMuseRuntimeAssembly — weather tool reachability", () => {
  it("exposes the read-only `weather` tool in the runtime registry (no creds needed — open-meteo is keyless)", () => {
    const assembly = createMuseRuntimeAssembly({ env: {} });
    const tool = assembly.toolRegistry.get("weather");
    expect(tool).toBeDefined();
    expect(tool!.definition.risk).toBe("read");
  });
});
