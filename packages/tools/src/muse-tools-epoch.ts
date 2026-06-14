import type { JsonObject } from "@muse/shared";

import type { MuseTool } from "./index.js";

/**
 * `epoch_convert` — Unix timestamp ↔ calendar date, both directions. Developers
 * read epoch seconds/millis out of logs, DB rows, and API payloads, and the local
 * model fabricates the date for a given epoch (it is large-number date arithmetic,
 * the same class it fails at). A deterministic conversion is the grounded answer.
 */

// |epoch| >= 1e12 is milliseconds. Any seconds-epoch stays below this until the
// year 33658, and any millis-epoch is at/above it from 2001 on — so realistic
// timestamps are classified correctly. Both forms are returned regardless.
const MS_THRESHOLD = 1e12;

export interface EpochResult {
  readonly iso: string;
  readonly epochSeconds: number;
  readonly epochMillis: number;
}

export function epochToIso(epoch: number): (EpochResult & { unit: "seconds" | "milliseconds" }) | undefined {
  if (!Number.isFinite(epoch)) return undefined;
  const isMillis = Math.abs(epoch) >= MS_THRESHOLD;
  const millis = isMillis ? epoch : epoch * 1000;
  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) return undefined;
  return {
    epochMillis: millis,
    epochSeconds: Math.floor(millis / 1000),
    iso: date.toISOString(),
    unit: isMillis ? "milliseconds" : "seconds"
  };
}

export function isoToEpoch(date: string): EpochResult | undefined {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return {
    epochMillis: parsed.getTime(),
    epochSeconds: Math.floor(parsed.getTime() / 1000),
    iso: parsed.toISOString()
  };
}

export function createEpochConvertTool(): MuseTool {
  return {
    definition: {
      description:
        "Converts a Unix timestamp to a calendar date, or a date to a Unix timestamp — either direction, returning the ISO date plus both epochSeconds and epochMillis. A number (or numeric string) is read as an epoch (auto-detecting seconds vs milliseconds by magnitude, e.g. 1718000000 → '2024-06-10T06:13:20Z'); a date string is read as a date to convert to its epoch (e.g. '2026-06-14T12:00:00Z' → 1781438400). USE WHEN the user has a Unix/epoch timestamp to read as a date, or a date to turn into a timestamp ('what date is 1718000000?', 'unix timestamp for 2026-06-14?'). Do NOT use for the current time (use time_now), the duration between two times (use time_diff), or adding a duration (use time_add).",
      domain: "core",
      inputSchema: {
        additionalProperties: false,
        properties: {
          value: { description: "A Unix timestamp as a number/string (e.g. '1718000000') OR a date to convert (e.g. '2026-06-14T12:00:00Z').", type: "string" }
        },
        required: ["value"],
        type: "object"
      },
      keywords: ["epoch", "unix", "timestamp", "unix time", "epoch time", "유닉스", "타임스탬프", "epoch_convert"],
      name: "epoch_convert",
      risk: "read"
    },
    execute: (args): JsonObject => {
      const raw = args["value"];
      const text = typeof raw === "number" ? raw.toString() : typeof raw === "string" ? raw.trim() : "";
      if (text.length === 0) return { error: "epoch_convert needs a value (an epoch number or a date)" };
      // A bare integer → read as an epoch; anything else → parse as a date.
      if (/^-?\d+$/u.test(text)) {
        const result = epochToIso(Number(text));
        if (!result) return { error: `'${text}' is not a valid epoch timestamp` };
        return { epochMillis: result.epochMillis, epochSeconds: result.epochSeconds, iso: result.iso, unit: result.unit };
      }
      const result = isoToEpoch(text);
      if (!result) return { error: `'${text}' is not a valid date or epoch timestamp` };
      return { epochMillis: result.epochMillis, epochSeconds: result.epochSeconds, iso: result.iso };
    }
  };
}
