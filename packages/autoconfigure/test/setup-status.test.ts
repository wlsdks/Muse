import { describe, expect, it } from "vitest";

import { readWebSearchEnvSnapshot } from "../src/setup-status.js";

describe("readWebSearchEnvSnapshot", () => {
  it("returns enabled=true, maxUses=5, source=default when no env vars set", () => {
    expect(readWebSearchEnvSnapshot({})).toEqual({
      enabled: true,
      maxUses: 5,
      source: "default"
    });
  });

  it("MUSE_WEB_SEARCH=off flips enabled to false with source=env", () => {
    expect(readWebSearchEnvSnapshot({ MUSE_WEB_SEARCH: "off" })).toEqual({
      enabled: false,
      maxUses: 5,
      source: "env"
    });
  });

  it("MUSE_WEB_SEARCH=on is the explicit-enable form with source=env", () => {
    expect(readWebSearchEnvSnapshot({ MUSE_WEB_SEARCH: "on" })).toEqual({
      enabled: true,
      maxUses: 5,
      source: "env"
    });
  });

  it("MUSE_WEB_SEARCH_MAX_USES overrides default maxUses when positive", () => {
    expect(readWebSearchEnvSnapshot({ MUSE_WEB_SEARCH_MAX_USES: "12" })).toEqual({
      enabled: true,
      maxUses: 12,
      source: "env"
    });
  });

  it("non-positive MUSE_WEB_SEARCH_MAX_USES falls back to default 5", () => {
    expect(readWebSearchEnvSnapshot({ MUSE_WEB_SEARCH_MAX_USES: "abc" })).toEqual({
      enabled: true,
      maxUses: 5,
      source: "default"
    });
  });

  it("OFF flag is case-insensitive (OFF / Off / off all disable)", () => {
    for (const value of ["OFF", "Off", "off"]) {
      expect(readWebSearchEnvSnapshot({ MUSE_WEB_SEARCH: value }).enabled).toBe(false);
    }
  });
});
