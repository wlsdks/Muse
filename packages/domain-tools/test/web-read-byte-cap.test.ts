/**
 * muse.web `read` capped a binary (PDF/image) body by `await
 * response.arrayBuffer()` then slicing — materialising the WHOLE body before
 * the cap applied. An attacker HTTP server serving `Content-Type:
 * application/pdf` with a huge chunked body forces an allocation proportional
 * to what it can push within the request timeout — tens to hundreds of MB over
 * the 10MB cap — in the process that also runs Muse's API server.
 *
 * The fix streams and cancels at the cap. This proves the PDF extractor never
 * receives more than the configured cap even when the server tries to send far
 * more.
 */

import { describe, expect, it } from "vitest";

import { createWebReadMcpServer } from "../src/index.js";

const ctx = { runId: "r", userId: "u" };

/**
 * A Response streaming up to `chunkCount` × 1MB, exposing a live counter of how
 * many MB the SERVER was allowed to push before the reader stopped pulling. That
 * counter — not what the extractor finally receives — is the allocation the
 * attack drives: the vulnerable arrayBuffer() reader pulls the whole body, the
 * streaming reader cancels at the cap.
 */
function oversizedPdf(chunkCount: number): { response: Response; emittedMb: () => number } {
  const chunk = new Uint8Array(1024 * 1024);
  let emitted = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (emitted >= chunkCount) {
        controller.close();
        return;
      }
      emitted += 1;
      controller.enqueue(chunk);
    }
  });
  return { emittedMb: () => emitted, response: new Response(stream, { headers: { "content-type": "application/pdf" }, status: 200 }) };
}

describe("muse.web read bounds a binary body to the cap, not the server's whim", () => {
  it("stops pulling the body near the cap instead of buffering the whole 50MB", async () => {
    const { response, emittedMb } = oversizedPdf(50);
    const server = createWebReadMcpServer({
      // Public IP so the SSRF guard passes; the fetch below is what actually runs.
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      fetch: (async () => response) as unknown as typeof globalThis.fetch,
      pdfMaxBytes: 2 * 1024 * 1024,
      extractPdfText: async () => "extracted"
    });
    const read = server.tools.find((tool) => tool.name === "read");
    if (!read) throw new Error("read tool missing");

    await read.execute({ url: "https://example.com/huge.pdf" }, ctx);

    // The cap is 2MB. The server must NOT have been allowed to push its full 50MB
    // — the streaming reader cancels a chunk or two past the cap. The vulnerable
    // arrayBuffer() reader would drain all 50.
    expect(emittedMb()).toBeLessThan(5);
  });
});
