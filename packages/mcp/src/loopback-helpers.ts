import type { JsonObject } from "@muse/shared";

/**
 * Shared shape-readers for loopback MCP tool implementations.
 *
 * Across rounds 82-118 each `loopback-*.ts` factory file inlined its
 * own copies of these helpers to keep per-iter splits self-contained.
 * Now that all 8 sibling files exist, the inlined copies have become
 * pure duplication — this module consolidates the 5 helpers that are
 * shared by 2 or more loopback factories. Module-specific helpers
 * (e.g. tasks' `readStatusFilter`, calendar's `parseIsoDate`) stay
 * private to their owners.
 */

export function readString(args: JsonObject, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}

export function readStringArray(args: JsonObject, key: string): readonly string[] | undefined {
  const value = args[key];
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

export function readBoolean(args: JsonObject, key: string): boolean | undefined {
  const value = args[key];
  return typeof value === "boolean" ? value : undefined;
}

export function readJsonObject(args: JsonObject, key: string): Record<string, unknown> | undefined {
  const value = args[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
