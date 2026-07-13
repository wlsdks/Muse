import { mkdtempSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { validateToolDefinitions } from "@muse/tools";
import { describe, expect, it, vi } from "vitest";

import { createWebDownloadTool, safeDownloadName } from "./web-download-tool.js";

// Stub the system DNS resolver so the NO-lookup production path (which falls back
// to the guard's defaultLookup = node:dns/promises) hermetically resolves a
// public-looking hostname to a PRIVATE IP at preflight time. Only the
// no-lookup/hostname test hits this; every other test injects an explicit lookup
// (or uses a literal IP caught before DNS), so this stub doesn't affect them.
vi.mock("node:dns/promises", () => ({
  lookup: async () => [{ address: "169.254.169.254", family: 4 }],
}));

const ctx = { runId: "r", userId: "u1" };
const dir = () => mkdtempSync(join(tmpdir(), "muse-dl-"));
const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

function fakeFetch(body: Buffer, status = 200, headers: Record<string, string> = {}): typeof fetch {
  return (async () => new Response(new Uint8Array(body), { status, headers })) as unknown as typeof fetch;
}

describe("safeDownloadName — basename only, no traversal", () => {
  it("strips directories and traversal, keeps the basename", () => {
    expect(safeDownloadName("../../etc/passwd", "https://x/y")).toBe("passwd");
    expect(safeDownloadName("/abs/report.pdf", "https://x/y")).toBe("report.pdf");
    expect(safeDownloadName("..", "https://x/a/invoice.pdf")).toBe("invoice.pdf");
  });
  it("derives the name from the URL when none is given", () => {
    expect(safeDownloadName(undefined, "https://x.com/files/budget.xlsx?v=2")).toBe("budget.xlsx");
  });
  it("falls back to a default when nothing usable", () => {
    expect(safeDownloadName(undefined, "https://x.com/")).toMatch(/^download/);
  });
});

describe("web_download tool", () => {
  it("is a well-formed execute tool requiring url", () => {
    const tool = createWebDownloadTool({ downloadDir: dir(), fetchImpl: fakeFetch(Buffer.from("x")), lookup: publicLookup });
    expect(tool.definition.name).toBe("web_download");
    expect(tool.definition.risk).toBe("execute");
    expect(tool.definition.inputSchema.required).toEqual(["url"]);
    expect(validateToolDefinitions([tool])).toEqual([]);
  });

  it("downloads a public URL to the downloads dir and reports the path", async () => {
    const d = dir();
    const tool = createWebDownloadTool({ downloadDir: d, fetchImpl: fakeFetch(Buffer.from("PDF-BYTES")), lookup: publicLookup });
    const out = await tool.execute({ url: "https://files.test/report.pdf" }, ctx) as { saved: boolean; path: string; name: string };
    expect(out.saved).toBe(true);
    expect(out.name).toBe("report.pdf");
    expect(existsSync(out.path)).toBe(true);
    expect(readFileSync(out.path, "utf8")).toBe("PDF-BYTES");
  });

  it("uses the manual redirect final URL for a redirect download, not response.url", async () => {
    const d = dir();
    let calls = 0;
    const tool = createWebDownloadTool({
      downloadDir: d,
      fetchImpl: (async () => {
        calls += 1;
        if (calls === 1) return new Response("redirect", { status: 302, headers: { location: "/final.pdf" } });
        const final = new Response("FINAL", { status: 200 });
        Object.defineProperty(final, "url", { value: "https://attacker.test/wrong.exe" });
        return final;
      }) as unknown as typeof fetch,
      lookup: publicLookup
    });
    const out = await tool.execute({ url: "https://files.test/start" }, ctx) as { name: string; saved: boolean };
    expect(out).toMatchObject({ name: "final.pdf", saved: true });
  });

  it("does NOT clobber an existing file — dedupes like a browser (no silent data loss)", async () => {
    const d = dir();
    writeFileSync(join(d, "report.pdf"), "PRECIOUS-USER-FILE", "utf8");
    const tool = createWebDownloadTool({ downloadDir: d, fetchImpl: fakeFetch(Buffer.from("NEW-WEB-BYTES")), lookup: publicLookup });
    const out = await tool.execute({ url: "https://files.test/report.pdf" }, ctx) as { saved: boolean; name: string; path: string };
    expect(out.saved).toBe(true);
    expect(out.name).toBe("report (1).pdf"); // deduped, not the taken name
    expect(readFileSync(join(d, "report.pdf"), "utf8")).toBe("PRECIOUS-USER-FILE"); // original UNTOUCHED
    expect(readFileSync(out.path, "utf8")).toBe("NEW-WEB-BYTES"); // new bytes landed under the deduped name
  });

  it("SSRF: a loopback URL is refused without writing", async () => {
    const d = dir();
    let fetched = false;
    const tool = createWebDownloadTool({ downloadDir: d, fetchImpl: (async () => { fetched = true; return new Response("x"); }) as unknown as typeof fetch });
    const out = await tool.execute({ url: "http://127.0.0.1/secret" }, ctx) as { saved: boolean; reason?: string };
    expect(out.saved).toBe(false);
    expect(fetched).toBe(false);
  });

  it("SSRF (DNS preflight): a public-looking hostname whose lookup resolves to a private IP is refused", async () => {
    // A public-looking name (not a literal private IP, so the sync guard would
    // wave it through) whose DNS preflight resolves to a private address is refused.
    const d = dir();
    let fetched = false;
    const privateLookup = async () => [{ address: "10.0.0.5", family: 4 }];
    const tool = createWebDownloadTool({
      downloadDir: d,
      fetchImpl: (async () => { fetched = true; return new Response("secret"); }) as unknown as typeof fetch,
      lookup: privateLookup
    });
    const out = await tool.execute({ url: "https://files.example.com/report.pdf" }, ctx) as { saved: boolean; reason?: string };
    expect(out.saved).toBe(false);            // resolved to a private IP → refused
    expect(fetched).toBe(false);              // refused before any fetch/write
    expect(existsSync(join(d, "report.pdf"))).toBe(false);
  });

  it("SSRF (DNS preflight): the no-lookup production path resolves via defaultLookup and refuses", async () => {
    // Production wires no `lookup`, so the guard falls back to defaultLookup
    // (stubbed above → 169.254.169.254) and refuses before a request/write.
    const d = dir();
    let fetched = false;
    const tool = createWebDownloadTool({
      downloadDir: d,
      fetchImpl: (async () => { fetched = true; return new Response("secret"); }) as unknown as typeof fetch
      // NO lookup — production call-site shape; defaultLookup (stubbed) resolves private
    });
    const out = await tool.execute({ url: "https://evil.rebind.example/secret" }, ctx) as { saved: boolean; reason?: string };
    expect(out.saved).toBe(false);
    expect(fetched).toBe(false);
  });

  it("SSRF: a public URL that redirects to a private host is refused without writing", async () => {
    const d = dir();
    const requests: string[] = [];
    const redirectFetch = (async (url: string) => {
      requests.push(url);
      return new Response("redirect body must stay unread", { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } });
    }) as unknown as typeof fetch;
    const tool = createWebDownloadTool({ downloadDir: d, fetchImpl: redirectFetch, lookup: publicLookup });
    const out = await tool.execute({ url: "https://files.test/report.pdf" }, ctx) as { saved: boolean; reason?: string };
    expect(out.saved).toBe(false);
    expect(String(out.reason)).toMatch(/redirect|blocked|private|internal|ssrf/i);
    // nothing written to the downloads dir
    const { readdirSync } = await import("node:fs");
    expect(readdirSync(d)).toHaveLength(0);
    expect(requests).toEqual(["https://files.test/report.pdf"]);
  });

  it("refuses a non-http(s) scheme", async () => {
    const tool = createWebDownloadTool({ downloadDir: dir(), fetchImpl: fakeFetch(Buffer.from("x")), lookup: publicLookup });
    const out = await tool.execute({ url: "file:///etc/passwd" }, ctx) as { saved: boolean };
    expect(out.saved).toBe(false);
  });

  it("refuses a file larger than the cap (no partial write)", async () => {
    const d = dir();
    const tool = createWebDownloadTool({ downloadDir: d, fetchImpl: fakeFetch(Buffer.alloc(1024)), lookup: publicLookup, maxBytes: 256 });
    const out = await tool.execute({ url: "https://files.test/big.bin" }, ctx) as { saved: boolean; reason?: string };
    expect(out.saved).toBe(false);
    expect(String(out.reason).toLowerCase()).toMatch(/large|big|size|cap/);
  });

  it("keeps download network failures to one physical call (no inherited retry/timeout)", async () => {
    const d = dir();
    let calls = 0;
    const tool = createWebDownloadTool({
      downloadDir: d,
      fetchImpl: (async () => { calls += 1; throw new Error("offline"); }) as unknown as typeof fetch,
      lookup: publicLookup
    });
    const out = await tool.execute({ url: "https://files.test/offline.bin" }, ctx) as { saved: boolean; reason?: string };
    expect(out.saved).toBe(false);
    expect(String(out.reason)).toMatch(/offline/u);
    expect(calls).toBe(1);
  });

  it("aborts an over-cap body mid-stream — does NOT buffer the whole thing into RAM", async () => {
    const d = dir();
    let chunksPulled = 0;
    // A streamed body (NO content-length) of 20×100B chunks. The OLD code buffered the
    // whole 2000B via arrayBuffer (draining every chunk) before checking the 250B cap.
    const fetchImpl = (async () => new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        chunksPulled += 1;
        if (chunksPulled > 20) { controller.close(); return; }
        controller.enqueue(new Uint8Array(100));
      }
    }))) as unknown as typeof fetch;
    const tool = createWebDownloadTool({ downloadDir: d, fetchImpl, lookup: publicLookup, maxBytes: 250 });
    const out = await tool.execute({ url: "https://files.test/huge.bin" }, ctx) as { saved: boolean; reason?: string };
    expect(out.saved).toBe(false);
    expect(String(out.reason).toLowerCase()).toMatch(/large|cap/);
    expect(chunksPulled).toBeLessThan(6); // aborted after ~3 chunks (250/100), NOT all 20
    expect(existsSync(join(d, "huge.bin"))).toBe(false); // nothing written
  });

  it("a model-named filename is sanitized to a basename (no path escape)", async () => {
    const d = dir();
    const tool = createWebDownloadTool({ downloadDir: d, fetchImpl: fakeFetch(Buffer.from("x")), lookup: publicLookup });
    const out = await tool.execute({ url: "https://files.test/x", filename: "../../evil.sh" }, ctx) as { saved: boolean; path: string; name: string };
    expect(out.saved).toBe(true);
    expect(out.name).toBe("evil.sh");
    expect(out.path.startsWith(d)).toBe(true);
  });
});
