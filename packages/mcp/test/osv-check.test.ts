import { describe, expect, it, vi } from "vitest";

import {
  auditMcpServerPackageForMalware,
  checkPackageForMalwareAdvisory,
  InMemoryMcpServerStore,
  McpManager,
  type McpConnection
} from "../src/index.js";

function osvResponse(vulns: readonly { id: string; summary?: string }[]): Response {
  return new Response(JSON.stringify({ vulns }), { status: 200 });
}

function abortingFetchPromise(signal?: AbortSignal): Promise<Response> {
  const { promise, reject } = Promise.withResolvers<Response>();

  if (signal?.aborted) {
    reject(new DOMException("The operation was aborted", "AbortError"));
    return promise;
  }

  signal?.addEventListener("abort", () => {
    reject(new DOMException("The operation was aborted", "AbortError"));
  }, { once: true });

  return promise;
}

const okConnection: McpConnection = {
  callTool: async () => "ok",
  listTools: () => [{ description: "noop", inputSchema: { type: "object" }, name: "noop", risk: "read" }]
};

describe("checkPackageForMalwareAdvisory — direct OSV query behavior", () => {
  it("blocks (clean: false) on a genuine MAL-* advisory", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      osvResponse([{ id: "MAL-2024-1234", summary: "Known malicious package — exfiltrates env vars" }])
    );
    const result = await checkPackageForMalwareAdvisory("npm", "evil-pkg", undefined, { fetchImpl });

    expect(result.clean).toBe(false);
    expect(result.checkedLive).toBe(true);
    expect(result.advisories).toEqual([
      { id: "MAL-2024-1234", summary: "Known malicious package — exfiltrates env vars" }
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.osv.dev/v1/query",
      expect.objectContaining({ method: "POST" })
    );
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ package: { ecosystem: "npm", name: "evil-pkg" } });
  });

  it("ignores regular CVEs (non-MAL- ids) — allowed", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      osvResponse([{ id: "GHSA-xxxx-yyyy-zzzz", summary: "Unrelated regular vulnerability" }])
    );
    const result = await checkPackageForMalwareAdvisory("npm", "some-pkg", undefined, { fetchImpl });

    expect(result.clean).toBe(true);
    expect(result.checkedLive).toBe(true);
    expect(result.advisories).toEqual([]);
  });

  it("no advisories at all — allowed", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(osvResponse([]));
    const result = await checkPackageForMalwareAdvisory("npm", "left-pad", undefined, { fetchImpl });

    expect(result.clean).toBe(true);
    expect(result.checkedLive).toBe(true);
  });

  it("passes version through to the OSV query payload when given", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(osvResponse([]));
    await checkPackageForMalwareAdvisory("PyPI", "requests", "2.31.0", { fetchImpl });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      package: { ecosystem: "PyPI", name: "requests" },
      version: "2.31.0"
    });
  });

  it("fails OPEN on a network error (fetch rejects) — never throws, always allows", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ENOTFOUND api.osv.dev"));
    const result = await checkPackageForMalwareAdvisory("npm", "some-pkg", undefined, { fetchImpl });

    expect(result.clean).toBe(true);
    expect(result.checkedLive).toBe(false);
    expect(result.advisories).toEqual([]);
  });

  it("fails OPEN on a timeout — resolves quickly in-test via a mocked fetch that rejects with AbortError, never hangs", async () => {
    const fetchImpl = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      // Simulate the AbortSignal.timeout(12000) firing without an
      // actual 12s wait — proves the caller's fail-open path, not
      // real wall-clock behavior (which is covered by production
      // AbortSignal.timeout wiring, not something to fake-clock here).
      return abortingFetchPromise(init?.signal);
    });
    const start = Date.now();
    const result = await checkPackageForMalwareAdvisory("npm", "slow-pkg", undefined, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 5
    });
    const elapsedMs = Date.now() - start;

    expect(result.clean).toBe(true);
    expect(result.checkedLive).toBe(false);
    expect(elapsedMs).toBeLessThan(1000);
  });

  it("fails OPEN on a non-2xx OSV response (rate-limited / outage)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 }));
    const result = await checkPackageForMalwareAdvisory("npm", "some-pkg", undefined, { fetchImpl });

    expect(result.clean).toBe(true);
    expect(result.checkedLive).toBe(false);
  });

  it("fails OPEN on a malformed OSV response body — never crashes", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("not json{{{", { status: 200 }));
    const result = await checkPackageForMalwareAdvisory("npm", "some-pkg", undefined, { fetchImpl });

    expect(result.clean).toBe(true);
    expect(result.checkedLive).toBe(false);
  });

  it("fails OPEN when the response body is JSON but shaped unexpectedly (vulns missing / not an array)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ unexpected: true }), { status: 200 }));
    const result = await checkPackageForMalwareAdvisory("npm", "some-pkg", undefined, { fetchImpl });

    expect(result.clean).toBe(true);
    expect(result.advisories).toEqual([]);
  });
});

describe("auditMcpServerPackageForMalware — resolves the launched package from the stdio config", () => {
  it("resolves a scoped npx package + queries OSV", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(osvResponse([]));
    const result = await auditMcpServerPackageForMalware(
      { config: { args: ["-y", "@scope/mcp-server-foo", "--port", "3000"], command: "npx" }, transportType: "stdio" },
      { fetchImpl }
    );

    expect(result.safe).toBe(true);
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ package: { ecosystem: "npm", name: "@scope/mcp-server-foo" } });
  });

  it("resolves a pinned-version npx package (name@version)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(osvResponse([]));
    await auditMcpServerPackageForMalware(
      { config: { args: ["mcp-server-bar@1.2.3"], command: "npx" }, transportType: "stdio" },
      { fetchImpl }
    );

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      package: { ecosystem: "npm", name: "mcp-server-bar" },
      version: "1.2.3"
    });
  });

  it("resolves a uvx PyPI package", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(osvResponse([]));
    await auditMcpServerPackageForMalware(
      { config: { args: ["mcp-server-git", "--repository", "/tmp/repo"], command: "uvx" }, transportType: "stdio" },
      { fetchImpl }
    );

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ package: { ecosystem: "PyPI", name: "mcp-server-git" } });
  });

  it("blocks (safe: false) on a genuine MAL-* hit, naming the advisory id", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(osvResponse([{ id: "MAL-2025-9999" }]));
    const result = await auditMcpServerPackageForMalware(
      { config: { args: ["@scope/evil"], command: "npx" }, transportType: "stdio" },
      { fetchImpl }
    );

    expect(result.safe).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/MAL-2025-9999/u);
  });

  it("skips the live call entirely (safe: true, no fetch) for a command that isn't npx/uvx/pipx", async () => {
    const fetchImpl = vi.fn();
    const result = await auditMcpServerPackageForMalware(
      { config: { args: ["server.js"], command: "node" }, transportType: "stdio" },
      { fetchImpl }
    );

    expect(result.safe).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("skips the live call for a non-stdio transport", async () => {
    const fetchImpl = vi.fn();
    const result = await auditMcpServerPackageForMalware(
      { config: { url: "https://mcp.example.com/sse" }, transportType: "streamable" },
      { fetchImpl }
    );

    expect(result.safe).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("McpManager — live OSV preflight is opt-in and gates connect() alongside the static audit", () => {
  it("connect() is unaffected (no fetch call) when osvMalwareCheck is not configured — backward compatible default", async () => {
    const fetchImpl = vi.fn();
    const connect = vi.fn(async () => okConnection);
    const manager = new McpManager(new InMemoryMcpServerStore(), { connector: { connect } });

    await manager.register({ config: { args: ["@scope/pkg"], command: "npx" }, name: "srv", transportType: "stdio" });
    await expect(manager.connect("srv")).resolves.toBe(true);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(manager.getStatus("srv")).toBe("connected");
  });

  it("connect() blocks a static-audit-clean server that OSV flags as malware — never calls the connector", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(osvResponse([{ id: "MAL-2025-0001", summary: "credential exfiltration" }]));
    const connect = vi.fn(async () => okConnection);
    const manager = new McpManager(new InMemoryMcpServerStore(), {
      connector: { connect },
      osvMalwareCheck: { fetchImpl }
    });

    await manager.register({ config: { args: ["@scope/trojan-pkg"], command: "npx" }, name: "srv", transportType: "stdio" });
    await expect(manager.connect("srv")).resolves.toBe(false);

    expect(manager.getStatus("srv")).toBe("disabled");
    expect(connect).not.toHaveBeenCalled();
    const health = manager.getHealth("srv");
    expect(health.status).toBe("unhealthy");
    expect(health.error).toMatch(/MAL-2025-0001/u);
  });

  it("connect() allows a server when OSV reports no advisory", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(osvResponse([]));
    const connect = vi.fn(async () => okConnection);
    const manager = new McpManager(new InMemoryMcpServerStore(), {
      connector: { connect },
      osvMalwareCheck: { fetchImpl }
    });

    await manager.register({ config: { args: ["@scope/clean-pkg"], command: "npx" }, name: "srv", transportType: "stdio" });
    await expect(manager.connect("srv")).resolves.toBe(true);
    expect(manager.getStatus("srv")).toBe("connected");
  });

  it("connect() fails OPEN and still connects when the OSV call times out — never hangs the connect path", async () => {
    const fetchImpl = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      return abortingFetchPromise(init?.signal);
    });
    const connect = vi.fn(async () => okConnection);
    const manager = new McpManager(new InMemoryMcpServerStore(), {
      connector: { connect },
      osvMalwareCheck: { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 5 }
    });

    await manager.register({ config: { args: ["@scope/pkg"], command: "npx" }, name: "srv", transportType: "stdio" });

    const start = Date.now();
    await expect(manager.connect("srv")).resolves.toBe(true);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(manager.getStatus("srv")).toBe("connected");
  });

  it("connect() fails OPEN and still connects on an OSV network error", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const connect = vi.fn(async () => okConnection);
    const manager = new McpManager(new InMemoryMcpServerStore(), {
      connector: { connect },
      osvMalwareCheck: { fetchImpl }
    });

    await manager.register({ config: { args: ["@scope/pkg"], command: "npx" }, name: "srv", transportType: "stdio" });
    await expect(manager.connect("srv")).resolves.toBe(true);
  });

  it("a server the STATIC audit already blocks (even an npx-shaped one) stays blocked, and the OSV check is never reached (static gate runs first)", async () => {
    const fetchImpl = vi.fn();
    const connect = vi.fn(async () => okConnection);
    const store = new InMemoryMcpServerStore();
    await store.save({ autoConnect: false, config: { args: ["foo; rm -rf ~"], command: "npx" }, name: "danger", transportType: "stdio" });
    const manager = new McpManager(store, { connector: { connect }, osvMalwareCheck: { fetchImpl } });

    await expect(manager.connect("danger")).resolves.toBe(false);
    expect(manager.getStatus("danger")).toBe("disabled");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });
});
