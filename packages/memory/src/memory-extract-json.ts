/**
 * Extract the model's JSON extraction payload from a raw completion. Small local
 * models often wrap it in a code fence or echo the schema / an empty example
 * BEFORE the real payload — so this takes the LAST top-level balanced block that
 * parses, not the first. Split out of memory-auto-extract.ts.
 */

import type { ExtractionPayload } from "./memory-auto-extract.js";
import { isRecord } from "@muse/shared";

export function extractJsonObject(raw: string): ExtractionPayload | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  // Fast path: stripped code fence (the most common deviation).
  const stripped = trimmed.replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/iu, "");
  const direct = tryParseObject(stripped);
  if (direct) {
    return direct;
  }
  // Slow path: among ALL top-level balanced blocks, take the LAST
  // one that parses. Small local models often echo the schema /
  // an empty example BEFORE the real payload — taking the first
  // block silently discarded the actual extraction. The model's
  // final JSON is its answer.
  const blocks = findBalancedBraceBlocks(stripped);
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const parsed = tryParseObject(blocks[index] ?? "");
    if (parsed) {
      return parsed;
    }
  }
  return undefined;
}

function tryParseObject(input: string): ExtractionPayload | undefined {
  try {
    const parsed = JSON.parse(input);
    return parseExtractionPayload(parsed);
  } catch {
    return undefined;
  }
}

function parseExtractionPayload(value: unknown): ExtractionPayload | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const facts = parseStringRecord(value.facts);
  const preferences = parseStringRecord(value.preferences);
  const vetoes = parseExtractedSlotArray(value.vetoes);
  const goals = parseExtractedSlotArray(value.goals);

  return {
    ...(facts ? { facts } : {}),
    ...(preferences ? { preferences } : {}),
    ...(vetoes ? { vetoes } : {}),
    ...(goals ? { goals } : {})
  };
}

function parseStringRecord(value: unknown): Readonly<Record<string, string>> | undefined {
  if (!isRecord(value) || Array.isArray(value)) {
    return undefined;
  }

  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof key === "string" && typeof entry === "string") {
      out[key] = entry;
    }
  }

  return out;
}

function parseExtractedSlotArray(
  value: unknown
): readonly { readonly id: string; readonly value: string; readonly scope?: string }[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const out: { id: string; value: string; scope?: string }[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    const id = typeof entry.id === "string" ? entry.id : "";
    const slotValue = typeof entry.value === "string" ? entry.value : "";
    if (!id || !slotValue) {
      continue;
    }
    const scope = typeof entry.scope === "string" ? entry.scope : undefined;
    out.push(scope ? { id, scope, value: slotValue } : { id, value: slotValue });
  }
  return out;
}

function findBalancedBraceBlocks(input: string): readonly string[] {
  const blocks: string[] = [];
  let depth = 0;
  let blockStart = -1;
  let inString = false;
  let escape = false;
  for (let index = 0; index < input.length; index += 1) {
    const ch = input[index];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === "\"") {
      if (depth > 0) {
        inString = !inString;
      }
      continue;
    }
    if (inString) {
      continue;
    }
    if (ch === "{") {
      if (depth === 0) {
        blockStart = index;
      }
      depth += 1;
    } else if (ch === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && blockStart >= 0) {
        blocks.push(input.slice(blockStart, index + 1));
        blockStart = -1;
      }
    }
  }
  return blocks;
}
