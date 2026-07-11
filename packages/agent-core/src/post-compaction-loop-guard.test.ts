import type { ModelToolCall } from "@muse/model";
import type { JsonObject } from "@muse/shared";
import { describe, expect, it } from "vitest";

import {
  buildPostCompactionSignature,
  detectPostCompactionLoop,
  PostCompactionLoopGuard,
  POST_COMPACTION_GUARD_WINDOW
} from "./post-compaction-loop-guard.js";

const call = (id: string, name = "search", args: JsonObject = { q: "x" }): ModelToolCall => ({
  arguments: args,
  id,
  name
});

describe("PostCompactionLoopGuard", () => {
  it("not armed: record() is always a no-op, even for a repeated signature", () => {
    const guard = new PostCompactionLoopGuard();
    expect(guard.record("search:{}:ok")).toBe(false);
    expect(guard.record("search:{}:ok")).toBe(false);
    expect(guard.record("search:{}:ok")).toBe(false);
  });

  it("armed + same signature repeated to the window trips on the Nth record, not before", () => {
    const guard = new PostCompactionLoopGuard();
    guard.arm();
    expect(guard.record("search:{}:ok")).toBe(false); // 1
    expect(guard.record("search:{}:ok")).toBe(false); // 2 — window is 3, not yet
    expect(guard.record("search:{}:ok")).toBe(true); // 3 — trips
  });

  it("armed + different signatures (real progress) never trips", () => {
    const guard = new PostCompactionLoopGuard();
    guard.arm();
    expect(guard.record("search:{}:page1")).toBe(false);
    expect(guard.record("search:{}:page2")).toBe(false);
    expect(guard.record("search:{}:page3")).toBe(false);
    expect(guard.record("search:{}:page4")).toBe(false);
  });

  it("arm() resets the counter: a partial pre-arm streak does not carry over", () => {
    const guard = new PostCompactionLoopGuard();
    guard.arm();
    expect(guard.record("search:{}:ok")).toBe(false); // 1
    expect(guard.record("search:{}:ok")).toBe(false); // 2 — one short of tripping
    guard.arm(); // re-armed (e.g. a second compaction) — window resets
    expect(guard.record("search:{}:ok")).toBe(false); // 1 again, not 3
    expect(guard.record("search:{}:ok")).toBe(false); // 2 again
    expect(guard.record("search:{}:ok")).toBe(true); // 3 — trips only now
  });

  it("signature includes the RESULT: same tool+args but a different result each time is not a repeat", () => {
    const guard = new PostCompactionLoopGuard();
    guard.arm();
    const toolCall = call("t1");
    expect(guard.record(buildPostCompactionSignature(toolCall, "result A"))).toBe(false);
    expect(guard.record(buildPostCompactionSignature(toolCall, "result B"))).toBe(false);
    expect(guard.record(buildPostCompactionSignature(toolCall, "result C"))).toBe(false);
  });

  it("signature is stable under arg key reordering, mirroring ToolCallDeduplicator.buildSignature", () => {
    const a = buildPostCompactionSignature(call("t1", "search", { a: 1, b: 2 }), "same");
    const b = buildPostCompactionSignature(call("t2", "search", { b: 2, a: 1 }), "same");
    expect(a).toBe(b);
  });

  it("a genuinely repeated tool+args+result trips the guard once armed", () => {
    const guard = new PostCompactionLoopGuard();
    guard.arm();
    const signature = buildPostCompactionSignature(call("t1"), "stuck output");
    expect(guard.record(signature)).toBe(false);
    expect(guard.record(signature)).toBe(false);
    expect(guard.record(signature)).toBe(true);
  });
});

describe("detectPostCompactionLoop (pure)", () => {
  it("fewer than window signatures never trips", () => {
    expect(detectPostCompactionLoop(["a", "a"])).toBe(false);
  });

  it("exactly window identical signatures trips", () => {
    expect(detectPostCompactionLoop(["a", "a", "a"])).toBe(true);
  });

  it("window identical signatures preceded by a different one still trips (only the tail matters)", () => {
    expect(detectPostCompactionLoop(["z", "a", "a", "a"])).toBe(true);
  });

  it("a mismatch anywhere in the trailing window does not trip", () => {
    expect(detectPostCompactionLoop(["a", "b", "a"])).toBe(false);
  });

  it("respects a custom window", () => {
    expect(detectPostCompactionLoop(["a", "a"], 2)).toBe(true);
    expect(detectPostCompactionLoop(["a", "a"], POST_COMPACTION_GUARD_WINDOW)).toBe(false);
  });
});
