import type { JsonObject } from "@muse/shared";

import type { BuiltinLoopbackOptions, LoopbackMcpServer } from "./loopback.js";

/**
 * `muse.time` clock + date utilities — `now` (timezone-aware ISO +
 * day-of-week) and `diff_ms` (signed millisecond delta between two
 * ISO timestamps). Lifted out of `loopback.ts` together with its
 * `readDate` / `readOptionalString` helpers.
 */

export function createTimeMcpServer(options: BuiltinLoopbackOptions = {}): LoopbackMcpServer {
  const now = options.now ?? (() => new Date());
  return {
    description: "Built-in clock and date utilities (loopback MCP).",
    name: "muse.time",
    tools: [
      {
        description: "Returns the current ISO timestamp, epoch milliseconds, and the resolved IANA timezone.",
        execute: (args): JsonObject => {
          const at = now();
          const timezone = readOptionalString(args, "timezone") ?? "UTC";
          try {
            const formatter = new Intl.DateTimeFormat("en-US", {
              timeZone: timezone,
              weekday: "long"
            });
            return {
              dayOfWeek: formatter.format(at),
              epochMs: at.getTime(),
              iso: at.toISOString(),
              timezone
            } satisfies JsonObject;
          } catch {
            return { error: `unsupported timezone: ${timezone}` };
          }
        },
        inputSchema: {
          additionalProperties: false,
          properties: {
            timezone: { type: "string" }
          },
          type: "object"
        },
        name: "now",
        risk: "read"
      },
      {
        description: "Returns the duration in milliseconds from `from` to `to` (negative if `to` precedes `from`).",
        execute: (args): JsonObject => {
          const from = readDate(args, "from");
          const to = readDate(args, "to");
          if (!from || !to) {
            return { error: "from/to must be valid ISO-8601 strings" };
          }
          return { milliseconds: to.getTime() - from.getTime() } satisfies JsonObject;
        },
        inputSchema: {
          additionalProperties: false,
          properties: {
            from: { type: "string" },
            to: { type: "string" }
          },
          required: ["from", "to"],
          type: "object"
        },
        name: "diff_ms",
        risk: "read"
      }
    ]
  };
}

function readOptionalString(args: JsonObject, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readDate(args: JsonObject, key: string): Date | undefined {
  const value = args[key];
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
