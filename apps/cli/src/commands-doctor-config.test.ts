import { describe, expect, it } from "vitest";

import {
  classifyHomeAlertsConfig,
  classifyMcpServersField,
  classifyWebWatchConfig,
  resolveDoctorWatchIntervalMs,
  resolveMuseEnvPath
} from "./commands-doctor-config.js";

describe("resolveMuseEnvPath", () => {
  it("falls back on empty/whitespace/non-string, keeps a real trimmed value", () => {
    expect(resolveMuseEnvPath(undefined, "/d")).toBe("/d");
    expect(resolveMuseEnvPath("", "/d")).toBe("/d");
    expect(resolveMuseEnvPath("   ", "/d")).toBe("/d");
    expect(resolveMuseEnvPath("  /x/y  ", "/d")).toBe("/x/y");
  });
});

describe("classifyMcpServersField", () => {
  it("reads the real `mcpServers` object schema: fail on non-object root/mcpServers, warn on missing/empty, ok on populated", () => {
    expect(classifyMcpServersField(42).status).toBe("fail");
    expect(classifyMcpServersField({}).status).toBe("warn");
    expect(classifyMcpServersField({ mcpServers: "x" }).status).toBe("fail");
    expect(classifyMcpServersField({ mcpServers: [] }).status).toBe("fail");
    expect(classifyMcpServersField({ mcpServers: {} }).status).toBe("warn");
    expect(classifyMcpServersField({ mcpServers: { github: {}, notion: {} } }).status).toBe("ok");
    expect(classifyMcpServersField({ mcpServers: { github: {}, notion: {} } }).detail).toContain("2 server(s)");
  });

  it("does NOT accept the old wrong `servers` array key (regression: a valid mcp.json read as 0 servers)", () => {
    expect(classifyMcpServersField({ servers: [{}, {}] }).status).toBe("warn");
  });
});

describe("classifyWebWatchConfig", () => {
  it("is undefined when unset/empty-array, warns on invalid JSON / non-array", () => {
    expect(classifyWebWatchConfig(undefined)).toBeUndefined();
    expect(classifyWebWatchConfig("   ")).toBeUndefined();
    expect(classifyWebWatchConfig("[]")).toBeUndefined();
    expect(classifyWebWatchConfig("{not json")?.status).toBe("warn");
    expect(classifyWebWatchConfig("{}")?.status).toBe("warn");
  });
});

describe("classifyHomeAlertsConfig", () => {
  it("is undefined when unset/empty-array, warns on invalid JSON / non-array", () => {
    expect(classifyHomeAlertsConfig(undefined)).toBeUndefined();
    expect(classifyHomeAlertsConfig("[]")).toBeUndefined();
    expect(classifyHomeAlertsConfig("nope")?.status).toBe("warn");
    expect(classifyHomeAlertsConfig("{}")?.status).toBe("warn");
  });
});

describe("resolveDoctorWatchIntervalMs", () => {
  it("defaults to 5000, clamps to [1s,3600s], rejects non-positive/NaN", () => {
    expect(resolveDoctorWatchIntervalMs(undefined)).toBe(5000);
    expect(resolveDoctorWatchIntervalMs("0")).toBe(5000);
    expect(resolveDoctorWatchIntervalMs("abc")).toBe(5000);
    expect(resolveDoctorWatchIntervalMs("10")).toBe(10000);
    expect(resolveDoctorWatchIntervalMs("99999")).toBe(3600000);
  });
});
