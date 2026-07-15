import { afterEach, describe, expect, it, vi } from "vitest";

import { createApiClient } from "./client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("API client response contract", () => {
  it("turns a malformed 2xx body into an actionable transport error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>proxy error</html>", { status: 200 })));

    await expect(createApiClient("https://muse.test", "").get("/api/tasks"))
      .rejects.toThrow("Malformed API response (200)");
  });
});
