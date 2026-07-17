import { describe, expect, it } from "vitest";

import { cacheControlFor } from "./static-web.js";

describe("cacheControlFor — the SPA cache contract", () => {
  it("index/html always revalidates (stale-UI incident class)", () => {
    expect(cacheControlFor("/")).toBe("no-cache");
    expect(cacheControlFor("/index.html")).toBe("no-cache");
  });
  it("content-hashed assets are immutable; everything else short-lived", () => {
    expect(cacheControlFor("/assets/index-Cu9S7Ebe.js")).toContain("immutable");
    expect(cacheControlFor("/favicon.png")).toBe("public, max-age=3600");
  });
});
