/**
 * Shared parsers used across the Muse ambient-tool builders. Kept
 * together so the per-domain extracts (`muse-tools-time.ts`,
 * future siblings for text/data) can import the same primitives
 * instead of re-implementing them.
 */

import type { JsonObject } from "@muse/shared";

export function readOptionalString(args: JsonObject, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function readRequiredDate(args: JsonObject, key: string): Date | undefined {
  const value = args[key];
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function readOptionalNumber(args: JsonObject, key: string): number {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
