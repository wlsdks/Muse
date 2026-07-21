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

export type OptionalNumericField =
  | { readonly kind: "absent" }
  | { readonly kind: "invalid" }
  | { readonly kind: "number"; readonly value: number };

/**
 * Distinguishes "field absent" (silently keep the default) from "field
 * present but not a usable number" (needs a caller-visible error) — the
 * numeric analogue of `readOptionalDate`. `readOptionalNumber` collapses
 * both to 0, which is right for an additive default but wrong when the
 * caller actually supplied a value: summing an unparseable offset as 0
 * returns the unchanged base in the exact success shape of a valid call.
 * A numeric string ("3") is accepted — the local model routinely quotes
 * numbers — but non-numeric text, `null`-adjacent, or non-finite values
 * are `invalid`, never silently coerced.
 */
export function readOptionalNumericField(args: JsonObject, key: string): OptionalNumericField {
  const value = args[key];
  if (value === undefined || value === null) {
    return { kind: "absent" };
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? { kind: "number", value } : { kind: "invalid" };
  }
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/u.test(value.trim())) {
    return { kind: "number", value: Number(value.trim()) };
  }
  return { kind: "invalid" };
}

export type OptionalDate =
  | { readonly kind: "absent" }
  | { readonly kind: "invalid" }
  | { readonly kind: "date"; readonly date: Date };

/**
 * Distinguishes "field absent" from "field present but unparseable"
 * for an optional ISO-8601 input. `readRequiredDate` collapses both
 * to `undefined`, so a tool that defaults a missing reference to
 * `now()` would silently anchor to the wrong instant when the caller
 * supplied a malformed (non-empty) value — a wrong answer with no
 * error. An empty string counts as absent (a model emitting `""`
 * for an unset optional means "not provided").
 */
export function readOptionalDate(args: JsonObject, key: string): OptionalDate {
  const value = args[key];
  if (value === undefined || value === null || (typeof value === "string" && value.length === 0)) {
    return { kind: "absent" };
  }
  if (typeof value !== "string") {
    return { kind: "invalid" };
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? { kind: "invalid" } : { kind: "date", date: parsed };
}
