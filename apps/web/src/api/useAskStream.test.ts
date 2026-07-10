import { describe, expect, it } from "vitest";

import { INITIAL_ASK_STATE, parseSseFrame, reduceAskEvent, splitSseFrames } from "./useAskStream.js";

import type { AskResult, AskRetrieval } from "./types.js";

describe("parseSseFrame — reassembles server-multipart-sse.ts's sseData() framing", () => {
  it("reads the event name and single-line data", () => {
    expect(parseSseFrame("event: retrieval\ndata: {\"verdict\":\"confident\"}")).toEqual({
      data: '{"verdict":"confident"}',
      eventName: "retrieval"
    });
  });

  it("defaults to \"message\" when no event line is present", () => {
    expect(parseSseFrame("data: hi")).toEqual({ data: "hi", eventName: "message" });
  });

  it("rejoins a multi-line value split across several data: lines with \\n, not just the last line", () => {
    // sseData("line one\nline two") produces "line one\ndata: line two".
    const frame = "event: delta\ndata: line one\ndata: line two";
    expect(parseSseFrame(frame)).toEqual({ data: "line one\nline two", eventName: "delta" });
  });

  it("returns empty data when no data: line is present", () => {
    expect(parseSseFrame("event: error")).toEqual({ data: "", eventName: "error" });
  });
});

describe("splitSseFrames — buffers an incomplete trailing frame", () => {
  it("splits complete blank-line-terminated frames and keeps the remainder", () => {
    const { frames, rest } = splitSseFrames("event: a\ndata: 1\n\nevent: b\ndata: 2\n\nevent: c\ndata: 3");
    expect(frames).toEqual(["event: a\ndata: 1", "event: b\ndata: 2"]);
    expect(rest).toBe("event: c\ndata: 3");
  });

  it("drops blank noise frames", () => {
    const { frames, rest } = splitSseFrames("\n\nevent: a\ndata: 1\n\n");
    expect(frames).toEqual(["event: a\ndata: 1"]);
    expect(rest).toBe("");
  });

  it("returns no complete frames while the buffer has no blank-line terminator yet", () => {
    const { frames, rest } = splitSseFrames("event: a\ndata: 1");
    expect(frames).toEqual([]);
    expect(rest).toBe("event: a\ndata: 1");
  });
});

describe("reduceAskEvent — the /api/ask SSE contract (ask-routes.ts's toAskSseStream)", () => {
  const retrieval: AskRetrieval = { groundedChunkCount: 4, notesUnavailable: false, verdict: "confident" };
  const result: AskResult = {
    answer: "Your VPN MTU is 1380. [from vpn.md]",
    citations: ["vpn.md"],
    groundedChunkCount: 4,
    notesUnavailable: false,
    refusal: false,
    strippedCitations: [],
    verdict: "confident"
  };

  it("parses a retrieval event into state.retrieval", () => {
    const next = reduceAskEvent(INITIAL_ASK_STATE, "retrieval", JSON.stringify(retrieval));
    expect(next.retrieval).toEqual(retrieval);
    expect(next.answer).toBe("");
  });

  it("appends successive delta chunks to the running answer", () => {
    let state = INITIAL_ASK_STATE;
    state = reduceAskEvent(state, "delta", "Your VPN ");
    state = reduceAskEvent(state, "delta", "MTU is 1380.");
    expect(state.answer).toBe("Your VPN MTU is 1380.");
  });

  it("an empty delta is a no-op (identity, no spurious re-render trigger)", () => {
    const state = reduceAskEvent(INITIAL_ASK_STATE, "delta", "");
    expect(state).toBe(INITIAL_ASK_STATE);
  });

  it("a result event overwrites the answer with the gated final text and sets state.result", () => {
    let state = INITIAL_ASK_STATE;
    state = reduceAskEvent(state, "delta", "Your VPN MTU is 1380. [from vpn.md] [from secrets.md]");
    state = reduceAskEvent(state, "result", JSON.stringify(result));
    expect(state.answer).toBe(result.answer);
    expect(state.result).toEqual(result);
  });

  it("an error event records the message and never touches the answer/result", () => {
    let state = reduceAskEvent(INITIAL_ASK_STATE, "delta", "partial");
    state = reduceAskEvent(state, "error", "model unavailable");
    expect(state.error).toBe("model unavailable");
    expect(state.answer).toBe("partial");
    expect(state.result).toBeNull();
  });

  it("an empty error message falls back to a generic one, never a blank error state", () => {
    const state = reduceAskEvent(INITIAL_ASK_STATE, "error", "");
    expect(state.error).toBe("request failed");
  });

  it("malformed JSON on retrieval/result is ignored, not thrown", () => {
    expect(() => reduceAskEvent(INITIAL_ASK_STATE, "retrieval", "{not json")).not.toThrow();
    expect(reduceAskEvent(INITIAL_ASK_STATE, "retrieval", "{not json")).toBe(INITIAL_ASK_STATE);
    expect(reduceAskEvent(INITIAL_ASK_STATE, "result", "{not json")).toBe(INITIAL_ASK_STATE);
  });

  it("an unknown event name is a no-op", () => {
    expect(reduceAskEvent(INITIAL_ASK_STATE, "ping", "x")).toBe(INITIAL_ASK_STATE);
  });
});
