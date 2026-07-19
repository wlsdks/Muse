/**
 * Deterministic tool-argument coercion + required-argument validation — the
 * "repair" half of tool-calling for a small local model. Split out of index.ts.
 */

import { isJsonValue, isRecord, type JsonObject, type JsonValue } from "@muse/shared";

export interface ToolArgumentValidation {
  readonly ok: boolean;
  readonly missing: readonly string[];
}

export type ToolArgumentAliasRepair =
  | { readonly ok: true; readonly args: JsonObject }
  | {
      readonly ok: false;
      readonly alias: string;
      readonly canonical: string;
      readonly reason: string;
    };

/** Validate exact alias metadata before a tool can enter the production registry. */
export function validateToolArgumentAliasDefinition(
  inputSchema: JsonValue | undefined,
  aliases: Readonly<Record<string, string>> | undefined
): string | undefined {
  if (!aliases) return undefined;
  if (!isRecord(inputSchema) || inputSchema.type !== "object" || !isRecord(inputSchema.properties)) {
    return "argument aliases require an object input schema with properties";
  }
  const aliasNames = new Set(Object.keys(aliases));
  for (const [alias, canonical] of Object.entries(aliases)) {
    if (alias.trim().length === 0 || canonical.trim().length === 0
      || alias !== alias.trim() || canonical !== canonical.trim()) {
      return `unsafe argument alias '${alias}' -> '${canonical}': names must be nonempty and trimmed`;
    }
    if (!Object.hasOwn(inputSchema.properties, canonical)) {
      return `unsafe argument alias '${alias}' -> '${canonical}': canonical target is not a schema property`;
    }
    if (Object.hasOwn(inputSchema.properties, alias)) {
      return `unsafe argument alias '${alias}' -> '${canonical}': alias is already a canonical schema property`;
    }
    if (aliasNames.has(canonical)) {
      return `unsafe argument alias '${alias}' -> '${canonical}': alias chains and cycles are forbidden`;
    }
  }
  return undefined;
}

const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

function sameJsonBytes(left: JsonValue, right: JsonValue): boolean {
  return Object.is(left, right) || JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Apply only exact aliases explicitly declared by a tool. An alias value is
 * copied unchanged to the canonical key and the alias key is removed. No
 * lexical/fuzzy/tool-name inference is permitted. Supplying both names is safe
 * only when their JSON bytes are equal; disagreement is an ambiguity and fails
 * closed before any gate or effect observes it.
 */
export function canonicalizeToolArgumentAliases(
  aliases: Readonly<Record<string, string>> | undefined,
  args: JsonObject
): ToolArgumentAliasRepair {
  if (!aliases || Object.keys(aliases).length === 0) {
    return { args, ok: true };
  }

  let out: Record<string, JsonValue> | undefined;
  for (const [alias, canonical] of Object.entries(aliases)) {
    const current = out ?? args;
    if (alias === canonical || !hasOwn(current, alias)) continue;
    const aliasValue = current[alias]!;
    if (hasOwn(current, canonical) && !sameJsonBytes(current[canonical]!, aliasValue)) {
      return {
        alias,
        canonical,
        ok: false,
        reason: `conflicting values for alias '${alias}' and canonical argument '${canonical}'`
      };
    }

    out = { ...current };
    delete out[alias];
    if (!hasOwn(out, canonical)) {
      Object.defineProperty(out, canonical, {
        configurable: true,
        enumerable: true,
        value: aliasValue,
        writable: true
      });
    }
  }

  return { args: out ?? args, ok: true };
}

/**
 * Deterministic pre-execute check of a model's tool arguments against the
 * tool's input schema. Enforces ONLY the schema's `required` list — the
 * highest-value, lowest-false-reject rule: a missing required argument would
 * otherwise reach the tool's `execute()` as `undefined` and crash or
 * misbehave (a top small-model failure mode). Anything else (extra props,
 * loose types) passes; the runtime returns the missing list to the model so it
 * re-calls correctly. A schema that isn't an object schema with a `required`
 * array imposes no constraint.
 */
/**
 * Lossless, unambiguous scalar coercion of a model's tool arguments to the
 * types the schema declares — the deterministic "repair" half of tool-calling
 * (Structured Reflection, arXiv:2509.18847: a right value in the wrong JSON
 * type invalidates an otherwise-correct call). Only safe, reversible cases:
 *   - number/integer param + clean numeric string → number ("5" → 5)
 *   - boolean param + "true"/"false" string → boolean
 *   - string param + number/boolean value → its string form
 * Everything else (objects, arrays, non-numeric strings, partial parses) is
 * left untouched, so a genuine mismatch still surfaces rather than being
 * masked by a lossy guess.
 */
export function coerceToolArguments(inputSchema: JsonValue | undefined, args: JsonObject): JsonObject {
  if (!isRecord(inputSchema) || inputSchema.type !== "object" || !isRecord(inputSchema.properties)) {
    return args;
  }
  const properties = inputSchema.properties;
  const out: Record<string, JsonValue> = { ...args };
  for (const [key, value] of Object.entries(args)) {
    const propSchema = properties[key];
    const declared = isRecord(propSchema) && typeof propSchema.type === "string" ? propSchema.type : undefined;
    if (declared === undefined) continue;
    const coerced = declared === "object" || declared === "array"
      ? coerceStructured(value, declared)
      : coerceScalar(value, declared);
    if (coerced !== undefined) out[key] = coerced;
  }
  return out;
}

/**
 * Lossless structured-arg repair: a small local model sometimes emits an
 * object/array argument as a JSON STRING (`"[{...}]"` for an `array` param such
 * as file_multi_edit's `edits`) instead of the structured value, so the call
 * fails even though the data is correct. Parse it back to the declared shape
 * ONLY when the parse succeeds AND the result's type matches the schema
 * (array→array, object→object) — the structured counterpart of
 * {@link coerceScalar} (Structured Reflection, arXiv:2509.18847). The parsed
 * value is exactly what the model wrote (no data invented → fabrication=0).
 * Everything else (non-string value, parse failure, a type mismatch like a
 * stringified array for an `object` param) is left untouched so a genuine
 * mismatch still surfaces rather than being masked.
 */
function coerceStructured(value: JsonValue, declared: string): JsonValue | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  const matchesDeclaredShape = declared === "array" ? Array.isArray(parsed) : isRecord(parsed);
  return matchesDeclaredShape && isJsonValue(parsed) ? parsed : undefined;
}

function coerceScalar(value: JsonValue, declared: string): JsonValue | undefined {
  if ((declared === "number" || declared === "integer") && typeof value === "string") {
    const trimmed = value.trim();
    const pattern = declared === "integer" ? /^[+-]?\d+$/u : /^[+-]?\d+(\.\d+)?$/u;
    if (pattern.test(trimmed)) {
      const n = Number(trimmed);
      if (Number.isFinite(n)) return n;
    }
    return undefined;
  }
  if (declared === "boolean" && typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (lower === "true") return true;
    if (lower === "false") return false;
    return undefined;
  }
  if (declared === "string" && (typeof value === "number" || typeof value === "boolean")) {
    return String(value);
  }
  return undefined;
}

/**
 * Lossless, unambiguous case/whitespace repair of a model's CLOSED-VOCABULARY
 * (`enum`/`const`) scalar arguments — the enum counterpart of
 * {@link coerceToolArguments} (Structured Reflection, arXiv:2509.18847: a value
 * with the right MEANING but the wrong surface form invalidates an otherwise
 * correct call). A small local model routinely emits an enum value in the wrong
 * case or with stray whitespace (`"Turn_Off"` / `" octal "` for a schema that
 * declares `turn_off` / `octal`); strict-equality validation then rejects it,
 * burning a retry round or failing the call outright. This repairs ONLY the
 * provably-safe case: a STRING value that, after `trim()`, equals an allowed
 * STRING choice case-insensitively AND matches EXACTLY ONE such choice — it is
 * then rewritten to the schema's canonical spelling. Everything else is left
 * untouched so a genuine out-of-vocabulary value still surfaces to
 * {@link validateEnumArguments} rather than being masked by a lossy guess:
 *   - a value matching no allowed choice (even loosely) → unchanged
 *   - an AMBIGUOUS match (two choices differ only by case) → unchanged
 *   - a non-string value, or a non-string allowed choice → unchanged
 *   - an already-canonical value → unchanged (no-op, never reordered)
 */
export function coerceEnumArguments(inputSchema: JsonValue | undefined, args: JsonObject): JsonObject {
  if (!isRecord(inputSchema) || inputSchema.type !== "object" || !isRecord(inputSchema.properties)) {
    return args;
  }
  const properties = inputSchema.properties;
  const out: Record<string, JsonValue> = { ...args };
  for (const [key, value] of Object.entries(args)) {
    if (typeof value !== "string") continue;
    const prop = properties[key];
    if (!isRecord(prop)) continue;
    const allowed = Array.isArray(prop.enum)
      ? prop.enum
      : (prop.const !== undefined ? [prop.const] : undefined);
    if (allowed === undefined) continue;
    const stringChoices = allowed.filter((c): c is string => typeof c === "string");
    if (stringChoices.includes(value)) continue; // already canonical — never rewrite
    const folded = value.trim().toLowerCase();
    const matches = stringChoices.filter((c) => c.trim().toLowerCase() === folded);
    const [sole] = matches;
    if (matches.length === 1 && sole !== undefined) {
      out[key] = sole;
    }
  }
  return out;
}

export function validateRequiredToolArguments(inputSchema: JsonValue | undefined, args: JsonObject): ToolArgumentValidation {
  if (!isRecord(inputSchema) || inputSchema.type !== "object" || !Array.isArray(inputSchema.required)) {
    return { missing: [], ok: true };
  }
  const missing = inputSchema.required.filter(
    (name): name is string => typeof name === "string" && (args[name] === undefined || args[name] === null)
  );
  return { missing, ok: missing.length === 0 };
}
