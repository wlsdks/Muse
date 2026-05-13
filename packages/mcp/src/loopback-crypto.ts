import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";

import type { JsonObject } from "@muse/shared";

import type { BuiltinLoopbackOptions, LoopbackMcpServer } from "./loopback.js";
import { readString } from "./loopback-helpers.js";

/**
 * `muse.crypto` loopback MCP server — deterministic crypto digests +
 * base64/hex encoding + RFC 4122 v4 UUIDs.
 *
 * Lifted out of `loopback.ts` (the next-biggest ambient factory after
 * regex was lifted ). Same public surface:
 * `createCryptoMcpServer(options?)`. Re-exported from `loopback.ts`
 * so the `@muse/mcp` barrel and existing tests keep working without
 * import-site edits.
 *
 * Tools:
 *   - `muse.crypto.hash`   — md5 / sha1 / sha256 / sha512 (hex / base64)
 *   - `muse.crypto.base64` — encode / decode round-trip
 *   - `muse.crypto.hex`    — encode / decode round-trip
 *   - `muse.crypto.uuid`   — v4 UUID via `options.uuid` injection or
 *     `randomUUID` fallback
 */
export function createCryptoMcpServer(options: BuiltinLoopbackOptions = {}): LoopbackMcpServer {
  const supportedAlgorithms = ["md5", "sha1", "sha256", "sha512"] as const;
  return {
    description: "Built-in crypto digest and encoding utilities (loopback MCP).",
    name: "muse.crypto",
    tools: [
      {
        description:
          "Hashes the input string with the requested algorithm (md5, sha1, sha256, sha512). Returns hex digest by default; pass encoding='base64' to get base64.",
        execute: (args): JsonObject => {
          const text = readString(args, "text");
          if (text === undefined) {
            return { error: "text is required" };
          }
          const algorithm = (readString(args, "algorithm") ?? "sha256").toLowerCase();
          if (!supportedAlgorithms.includes(algorithm as (typeof supportedAlgorithms)[number])) {
            return { error: `algorithm must be one of ${supportedAlgorithms.join(", ")}` };
          }
          const encoding = readString(args, "encoding") ?? "hex";
          if (encoding !== "hex" && encoding !== "base64") {
            return { error: "encoding must be 'hex' or 'base64'" };
          }
          try {
            const digest = createHash(algorithm).update(text, "utf8").digest(encoding);
            return { algorithm, digest, encoding } satisfies JsonObject;
          } catch (error) {
            return { error: error instanceof Error ? error.message : "hash failed" };
          }
        },
        inputSchema: {
          additionalProperties: false,
          properties: {
            algorithm: { enum: [...supportedAlgorithms], type: "string" },
            encoding: { enum: ["hex", "base64"], type: "string" },
            text: { type: "string" }
          },
          required: ["text"],
          type: "object"
        },
        name: "hash",
        risk: "read"
      },
      {
        description: "Encodes the input string to base64 (mode='encode') or decodes a base64 string back to UTF-8 (mode='decode').",
        execute: (args): JsonObject => {
          const text = readString(args, "text");
          if (text === undefined) {
            return { error: "text is required" };
          }
          const mode = readString(args, "mode") ?? "encode";
          if (mode !== "encode" && mode !== "decode") {
            return { error: "mode must be 'encode' or 'decode'" };
          }
          try {
            if (mode === "encode") {
              return { mode, output: Buffer.from(text, "utf8").toString("base64") } satisfies JsonObject;
            }
            const decoded = Buffer.from(text, "base64").toString("utf8");
            return { mode, output: decoded } satisfies JsonObject;
          } catch (error) {
            return { error: error instanceof Error ? error.message : "base64 failed" };
          }
        },
        inputSchema: {
          additionalProperties: false,
          properties: {
            mode: { enum: ["encode", "decode"], type: "string" },
            text: { type: "string" }
          },
          required: ["text"],
          type: "object"
        },
        name: "base64",
        risk: "read"
      },
      {
        description: "Encodes the input string to lowercase hex (mode='encode') or decodes a hex string back to UTF-8 (mode='decode').",
        execute: (args): JsonObject => {
          const text = readString(args, "text");
          if (text === undefined) {
            return { error: "text is required" };
          }
          const mode = readString(args, "mode") ?? "encode";
          if (mode !== "encode" && mode !== "decode") {
            return { error: "mode must be 'encode' or 'decode'" };
          }
          try {
            if (mode === "encode") {
              return { mode, output: Buffer.from(text, "utf8").toString("hex") } satisfies JsonObject;
            }
            if (!/^[0-9a-fA-F]*$/u.test(text) || text.length % 2 !== 0) {
              return { error: "input is not a valid hex string" };
            }
            return { mode, output: Buffer.from(text, "hex").toString("utf8") } satisfies JsonObject;
          } catch (error) {
            return { error: error instanceof Error ? error.message : "hex failed" };
          }
        },
        inputSchema: {
          additionalProperties: false,
          properties: {
            mode: { enum: ["encode", "decode"], type: "string" },
            text: { type: "string" }
          },
          required: ["text"],
          type: "object"
        },
        name: "hex",
        risk: "read"
      },
      {
        description: "Generates a fresh RFC 4122 v4 UUID. Uses an injected idFactory for deterministic tests.",
        execute: (): JsonObject => {
          const factory = options.uuid ?? randomUUID;
          return { uuid: factory() } satisfies JsonObject;
        },
        inputSchema: {
          additionalProperties: false,
          properties: {},
          type: "object"
        },
        name: "uuid",
        risk: "read"
      }
    ]
  };
}
