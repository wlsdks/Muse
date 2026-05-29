import { describe, expect, it } from "vitest";

import { normalizeMcpServerInput, normalizeReconnectPolicy } from "../src/in-memory-stores.js";

describe("normalizeReconnectPolicy", () => {
  it("returns the full default policy for undefined input", () => {
    expect(normalizeReconnectPolicy(undefined)).toEqual({
      enabled: true,
      initialDelayMs: 1000,
      maxAttempts: 3,
      maxDelayMs: 30000,
    });
  });

  it("fills only the unspecified fields from a partial policy", () => {
    expect(normalizeReconnectPolicy({ enabled: false, maxAttempts: 7 })).toEqual({
      enabled: false,
      initialDelayMs: 1000,
      maxAttempts: 7,
      maxDelayMs: 30000,
    });
  });

  it("falls back to defaults for non-positive or non-finite numeric fields", () => {
    expect(normalizeReconnectPolicy({ initialDelayMs: 0, maxAttempts: -3, maxDelayMs: Number.NaN })).toEqual({
      enabled: true,
      initialDelayMs: 1000,
      maxAttempts: 3,
      maxDelayMs: 30000,
    });
  });

  it("honours explicit positive values", () => {
    expect(normalizeReconnectPolicy({ enabled: true, initialDelayMs: 500, maxAttempts: 2, maxDelayMs: 9000 })).toEqual({
      enabled: true,
      initialDelayMs: 500,
      maxAttempts: 2,
      maxDelayMs: 9000,
    });
  });
});

describe("normalizeMcpServerInput", () => {
  const now = () => new Date("2026-02-02T00:00:00Z");

  it("applies defaults from minimal input and stamps id + timestamps", () => {
    const server = normalizeMcpServerInput({ name: "srv", transportType: "stdio" }, { id: "id1", now });
    expect(server).toMatchObject({
      id: "id1",
      name: "srv",
      transportType: "stdio",
      autoConnect: false,
      config: {},
      // createdAt defaults to now() (a Date); updatedAt defaults to createdAt.
      createdAt: new Date("2026-02-02T00:00:00Z"),
      updatedAt: new Date("2026-02-02T00:00:00Z"),
    });
    expect(server.description).toBeUndefined();
    expect(server.version).toBeUndefined();
  });

  it("preserves every explicitly supplied field", () => {
    const server = normalizeMcpServerInput(
      {
        name: "s",
        transportType: "sse",
        autoConnect: true,
        config: { url: "x" },
        description: "d",
        version: "1",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-06-01T00:00:00Z",
      },
      { id: "id2", now },
    );
    expect(server).toEqual({
      id: "id2",
      name: "s",
      transportType: "sse",
      autoConnect: true,
      config: { url: "x" },
      description: "d",
      version: "1",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-06-01T00:00:00Z",
    });
  });
});
