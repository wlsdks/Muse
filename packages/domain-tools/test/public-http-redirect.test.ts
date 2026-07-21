import { describe, expect, it } from "vitest";

import { fetchPublicHttpWithRedirects, MAX_PUBLIC_HTTP_REDIRECTS } from "../src/public-http-redirect.js";
import type { HostLookup } from "../src/web-url-guard.js";

const publicLookup: HostLookup = async () => [{ address: "93.184.216.34", family: 4 }];

function response(status: number, headers: HeadersInit = {}, body = "ok", wrongUrl?: string): Response {
  const result = new Response(body, { headers, status });
  if (wrongUrl !== undefined) Object.defineProperty(result, "url", { value: wrongUrl });
  return result;
}

describe("fetchPublicHttpWithRedirects", () => {
  it("manually follows public relative redirects and owns finalUrl instead of response.url", async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    let turn = 0;
    const result = await fetchPublicHttpWithRedirects("https://public.test/start#ignored", {
      fetchImpl: (async (url, init) => {
        requests.push({ init, url: String(url) });
        turn += 1;
        return turn === 1
          ? response(302, { location: "/final" }, "redirect", "https://attacker.test/wrong")
          : response(200, { "content-type": "text/plain" }, "done", "https://attacker.test/wrong");
      }) as typeof globalThis.fetch,
      init: { credentials: "include", headers: { accept: "text/plain", authorization: "Bearer initial", cookie: "secret", "user-agent": "Muse-test", "x-api-key": "nope" } },
      lookup: publicLookup,
      retryOptions: { retries: 0 }
    });

    expect(result).toMatchObject({ finalUrl: "https://public.test/final", ok: true });
    expect(requests.map((request) => request.url)).toEqual(["https://public.test/start", "https://public.test/final"]);
    for (const request of requests) {
      expect(request.init?.method).toBe("GET");
      expect(request.init?.redirect).toBe("manual");
      expect(request.init?.body).toBeUndefined();
    }
    const firstHeaders = new Headers(requests[0]!.init?.headers);
    const secondHeaders = new Headers(requests[1]!.init?.headers);
    expect(firstHeaders.get("authorization")).toBe("Bearer initial");
    expect(secondHeaders.get("accept")).toBe("text/plain");
    expect(secondHeaders.get("user-agent")).toBe("Muse-test");
    expect(secondHeaders.get("authorization")).toBeNull();
    expect(secondHeaders.get("cookie")).toBeNull();
    expect(secondHeaders.get("x-api-key")).toBeNull();
    expect(requests[1]!.init?.credentials).toBe("omit");
    expect(requests[1]!.init?.referrerPolicy).toBe("no-referrer");
  });

  it("preflights every physical retry exactly once and blocks a private redirect before its fetch", async () => {
    const attempts: string[] = [];
    const lookups: string[] = [];
    let calls = 0;
    const lookup: HostLookup = async (host) => {
      lookups.push(host);
      return [{ address: "93.184.216.34", family: 4 }];
    };
    const retried = await fetchPublicHttpWithRedirects("https://public.test/retry", {
      fetchImpl: (async () => {
        calls += 1;
        return calls === 1 ? response(503) : response(200);
      }) as typeof globalThis.fetch,
      lookup,
      retryOptions: { beforeAttempt: ({ attempt }) => { attempts.push(`caller:${attempt.toString()}`); }, retries: 1, sleep: async () => {} }
    });
    expect(retried.ok).toBe(true);
    expect(calls).toBe(2);
    expect(lookups).toEqual(["public.test", "public.test"]);
    expect(attempts).toEqual(["caller:0", "caller:1"]);

    const redirects: string[] = [];
    const blocked = await fetchPublicHttpWithRedirects("https://public.test/start", {
      fetchImpl: (async (url) => {
        redirects.push(String(url));
        return response(302, { location: "http://127.0.0.1/private" });
      }) as typeof globalThis.fetch,
      lookup: publicLookup,
      retryOptions: { retries: 0 }
    });
    expect(blocked).toMatchObject({ code: "PUBLIC_REDIRECT_BLOCKED_TARGET", ok: false, phase: "redirect" });
    expect(redirects).toEqual(["https://public.test/start"]);
  });

  it("keeps malformed/initial guard errors before lookup or fetch and rejects non-GET/body requests before I/O", async () => {
    let lookups = 0;
    let fetches = 0;
    const lookup: HostLookup = async () => { lookups += 1; return [{ address: "93.184.216.34", family: 4 }]; };
    const fetchImpl = (async () => { fetches += 1; return response(200); }) as typeof globalThis.fetch;

    const malformed = await fetchPublicHttpWithRedirects("not a URL", { fetchImpl, lookup });
    expect(malformed).toMatchObject({ code: "PUBLIC_INITIAL_INVALID_URL", ok: false, phase: "initial" });
    // The message must name the expected shape + echo the rejected value — the raw
    // WHATWG DOMException text ("invalid URL: Invalid URL") named neither.
    if (!malformed.ok) {
      expect(malformed.message).toContain("http(s)");
      expect(malformed.message).toContain("not a URL");
    }
    const ftp = await fetchPublicHttpWithRedirects("ftp://public.test/a", { fetchImpl, lookup });
    expect(ftp).toMatchObject({ code: "PUBLIC_INITIAL_GUARD", ok: false, phase: "initial" });
    const method = await fetchPublicHttpWithRedirects("https://public.test/a", { fetchImpl, lookup, retryOptions: { init: { method: "POST" } } });
    const body = await fetchPublicHttpWithRedirects("https://public.test/a", { fetchImpl, lookup, retryOptions: { init: { body: "not allowed" } } });
    expect(method).toMatchObject({ code: "PUBLIC_REDIRECT_INVALID_REQUEST", ok: false });
    expect(body).toMatchObject({ code: "PUBLIC_REDIRECT_INVALID_REQUEST", ok: false });
    expect(lookups).toBe(0); // ftp's sync protocol guard and invalid request shapes do no DNS I/O.
    expect(fetches).toBe(0);
  });

  it("enforces the sixth-response limit before Location is inspected or a seventh request starts", async () => {
    let calls = 0;
    const headers = { get: (_name: string) => { throw new Error("Location must not be read after the limit"); } } as unknown as Headers;
    const result = await fetchPublicHttpWithRedirects("https://public.test/0", {
      fetchImpl: (async () => {
        calls += 1;
        if (calls === MAX_PUBLIC_HTTP_REDIRECTS + 1) {
          return { headers, ok: false, status: 302 } as unknown as Response;
        }
        return response(302, { location: `/${calls.toString()}` });
      }) as typeof globalThis.fetch,
      lookup: publicLookup,
      retryOptions: { retries: 0 }
    });
    expect(result).toMatchObject({ code: "PUBLIC_REDIRECT_LIMIT", ok: false, phase: "redirect" });
    expect(calls).toBe(MAX_PUBLIC_HTTP_REDIRECTS + 1);
  });

  it("keeps missing, malformed, loop, and non-follow redirect-status semantics deterministic", async () => {
    const missing = await fetchPublicHttpWithRedirects("https://public.test/missing", {
      fetchImpl: (async () => response(302)) as typeof globalThis.fetch,
      lookup: publicLookup,
      retryOptions: { retries: 0 }
    });
    const malformed = await fetchPublicHttpWithRedirects("https://public.test/malformed", {
      fetchImpl: (async () => response(302, { location: "http://[" })) as typeof globalThis.fetch,
      lookup: publicLookup,
      retryOptions: { retries: 0 }
    });
    const loop = await fetchPublicHttpWithRedirects("https://public.test/loop#first", {
      fetchImpl: (async () => response(302, { location: "/loop#second" })) as typeof globalThis.fetch,
      lookup: publicLookup,
      retryOptions: { retries: 0 }
    });
    let nonFollowCalls = 0;
    const nonFollow = await fetchPublicHttpWithRedirects("https://public.test/300", {
      fetchImpl: (async () => { nonFollowCalls += 1; return response(300, { location: "/would-be-next" }); }) as typeof globalThis.fetch,
      lookup: publicLookup,
      retryOptions: { retries: 0 }
    });
    expect(missing).toMatchObject({ code: "PUBLIC_REDIRECT_MISSING_LOCATION", ok: false });
    expect(malformed).toMatchObject({ code: "PUBLIC_REDIRECT_INVALID_LOCATION", ok: false });
    expect(loop).toMatchObject({ code: "PUBLIC_REDIRECT_LOOP", ok: false });
    expect(nonFollow).toMatchObject({ finalUrl: "https://public.test/300", ok: true });
    expect(nonFollowCalls).toBe(1);
  });
});
