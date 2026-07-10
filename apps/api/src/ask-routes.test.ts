import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NOTES_INDEX_SCHEMA_VERSION, runGroundedRecall, type GroundedRecallInput } from "@muse/recall";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { registerAskRoutes, type AskRoutesOptions } from "./ask-routes.js";

const EMBED_MODEL = "test-embedder";

async function fakeEmbed(text: string): Promise<number[]> {
  return /vpn|mtu|wireguard/iu.test(text) ? [1, 0, 0] : [0, 1, 0];
}

let dir: string;
let notesDir: string;
let indexFile: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "api-ask-"));
  notesDir = join(dir, "notes");
  indexFile = join(dir, "notes-index.json");
  await mkdir(notesDir, { recursive: true });
  const vpnNote = join(notesDir, "vpn.md");
  const text = "WireGuard VPN MTU is 1380 on the home network.";
  await writeFile(vpnNote, text);
  await writeFile(indexFile, JSON.stringify({
    builtAtIso: new Date().toISOString(),
    files: [{ chunks: [{ chunkIndex: 0, embedding: [1, 0, 0], file: vpnNote, text }], mtimeMs: 1, path: vpnNote }],
    model: EMBED_MODEL,
    version: NOTES_INDEX_SCHEMA_VERSION
  }));
});

afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
});

function routeOptions(generated: string, extra?: Partial<AskRoutesOptions>): AskRoutesOptions {
  return {
    answerModel: "test-answerer",
    authService: undefined,
    embedFn: fakeEmbed,
    generateAnswer: async () => generated,
    notesDir,
    notesIndexFile: indexFile,
    ...extra
  };
}

interface SseFrame {
  readonly event: string;
  readonly data: string;
}

function parseSseFrames(body: string): SseFrame[] {
  return body
    .split("\n\n")
    .filter((frame) => frame.trim().length > 0)
    .map((frame) => {
      const lines = frame.split("\n");
      const event = lines.find((line) => line.startsWith("event: "))?.slice("event: ".length) ?? "";
      const dataLines = lines.filter((line) => line.startsWith("data: ")).map((line) => line.slice("data: ".length));
      return { data: dataLines.join("\n"), event };
    });
}

describe("POST /api/ask — grounded recall on the API surface", () => {
  it("answers with the surviving citation, verdict, and receipts", async () => {
    const server = Fastify();
    registerAskRoutes(server, routeOptions("Your VPN MTU is 1380. [from vpn.md]"));
    const res = await server.inject({ method: "POST", payload: { question: "what MTU does my VPN use?" }, url: "/api/ask" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { answer: string; citations: string[]; verdict: string };
    expect(body.answer).toContain("[from vpn.md]");
    expect(body.citations).toEqual(["vpn.md"]);
    expect(body.verdict).toBe("confident");
    await server.close();
  });

  it("a fabricated citation is stripped by the gate before the response leaves (fabrication=0)", async () => {
    const server = Fastify();
    registerAskRoutes(server, routeOptions("MTU is 1380. [from vpn.md] The password is hunter2. [from secrets.md]"));
    const res = await server.inject({ method: "POST", payload: { question: "what MTU does my VPN use?" }, url: "/api/ask" });
    const body = JSON.parse(res.body) as { answer: string; citations: string[]; strippedCitations: string[] };
    expect(body.answer).not.toContain("secrets.md");
    expect(body.strippedCitations).toContain("secrets.md");
    expect(body.citations).toEqual(["vpn.md"]);
    await server.close();
  });

  it("rejects a missing / empty question with 400", async () => {
    const server = Fastify();
    registerAskRoutes(server, routeOptions("unused"));
    for (const payload of [{}, { question: "  " }, { question: 7 }]) {
      const res = await server.inject({ method: "POST", payload, url: "/api/ask" });
      expect(res.statusCode).toBe(400);
    }
    await server.close();
  });

  it("PARITY: the route returns exactly what a direct runGroundedRecall call returns", async () => {
    const generated = "Your VPN MTU is 1380. [from vpn.md] Also X. [from ghost.md]";
    const seamInput: GroundedRecallInput = {
      options: { answerModel: "test-answerer" },
      query: "what MTU does my VPN use?",
      runtime: { embedFn: fakeEmbed, generateAnswer: async () => generated },
      sources: { notesDir, notesIndexFile: indexFile }
    };
    const direct = await runGroundedRecall(seamInput);

    const server = Fastify();
    registerAskRoutes(server, routeOptions(generated));
    const res = await server.inject({ method: "POST", payload: { question: seamInput.query }, url: "/api/ask" });
    const viaApi = JSON.parse(res.body) as Record<string, unknown>;

    expect(viaApi).toEqual(JSON.parse(JSON.stringify(direct)));
    await server.close();
  });
});

describe("POST /api/ask — SSE (Accept: text/event-stream)", () => {
  it("streams retrieval, delta, and result events whose concatenated answer matches the buffered response", async () => {
    const generated = "Your VPN MTU is 1380. [from vpn.md]";
    const server = Fastify();
    registerAskRoutes(server, routeOptions(generated));

    const buffered = await server.inject({ method: "POST", payload: { question: "what MTU does my VPN use?" }, url: "/api/ask" });
    const bufferedBody = JSON.parse(buffered.body) as { answer: string; citations: string[]; verdict: string };

    const streamed = await server.inject({
      headers: { accept: "text/event-stream" },
      method: "POST",
      payload: { question: "what MTU does my VPN use?" },
      url: "/api/ask"
    });

    expect(streamed.statusCode).toBe(200);
    expect(streamed.headers["content-type"]).toContain("text/event-stream");

    const frames = parseSseFrames(streamed.body);
    expect(frames.map((frame) => frame.event)).toEqual(["retrieval", "delta", "result"]);

    const retrieval = JSON.parse(frames[0]!.data) as { verdict: string; groundedChunkCount: number };
    expect(retrieval.verdict).toBe("confident");

    const concatenatedDelta = frames.filter((frame) => frame.event === "delta").map((frame) => frame.data).join("");
    const result = JSON.parse(frames[frames.length - 1]!.data) as { answer: string; citations: string[]; verdict: string };

    expect(concatenatedDelta).toBe(bufferedBody.answer);
    expect(result.answer).toBe(bufferedBody.answer);
    expect(result.citations).toEqual(bufferedBody.citations);
    expect(result.verdict).toBe(bufferedBody.verdict);
    await server.close();
  });

  it("a fabricated citation split across delta chunks never flashes in any delta or the final result (fabrication=0)", async () => {
    const chunks = ["MTU is 1380. [from vpn", ".md] The password is ", "hunter2. [from sec", "rets.md]"];
    const server = Fastify();
    registerAskRoutes(server, routeOptions("unused", {
      streamAnswer: async function* () {
        for (const chunk of chunks) {
          yield chunk;
        }
      }
    }));

    const res = await server.inject({
      headers: { accept: "text/event-stream" },
      method: "POST",
      payload: { question: "what MTU does my VPN use?" },
      url: "/api/ask"
    });

    const frames = parseSseFrames(res.body);
    const deltas = frames.filter((frame) => frame.event === "delta");
    // The pipeline's guarantee (pipeline.ts's own doc comment on GroundedRecallEvent)
    // is that the fabricated CITATION MARKER never flashes — the same
    // enforceAnswerCitations gate the buffered path uses only strips
    // "[from secrets.md]", not the sentence it was attached to.
    for (const delta of deltas) {
      expect(delta.data).not.toContain("secrets.md");
    }

    const result = JSON.parse(frames[frames.length - 1]!.data) as { answer: string; citations: string[]; strippedCitations: string[] };
    expect(result.answer).not.toContain("secrets.md");
    expect(result.strippedCitations).toContain("secrets.md");
    expect(result.citations).toEqual(["vpn.md"]);
    await server.close();
  });

  it("ends the stream with an honest error event instead of a silent truncation when generation fails mid-stream", async () => {
    const server = Fastify();
    registerAskRoutes(server, routeOptions("unused", {
      generateAnswer: async () => {
        throw new Error("model unavailable");
      }
    }));

    const res = await server.inject({
      headers: { accept: "text/event-stream" },
      method: "POST",
      payload: { question: "what MTU does my VPN use?" },
      url: "/api/ask"
    });

    const frames = parseSseFrames(res.body);
    expect(frames.map((frame) => frame.event)).toEqual(["retrieval", "error"]);
    expect(frames[1]!.data).toBe("model unavailable");
    await server.close();
  });

  it("rejects a missing / empty question with 400, same as the buffered path", async () => {
    const server = Fastify();
    registerAskRoutes(server, routeOptions("unused"));
    const res = await server.inject({
      headers: { accept: "text/event-stream" },
      method: "POST",
      payload: { question: "  " },
      url: "/api/ask"
    });
    expect(res.statusCode).toBe(400);
    expect(res.headers["content-type"]).not.toContain("text/event-stream");
    await server.close();
  });
});
