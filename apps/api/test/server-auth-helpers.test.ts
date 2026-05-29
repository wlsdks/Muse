import { describe, expect, it } from "vitest";

import { attachAuthIdentity, getAuthIdentity, requireAuthenticated, toLoginResponse } from "../src/server-auth-helpers.js";
import type { AuthIdentity, LoginResult } from "@muse/auth";

const identity = { email: "e@x.com", userId: "u1" } as unknown as AuthIdentity;

describe("attachAuthIdentity / getAuthIdentity", () => {
  it("round-trips an identity through the request's auth slot", () => {
    const request: Record<string, unknown> = {};
    attachAuthIdentity(request, identity);
    expect(request.auth).toBe(identity);
    expect(getAuthIdentity(request)).toBe(identity);
  });

  it("returns undefined when no identity has been attached", () => {
    expect(getAuthIdentity({})).toBeUndefined();
  });

  it("clears the identity when attached with undefined", () => {
    const request: Record<string, unknown> = {};
    attachAuthIdentity(request, identity);
    attachAuthIdentity(request, undefined);
    expect(getAuthIdentity(request)).toBeUndefined();
  });
});

describe("toLoginResponse", () => {
  it("serializes expiresAt to ISO and passes token + user through", () => {
    const login = { expiresAt: new Date("2026-06-01T00:00:00Z"), token: "tok", user: { id: "u1" } } as unknown as LoginResult;
    expect(toLoginResponse(login)).toEqual({
      expiresAt: "2026-06-01T00:00:00.000Z",
      token: "tok",
      user: { id: "u1" }
    });
  });
});

describe("requireAuthenticated — the per-route auth guard", () => {
  function fakeReply() {
    const calls: { status?: number; payload?: unknown } = {};
    const reply = {
      status(code: number) {
        calls.status = code;
        return {
          send(payload: unknown) {
            calls.payload = payload;
          }
        };
      }
    };
    return { calls, reply };
  }

  it("passes every request through when auth is disabled (no 401)", () => {
    const { calls, reply } = fakeReply();
    expect(requireAuthenticated({}, reply, false)).toBe(true);
    expect(calls.status).toBeUndefined();
  });

  it("passes when auth is enabled and an identity is present", () => {
    const { calls, reply } = fakeReply();
    const request: Record<string, unknown> = {};
    attachAuthIdentity(request, identity);
    expect(requireAuthenticated(request, reply, true)).toBe(true);
    expect(calls.status).toBeUndefined();
  });

  it("writes a 401 and returns false when auth is enabled but no identity is present", () => {
    const { calls, reply } = fakeReply();
    expect(requireAuthenticated({}, reply, true)).toBe(false);
    expect(calls.status).toBe(401);
    expect((calls.payload as { error: string }).error).toBe("인증이 필요합니다");
    expect(typeof (calls.payload as { timestamp: string }).timestamp).toBe("string");
  });
});
