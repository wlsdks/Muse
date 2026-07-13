import { createHash } from "node:crypto";

export type ValidationErrorCode =
  | "INVALID_INPUT"
  | "INVALID_JSON"
  | "DUPLICATE_FIELD"
  | "REQUIRED_FIELD_MISSING"
  | "FIELD_TYPE_INVALID"
  | "UNEXPECTED_FIELD"
  | "VALUE_INVALID"
  | "HASH_FORMAT_INVALID"
  | "HASH_LIST_NOT_CANONICAL"
  | "HASH_MISMATCH"
  | "EVALUATOR_HASH_MISMATCH"
  | "BASELINE_HOLDOUT_CONTAMINATION"
  | "CANDIDATE_HOLDOUT_CONTAMINATION"
  | "PROVIDER_TUPLE_INVALID"
  | "PROVIDER_TUPLE_MISMATCH"
  | "EXPIRED"
  | "WRITE_TARGET_FORBIDDEN"
  | "PROMOTION_REQUEST_FORBIDDEN"
  | "ROLLBACK_POINTER_INVALID"
  | "ROLLBACK_HASH_MISMATCH"
  | "FIXTURE_HASH_MISMATCH";

export interface QuarantineValidationError {
  readonly code: ValidationErrorCode;
  readonly path: string;
}

export interface InvalidQuarantineResult {
  readonly schemaVersion: "muse.synthetic-quarantine-result.v1";
  readonly status: "INVALID";
  readonly promotionState: "PROMOTION_DISABLED";
  readonly errors: readonly QuarantineValidationError[];
}

export interface ScoredQuarantineResult {
  readonly schemaVersion: "muse.synthetic-quarantine-result.v1";
  readonly status: "QUARANTINED" | "SHADOW";
  readonly promotionState: "PROMOTION_DISABLED";
  readonly fixtureId: "SYNTHETIC_QUARANTINE_FIXTURE_V1";
  readonly fixtureHash: string;
  readonly scorecard: {
    readonly metricId: "synthetic-exact-match.v1";
    readonly caseCount: number;
    readonly baselineScore: number;
    readonly candidateScore: number;
    readonly delta: number;
  };
  readonly rollback: {
    readonly baselineId: string;
    readonly baselineArtifactHash: string;
  };
  readonly errors: readonly [];
}

export type QuarantineResult = InvalidQuarantineResult | ScoredQuarantineResult;

type JsonScalar = boolean | null | number | string;
type JsonValue = JsonRecord | JsonScalar | JsonValue[];
interface JsonRecord {
  [key: string]: JsonValue;
}

const MAX_RAW_UTF8_BYTES = 65_536;
const MAX_NESTING_DEPTH = 32;
const MAX_OBJECT_MEMBERS = 64;
const MAX_ARRAY_MEMBERS = 128;
const MAX_VALUE_NODES = 2_048;
const MAX_KEY_CODE_UNITS = 64;
const MAX_STRING_CODE_UNITS = 256;
const MAX_NUMBER_LEXEME_CODE_UNITS = 64;

const TRUSTED_FIXTURE_ID = "SYNTHETIC_QUARANTINE_FIXTURE_V1";
const TRUSTED_FIXTURE_HASH = "d8e652e1358054c79b004499e0020a35d5f065905cae7ec122caa48150f027d0";
const RESULT_SCHEMA_VERSION = "muse.synthetic-quarantine-result.v1" as const;
const SYNTHETIC_TOKEN_RE = /^SYNTHETIC_[A-Z0-9_]{1,64}$/u;
const HASH_RE = /^[0-9a-f]{64}$/u;
const FORBIDDEN_PAYLOAD_RE = /(?:https?:\/\/|www\.|[\\/~@]|API[_-]?KEY|SECRET|PASSWORD|CREDENTIAL|TOKEN|PRIVATE[_-]?KEY|KEY)/iu;

class InvalidJsonError extends Error {}

class ResourceLimitError extends Error {
  constructor(readonly path: string) {
    super("quarantine JSON resource limit exceeded");
  }
}

class HandwrittenJsonParser {
  readonly duplicatePaths: string[] = [];
  readonly text: string;
  index = 0;
  valueNodes = 0;

  constructor(text: string) {
    this.text = text;
  }

  parse(): JsonValue {
    this.skipWhitespace();
    const value = this.parseValue("", 0);
    this.skipWhitespace();
    if (this.index !== this.text.length) {
      throw new InvalidJsonError();
    }
    return value;
  }

  parseValue(path: string, parentDepth: number): JsonValue {
    this.valueNodes += 1;
    if (this.valueNodes > MAX_VALUE_NODES) {
      throw new ResourceLimitError(path);
    }

    const current = this.text[this.index];
    if (current === "{") {
      return this.parseObject(path, parentDepth + 1);
    }
    if (current === "[") {
      return this.parseArray(path, parentDepth + 1);
    }
    if (current === "\"") {
      return this.parseString(path, false);
    }
    if (current === "t") {
      this.consumeLiteral("true");
      return true;
    }
    if (current === "f") {
      this.consumeLiteral("false");
      return false;
    }
    if (current === "n") {
      this.consumeLiteral("null");
      return null;
    }
    if (current === "-" || this.isDigit(current)) {
      return this.parseNumber(path);
    }
    throw new InvalidJsonError();
  }

  parseObject(path: string, depth: number): JsonRecord {
    if (depth > MAX_NESTING_DEPTH) {
      throw new ResourceLimitError(path);
    }
    this.expect("{");
    const object = Object.create(null) as JsonRecord;
    const keys = new Map<string, true>();
    let members = 0;
    this.skipWhitespace();
    if (this.consumeIf("}")) {
      return object;
    }

    while (true) {
      if (members >= MAX_OBJECT_MEMBERS) {
        throw new ResourceLimitError(path);
      }
      if (this.text[this.index] !== "\"") {
        throw new InvalidJsonError();
      }
      const key = this.parseString(path, true);
      this.skipWhitespace();
      this.expect(":");
      this.skipWhitespace();
      const childPath = appendPointer(path, key);
      if (keys.has(key)) {
        this.duplicatePaths.push(childPath);
      }
      keys.set(key, true);
      object[key] = this.parseValue(childPath, depth);
      members += 1;
      this.skipWhitespace();
      if (this.consumeIf("}")) {
        return object;
      }
      this.expect(",");
      this.skipWhitespace();
    }
  }

  parseArray(path: string, depth: number): JsonValue[] {
    if (depth > MAX_NESTING_DEPTH) {
      throw new ResourceLimitError(path);
    }
    this.expect("[");
    const values: JsonValue[] = [];
    this.skipWhitespace();
    if (this.consumeIf("]")) {
      return values;
    }

    while (true) {
      if (values.length >= MAX_ARRAY_MEMBERS) {
        throw new ResourceLimitError(path);
      }
      values.push(this.parseValue(appendPointer(path, String(values.length)), depth));
      this.skipWhitespace();
      if (this.consumeIf("]")) {
        return values;
      }
      this.expect(",");
      this.skipWhitespace();
    }
  }

  parseString(path: string, key: boolean): string {
    this.expect("\"");
    let output = "";
    while (this.index < this.text.length) {
      const current = this.text[this.index]!;
      if (current === "\"") {
        this.index += 1;
        return output;
      }
      if (current === "\\") {
        this.index += 1;
        const escape = this.text[this.index];
        if (!escape) {
          throw new InvalidJsonError();
        }
        this.index += 1;
        if (escape === "\"" || escape === "\\" || escape === "/") {
          output = this.appendStringPart(output, escape, path, key);
          continue;
        }
        if (escape === "b") {
          output = this.appendStringPart(output, "\b", path, key);
          continue;
        }
        if (escape === "f") {
          output = this.appendStringPart(output, "\f", path, key);
          continue;
        }
        if (escape === "n") {
          output = this.appendStringPart(output, "\n", path, key);
          continue;
        }
        if (escape === "r") {
          output = this.appendStringPart(output, "\r", path, key);
          continue;
        }
        if (escape === "t") {
          output = this.appendStringPart(output, "\t", path, key);
          continue;
        }
        if (escape !== "u") {
          throw new InvalidJsonError();
        }
        const first = this.parseHexCodeUnit();
        if (isHighSurrogate(first)) {
          if (this.text[this.index] !== "\\" || this.text[this.index + 1] !== "u") {
            throw new InvalidJsonError();
          }
          this.index += 2;
          const second = this.parseHexCodeUnit();
          if (!isLowSurrogate(second)) {
            throw new InvalidJsonError();
          }
          output = this.appendStringPart(output, String.fromCharCode(first, second), path, key);
          continue;
        }
        if (isLowSurrogate(first)) {
          throw new InvalidJsonError();
        }
        output = this.appendStringPart(output, String.fromCharCode(first), path, key);
        continue;
      }

      const code = current.charCodeAt(0);
      if (code < 0x20) {
        throw new InvalidJsonError();
      }
      if (isHighSurrogate(code)) {
        const next = this.text[this.index + 1];
        if (!next || !isLowSurrogate(next.charCodeAt(0))) {
          throw new InvalidJsonError();
        }
        this.index += 2;
        output = this.appendStringPart(output, current + next, path, key);
        continue;
      }
      if (isLowSurrogate(code)) {
        throw new InvalidJsonError();
      }
      this.index += 1;
      output = this.appendStringPart(output, current, path, key);
    }
    throw new InvalidJsonError();
  }

  appendStringPart(current: string, part: string, path: string, key: boolean): string {
    const next = current + part;
    if (next.length > (key ? MAX_KEY_CODE_UNITS : MAX_STRING_CODE_UNITS)) {
      throw new ResourceLimitError(path);
    }
    return next;
  }

  parseHexCodeUnit(): number {
    const slice = this.text.slice(this.index, this.index + 4);
    if (!/^[0-9a-fA-F]{4}$/u.test(slice)) {
      throw new InvalidJsonError();
    }
    this.index += 4;
    return Number.parseInt(slice, 16);
  }

  parseNumber(path: string): number {
    const start = this.index;
    this.consumeIf("-");
    if (this.consumeIf("0")) {
      // JSON does not permit a leading zero followed by another digit.
    } else {
      if (!this.isDigitOneToNine(this.text[this.index])) {
        throw new InvalidJsonError();
      }
      this.index += 1;
      while (this.isDigit(this.text[this.index])) {
        this.index += 1;
      }
    }
    if (this.consumeIf(".")) {
      if (!this.isDigit(this.text[this.index])) {
        throw new InvalidJsonError();
      }
      while (this.isDigit(this.text[this.index])) {
        this.index += 1;
      }
    }
    const exponent = this.text[this.index];
    if (exponent === "e" || exponent === "E") {
      this.index += 1;
      const sign = this.text[this.index];
      if (sign === "+" || sign === "-") {
        this.index += 1;
      }
      if (!this.isDigit(this.text[this.index])) {
        throw new InvalidJsonError();
      }
      while (this.isDigit(this.text[this.index])) {
        this.index += 1;
      }
    }
    const lexeme = this.text.slice(start, this.index);
    if (lexeme.length > MAX_NUMBER_LEXEME_CODE_UNITS) {
      throw new ResourceLimitError(path);
    }
    return Number(lexeme);
  }

  consumeLiteral(literal: string): void {
    if (this.text.slice(this.index, this.index + literal.length) !== literal) {
      throw new InvalidJsonError();
    }
    this.index += literal.length;
  }

  skipWhitespace(): void {
    while (true) {
      const current = this.text[this.index];
      if (current !== " " && current !== "\n" && current !== "\r" && current !== "\t") {
        return;
      }
      this.index += 1;
    }
  }

  expect(expected: string): void {
    if (!this.consumeIf(expected)) {
      throw new InvalidJsonError();
    }
  }

  consumeIf(expected: string): boolean {
    if (this.text[this.index] !== expected) {
      return false;
    }
    this.index += 1;
    return true;
  }

  isDigit(value: string | undefined): boolean {
    return value !== undefined && value >= "0" && value <= "9";
  }

  isDigitOneToNine(value: string | undefined): boolean {
    return value !== undefined && value >= "1" && value <= "9";
  }
}

function isHighSurrogate(value: number): boolean {
  return value >= 0xd800 && value <= 0xdbff;
}

function isLowSurrogate(value: number): boolean {
  return value >= 0xdc00 && value <= 0xdfff;
}

function appendPointer(parent: string, segment: string): string {
  const escaped = segment.replace(/~/gu, "~0").replace(/\//gu, "~1");
  return `${parent}/${escaped}`;
}

function isJsonRecord(value: JsonValue | undefined): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(record: JsonRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function makeRecord(entries: readonly (readonly [string, JsonValue])[]): JsonRecord {
  const record = Object.create(null) as JsonRecord;
  for (const [key, value] of entries) {
    record[key] = value;
  }
  return record;
}

function withoutKey(record: JsonRecord, keyToOmit: string): JsonRecord {
  const copy = Object.create(null) as JsonRecord;
  for (const key of Object.keys(record)) {
    if (key !== keyToOmit) {
      copy[key] = record[key]!;
    }
  }
  return copy;
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (isHighSurrogate(code)) {
      const next = value.charCodeAt(index + 1);
      if (!isLowSurrogate(next)) {
        return true;
      }
      index += 1;
      continue;
    }
    if (isLowSurrogate(code)) {
      return true;
    }
  }
  return false;
}

function canonicalize(value: JsonValue): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "string") {
    if (hasUnpairedSurrogate(value)) {
      throw new TypeError("unpaired surrogate");
    }
    const encoded = JSON.stringify(value);
    if (encoded === undefined) {
      throw new TypeError("invalid string");
    }
    return encoded;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0) || !Number.isSafeInteger(value) && Number.isInteger(value)) {
      throw new TypeError("invalid canonical number");
    }
    const encoded = JSON.stringify(value);
    if (encoded === undefined) {
      throw new TypeError("invalid number");
    }
    return encoded;
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  if (!isJsonRecord(value)) {
    throw new TypeError("invalid JSON value");
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${canonicalize(key)}:${canonicalize(value[key]!)}`).join(",")}}`;
}

function hashCanonical(value: JsonValue): string {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex");
}

function error(code: ValidationErrorCode, path: string): QuarantineValidationError {
  return { code, path };
}

function byPath(left: QuarantineValidationError, right: QuarantineValidationError): number {
  if (left.path < right.path) {
    return -1;
  }
  if (left.path > right.path) {
    return 1;
  }
  if (left.code < right.code) {
    return -1;
  }
  if (left.code > right.code) {
    return 1;
  }
  return 0;
}

function invalid(errors: readonly QuarantineValidationError[]): InvalidQuarantineResult {
  return {
    schemaVersion: RESULT_SCHEMA_VERSION,
    status: "INVALID",
    promotionState: "PROMOTION_DISABLED",
    errors
  };
}

function strictTimestampMilliseconds(value: string): number | undefined {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})\.([0-9]{3})Z$/u.exec(value);
  if (!match) {
    return undefined;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millisecond = Number(match[7]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    return undefined;
  }
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const limit = daysInMonth[month - 1];
  if (limit === undefined || day < 1 || day > limit) {
    return undefined;
  }
  let priorDays = 0;
  for (let currentMonth = 1; currentMonth < month; currentMonth += 1) {
    priorDays += daysInMonth[currentMonth - 1]!;
  }
  const completedYears = year - 1;
  const leapYears = Math.floor(completedYears / 4) - Math.floor(completedYears / 100) + Math.floor(completedYears / 400);
  const calendarDays = completedYears * 365 + leapYears + priorDays + day - 1;
  return (((calendarDays * 24 + hour) * 60 + minute) * 60 + second) * 1_000 + millisecond;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function validateExactObject(
  record: JsonRecord,
  path: string,
  keys: readonly string[],
  errors: QuarantineValidationError[]
): void {
  const expected = new Set(keys);
  for (const key of keys) {
    if (!hasOwn(record, key)) {
      errors.push(error("REQUIRED_FIELD_MISSING", appendPointer(path, key)));
    }
  }
  for (const key of Object.keys(record)) {
    if (!expected.has(key)) {
      errors.push(error("UNEXPECTED_FIELD", appendPointer(path, key)));
    }
  }
}

function readString(record: JsonRecord, key: string, path: string, errors: QuarantineValidationError[]): string | undefined {
  if (!hasOwn(record, key)) {
    return undefined;
  }
  const value = record[key];
  if (typeof value !== "string") {
    errors.push(error("FIELD_TYPE_INVALID", appendPointer(path, key)));
    return undefined;
  }
  return value;
}

function readBoolean(record: JsonRecord, key: string, path: string, errors: QuarantineValidationError[]): boolean | undefined {
  if (!hasOwn(record, key)) {
    return undefined;
  }
  const value = record[key];
  if (typeof value !== "boolean") {
    errors.push(error("FIELD_TYPE_INVALID", appendPointer(path, key)));
    return undefined;
  }
  return value;
}

function readNumber(record: JsonRecord, key: string, path: string, errors: QuarantineValidationError[]): number | undefined {
  if (!hasOwn(record, key)) {
    return undefined;
  }
  const value = record[key];
  if (typeof value !== "number") {
    errors.push(error("FIELD_TYPE_INVALID", appendPointer(path, key)));
    return undefined;
  }
  return value;
}

function readRecord(record: JsonRecord, key: string, path: string, errors: QuarantineValidationError[]): JsonRecord | undefined {
  if (!hasOwn(record, key)) {
    return undefined;
  }
  const value = record[key];
  if (!isJsonRecord(value)) {
    errors.push(error("FIELD_TYPE_INVALID", appendPointer(path, key)));
    return undefined;
  }
  return value;
}

function readArray(record: JsonRecord, key: string, path: string, errors: QuarantineValidationError[]): JsonValue[] | undefined {
  if (!hasOwn(record, key)) {
    return undefined;
  }
  const value = record[key];
  if (!Array.isArray(value)) {
    errors.push(error("FIELD_TYPE_INVALID", appendPointer(path, key)));
    return undefined;
  }
  return value;
}

function validateStringArray(values: JsonValue[] | undefined, path: string, errors: QuarantineValidationError[]): void {
  if (!values) {
    return;
  }
  for (let index = 0; index < values.length; index += 1) {
    if (typeof values[index] !== "string") {
      errors.push(error("FIELD_TYPE_INVALID", appendPointer(path, String(index))));
    }
  }
}

function validateSource(record: JsonRecord, path: string, errors: QuarantineValidationError[]): void {
  validateExactObject(record, path, ["id", "text", "hash"], errors);
  readString(record, "id", path, errors);
  readString(record, "text", path, errors);
  readString(record, "hash", path, errors);
}

function validateOutput(record: JsonRecord, path: string, errors: QuarantineValidationError[]): void {
  validateExactObject(record, path, ["caseId", "output"], errors);
  readString(record, "caseId", path, errors);
  readString(record, "output", path, errors);
}

function validateProvider(record: JsonRecord, path: string, errors: QuarantineValidationError[]): void {
  validateExactObject(record, path, ["providerId", "modelId", "adapterId", "decoding"], errors);
  readString(record, "providerId", path, errors);
  readString(record, "modelId", path, errors);
  readString(record, "adapterId", path, errors);
  const decoding = readRecord(record, "decoding", path, errors);
  if (!decoding) {
    return;
  }
  const decodingPath = appendPointer(path, "decoding");
  validateExactObject(decoding, decodingPath, ["temperature", "topP", "seed", "maxOutputTokens"], errors);
  readNumber(decoding, "temperature", decodingPath, errors);
  readNumber(decoding, "topP", decodingPath, errors);
  readNumber(decoding, "seed", decodingPath, errors);
  readNumber(decoding, "maxOutputTokens", decodingPath, errors);
}

function validateArtifact(record: JsonRecord, path: string, candidate: boolean, errors: QuarantineValidationError[]): void {
  const keys = candidate
    ? ["id", "sources", "sourceHashes", "outputs", "provider", "artifactHash", "writeTargets", "promotionRequested"]
    : ["id", "sources", "sourceHashes", "outputs", "provider", "artifactHash"];
  validateExactObject(record, path, keys, errors);
  readString(record, "id", path, errors);
  const sources = readArray(record, "sources", path, errors);
  validateStringArray(readArray(record, "sourceHashes", path, errors), appendPointer(path, "sourceHashes"), errors);
  const outputs = readArray(record, "outputs", path, errors);
  const provider = readRecord(record, "provider", path, errors);
  readString(record, "artifactHash", path, errors);
  if (sources) {
    for (let index = 0; index < sources.length; index += 1) {
      const item = sources[index];
      const itemPath = appendPointer(appendPointer(path, "sources"), String(index));
      if (!isJsonRecord(item)) {
        errors.push(error("FIELD_TYPE_INVALID", itemPath));
        continue;
      }
      validateSource(item, itemPath, errors);
    }
  }
  if (outputs) {
    for (let index = 0; index < outputs.length; index += 1) {
      const item = outputs[index];
      const itemPath = appendPointer(appendPointer(path, "outputs"), String(index));
      if (!isJsonRecord(item)) {
        errors.push(error("FIELD_TYPE_INVALID", itemPath));
        continue;
      }
      validateOutput(item, itemPath, errors);
    }
  }
  if (provider) {
    validateProvider(provider, appendPointer(path, "provider"), errors);
  }
  if (candidate) {
    validateStringArray(readArray(record, "writeTargets", path, errors), appendPointer(path, "writeTargets"), errors);
    readBoolean(record, "promotionRequested", path, errors);
  }
}

function validateHoldoutCase(record: JsonRecord, path: string, errors: QuarantineValidationError[]): void {
  validateExactObject(record, path, ["id", "prompt", "expected", "hash"], errors);
  readString(record, "id", path, errors);
  readString(record, "prompt", path, errors);
  readString(record, "expected", path, errors);
  readString(record, "hash", path, errors);
}

function schemaErrors(root: JsonRecord): QuarantineValidationError[] {
  const errors: QuarantineValidationError[] = [];
  validateExactObject(
    root,
    "",
    [
      "schemaVersion",
      "fixtureId",
      "fixtureHash",
      "dataClassification",
      "consentBasis",
      "taskClass",
      "expiresAt",
      "evaluator",
      "baseline",
      "candidate",
      "holdout",
      "rollbackPointer"
    ],
    errors
  );
  readString(root, "schemaVersion", "", errors);
  readString(root, "fixtureId", "", errors);
  readString(root, "fixtureHash", "", errors);
  readString(root, "dataClassification", "", errors);
  readString(root, "consentBasis", "", errors);
  readString(root, "taskClass", "", errors);
  readString(root, "expiresAt", "", errors);

  const evaluator = readRecord(root, "evaluator", "", errors);
  if (evaluator) {
    const evaluatorPath = "/evaluator";
    validateExactObject(evaluator, evaluatorPath, ["id", "descriptorHash"], errors);
    readString(evaluator, "id", evaluatorPath, errors);
    readString(evaluator, "descriptorHash", evaluatorPath, errors);
  }
  const baseline = readRecord(root, "baseline", "", errors);
  if (baseline) {
    validateArtifact(baseline, "/baseline", false, errors);
  }
  const candidate = readRecord(root, "candidate", "", errors);
  if (candidate) {
    validateArtifact(candidate, "/candidate", true, errors);
  }
  const holdout = readRecord(root, "holdout", "", errors);
  if (holdout) {
    const holdoutPath = "/holdout";
    validateExactObject(holdout, holdoutPath, ["cases", "hashes"], errors);
    const cases = readArray(holdout, "cases", holdoutPath, errors);
    validateStringArray(readArray(holdout, "hashes", holdoutPath, errors), "/holdout/hashes", errors);
    if (cases) {
      for (let index = 0; index < cases.length; index += 1) {
        const item = cases[index];
        const itemPath = `/holdout/cases/${index}`;
        if (!isJsonRecord(item)) {
          errors.push(error("FIELD_TYPE_INVALID", itemPath));
          continue;
        }
        validateHoldoutCase(item, itemPath, errors);
      }
    }
  }
  const rollback = readRecord(root, "rollbackPointer", "", errors);
  if (rollback) {
    const rollbackPath = "/rollbackPointer";
    validateExactObject(rollback, rollbackPath, ["baselineId", "baselineArtifactHash"], errors);
    readString(rollback, "baselineId", rollbackPath, errors);
    readString(rollback, "baselineArtifactHash", rollbackPath, errors);
  }
  return errors.sort(byPath);
}

function stringAt(record: JsonRecord, key: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new TypeError("schema invariant failed");
  }
  return value;
}

function booleanAt(record: JsonRecord, key: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new TypeError("schema invariant failed");
  }
  return value;
}

function numberAt(record: JsonRecord, key: string): number {
  const value = record[key];
  if (typeof value !== "number") {
    throw new TypeError("schema invariant failed");
  }
  return value;
}

function recordAt(record: JsonRecord, key: string): JsonRecord {
  const value = record[key];
  if (!isJsonRecord(value)) {
    throw new TypeError("schema invariant failed");
  }
  return value;
}

function arrayAt(record: JsonRecord, key: string): JsonValue[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new TypeError("schema invariant failed");
  }
  return value;
}

function recordsAt(record: JsonRecord, key: string): JsonRecord[] {
  return arrayAt(record, key).map((value) => {
    if (!isJsonRecord(value)) {
      throw new TypeError("schema invariant failed");
    }
    return value;
  });
}

function stringsAt(record: JsonRecord, key: string): string[] {
  return arrayAt(record, key).map((value) => {
    if (typeof value !== "string") {
      throw new TypeError("schema invariant failed");
    }
    return value;
  });
}

function sortedSubphase(errors: QuarantineValidationError[]): QuarantineValidationError[] {
  return errors.sort(byPath);
}

function syntheticPayloadError(value: string): boolean {
  return !SYNTHETIC_TOKEN_RE.test(value) || FORBIDDEN_PAYLOAD_RE.test(value);
}

function firstOrderingError(values: readonly string[]): number | undefined {
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1]!;
    const current = values[index]!;
    if (current <= previous) {
      return index;
    }
  }
  return undefined;
}

function collectArtifactGrammarErrors(artifact: JsonRecord, path: string): QuarantineValidationError[] {
  const errors: QuarantineValidationError[] = [];
  if (syntheticPayloadError(stringAt(artifact, "id"))) {
    errors.push(error("VALUE_INVALID", `${path}/id`));
  }
  const sources = recordsAt(artifact, "sources");
  if (sources.length === 0) {
    errors.push(error("VALUE_INVALID", `${path}/sources`));
  }
  const sourceIds: string[] = [];
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index]!;
    const sourcePath = `${path}/sources/${index}`;
    const id = stringAt(source, "id");
    sourceIds.push(id);
    if (syntheticPayloadError(id)) {
      errors.push(error("VALUE_INVALID", `${sourcePath}/id`));
    }
    if (syntheticPayloadError(stringAt(source, "text"))) {
      errors.push(error("VALUE_INVALID", `${sourcePath}/text`));
    }
  }
  const sourceOrder = firstOrderingError(sourceIds);
  if (sourceOrder !== undefined) {
    errors.push(error("VALUE_INVALID", `${path}/sources/${sourceOrder}/id`));
  }

  const outputs = recordsAt(artifact, "outputs");
  if (outputs.length === 0) {
    errors.push(error("VALUE_INVALID", `${path}/outputs`));
  }
  const outputIds: string[] = [];
  for (let index = 0; index < outputs.length; index += 1) {
    const output = outputs[index]!;
    const outputPath = `${path}/outputs/${index}`;
    const caseId = stringAt(output, "caseId");
    outputIds.push(caseId);
    if (syntheticPayloadError(caseId)) {
      errors.push(error("VALUE_INVALID", `${outputPath}/caseId`));
    }
    if (syntheticPayloadError(stringAt(output, "output"))) {
      errors.push(error("VALUE_INVALID", `${outputPath}/output`));
    }
  }
  const outputOrder = firstOrderingError(outputIds);
  if (outputOrder !== undefined) {
    errors.push(error("VALUE_INVALID", `${path}/outputs/${outputOrder}/caseId`));
  }
  return errors;
}

function collectPhaseOneErrors(manifest: JsonRecord): QuarantineValidationError[] {
  const errors: QuarantineValidationError[] = [];
  const exactValues: readonly (readonly [string, string])[] = [
    ["/schemaVersion", "muse.synthetic-quarantine.v1"],
    ["/fixtureId", TRUSTED_FIXTURE_ID],
    ["/dataClassification", "synthetic"],
    ["/consentBasis", "synthetic-no-consent-required"],
    ["/taskClass", "synthetic-non-coding-work.v1"]
  ];
  for (const [path, expected] of exactValues) {
    const key = path.slice(1);
    if (stringAt(manifest, key) !== expected) {
      errors.push(error("VALUE_INVALID", path));
    }
  }
  const evaluator = recordAt(manifest, "evaluator");
  if (stringAt(evaluator, "id") !== "SYNTHETIC_EXACT_MATCH_V1") {
    errors.push(error("VALUE_INVALID", "/evaluator/id"));
  }
  errors.push(...collectArtifactGrammarErrors(recordAt(manifest, "baseline"), "/baseline"));
  errors.push(...collectArtifactGrammarErrors(recordAt(manifest, "candidate"), "/candidate"));

  const holdout = recordAt(manifest, "holdout");
  const cases = recordsAt(holdout, "cases");
  if (cases.length === 0) {
    errors.push(error("VALUE_INVALID", "/holdout/cases"));
  }
  const caseIds: string[] = [];
  for (let index = 0; index < cases.length; index += 1) {
    const item = cases[index]!;
    const itemPath = `/holdout/cases/${index}`;
    const id = stringAt(item, "id");
    caseIds.push(id);
    if (syntheticPayloadError(id)) {
      errors.push(error("VALUE_INVALID", `${itemPath}/id`));
    }
    if (syntheticPayloadError(stringAt(item, "prompt"))) {
      errors.push(error("VALUE_INVALID", `${itemPath}/prompt`));
    }
    if (syntheticPayloadError(stringAt(item, "expected"))) {
      errors.push(error("VALUE_INVALID", `${itemPath}/expected`));
    }
  }
  const caseOrder = firstOrderingError(caseIds);
  if (caseOrder !== undefined) {
    errors.push(error("VALUE_INVALID", `/holdout/cases/${caseOrder}/id`));
  }
  return sortedSubphase(errors);
}

function isHash(value: string): boolean {
  return HASH_RE.test(value);
}

function sourceDigest(source: JsonRecord): string {
  return hashCanonical(makeRecord([["id", stringAt(source, "id")], ["text", stringAt(source, "text")]]));
}

function caseDigest(item: JsonRecord): string {
  return hashCanonical(
    makeRecord([
      ["id", stringAt(item, "id")],
      ["prompt", stringAt(item, "prompt")],
      ["expected", stringAt(item, "expected")]
    ])
  );
}

function artifactDigest(artifact: JsonRecord): string {
  return hashCanonical(withoutKey(artifact, "artifactHash"));
}

function evaluatorDigest(): string {
  return hashCanonical(
    makeRecord([
      ["id", "SYNTHETIC_EXACT_MATCH_V1"],
      ["metricId", "synthetic-exact-match.v1"],
      ["comparator", "decoded-string-exact"]
    ])
  );
}

function listIsCanonical(values: readonly string[]): boolean {
  if (values.length === 0) {
    return false;
  }
  return firstOrderingError(values) === undefined;
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const orderedLeft = [...left].sort();
  const orderedRight = [...right].sort();
  return orderedLeft.every((value, index) => value === orderedRight[index]);
}

function collectHashListErrors(
  values: readonly string[],
  path: string,
  derived: readonly string[],
  errors: QuarantineValidationError[]
): void {
  let syntaxClean = true;
  for (let index = 0; index < values.length; index += 1) {
    if (!isHash(values[index]!)) {
      errors.push(error("HASH_FORMAT_INVALID", `${path}/${index}`));
      syntaxClean = false;
    }
  }
  if (!syntaxClean) {
    return;
  }
  if (!listIsCanonical(values) || !sameStringSet(values, derived)) {
    errors.push(error("HASH_LIST_NOT_CANONICAL", path));
  }
}

function collectPhaseTwoErrors(manifest: JsonRecord): QuarantineValidationError[] {
  const errors: QuarantineValidationError[] = [];
  const baseline = recordAt(manifest, "baseline");
  const candidate = recordAt(manifest, "candidate");
  const holdout = recordAt(manifest, "holdout");
  const evaluator = recordAt(manifest, "evaluator");
  const rollback = recordAt(manifest, "rollbackPointer");

  const simpleHashes: readonly (readonly [string, string])[] = [
    ["/fixtureHash", stringAt(manifest, "fixtureHash")],
    ["/baseline/artifactHash", stringAt(baseline, "artifactHash")],
    ["/candidate/artifactHash", stringAt(candidate, "artifactHash")],
    ["/evaluator/descriptorHash", stringAt(evaluator, "descriptorHash")],
    ["/rollbackPointer/baselineArtifactHash", stringAt(rollback, "baselineArtifactHash")]
  ];
  for (const [path, value] of simpleHashes) {
    if (!isHash(value)) {
      errors.push(error("HASH_FORMAT_INVALID", path));
    }
  }
  for (const [artifact, path] of [[baseline, "/baseline"], [candidate, "/candidate"]] as const) {
    const sources = recordsAt(artifact, "sources");
    for (let index = 0; index < sources.length; index += 1) {
      if (!isHash(stringAt(sources[index]!, "hash"))) {
        errors.push(error("HASH_FORMAT_INVALID", `${path}/sources/${index}/hash`));
      }
    }
    collectHashListErrors(stringsAt(artifact, "sourceHashes"), `${path}/sourceHashes`, sources.map(sourceDigest).sort(), errors);
  }
  const cases = recordsAt(holdout, "cases");
  for (let index = 0; index < cases.length; index += 1) {
    if (!isHash(stringAt(cases[index]!, "hash"))) {
      errors.push(error("HASH_FORMAT_INVALID", `/holdout/cases/${index}/hash`));
    }
  }
  collectHashListErrors(stringsAt(holdout, "hashes"), "/holdout/hashes", cases.map(caseDigest).sort(), errors);
  return sortedSubphase(errors);
}

function collectPhaseThreeErrors(manifest: JsonRecord): QuarantineValidationError[] {
  const errors: QuarantineValidationError[] = [];
  const baseline = recordAt(manifest, "baseline");
  const candidate = recordAt(manifest, "candidate");
  const holdout = recordAt(manifest, "holdout");
  for (const [artifact, path] of [[baseline, "/baseline"], [candidate, "/candidate"]] as const) {
    const sources = recordsAt(artifact, "sources");
    for (let index = 0; index < sources.length; index += 1) {
      const source = sources[index]!;
      if (stringAt(source, "hash") !== sourceDigest(source)) {
        errors.push(error("HASH_MISMATCH", `${path}/sources/${index}/hash`));
      }
    }
    if (stringAt(artifact, "artifactHash") !== artifactDigest(artifact)) {
      errors.push(error("HASH_MISMATCH", `${path}/artifactHash`));
    }
  }
  const cases = recordsAt(holdout, "cases");
  for (let index = 0; index < cases.length; index += 1) {
    const item = cases[index]!;
    if (stringAt(item, "hash") !== caseDigest(item)) {
      errors.push(error("HASH_MISMATCH", `/holdout/cases/${index}/hash`));
    }
  }
  if (stringAt(recordAt(manifest, "evaluator"), "descriptorHash") !== evaluatorDigest()) {
    errors.push(error("EVALUATOR_HASH_MISMATCH", "/evaluator/descriptorHash"));
  }
  return sortedSubphase(errors);
}

function outputIds(artifact: JsonRecord): string[] {
  return recordsAt(artifact, "outputs").map((item) => stringAt(item, "caseId"));
}

function collectPhaseFourErrors(manifest: JsonRecord): QuarantineValidationError[] {
  const errors: QuarantineValidationError[] = [];
  const expected = recordsAt(recordAt(manifest, "holdout"), "cases").map((item) => stringAt(item, "id"));
  for (const [artifact, path] of [[recordAt(manifest, "baseline"), "/baseline"], [recordAt(manifest, "candidate"), "/candidate"]] as const) {
    if (!sameStringSet(outputIds(artifact), expected)) {
      errors.push(error("VALUE_INVALID", `${path}/outputs`));
    }
  }
  return sortedSubphase(errors);
}

function providerIsFixed(provider: JsonRecord, path: string, errors: QuarantineValidationError[]): boolean {
  let fixed = true;
  const expectedStrings: readonly (readonly [string, string])[] = [
    ["providerId", "SYNTHETIC_PROVIDER_V1"],
    ["modelId", "SYNTHETIC_MODEL_V1"],
    ["adapterId", "SYNTHETIC_ADAPTER_V1"]
  ];
  for (const [key, expected] of expectedStrings) {
    if (stringAt(provider, key) !== expected) {
      errors.push(error("PROVIDER_TUPLE_INVALID", `${path}/${key}`));
      fixed = false;
    }
  }
  const decoding = recordAt(provider, "decoding");
  const expectedNumbers: readonly (readonly [string, number, (value: number) => boolean])[] = [
    ["temperature", 0, (value) => Number.isFinite(value) && !Object.is(value, -0) && value >= 0 && value <= 2],
    ["topP", 1, (value) => Number.isFinite(value) && !Object.is(value, -0) && value > 0 && value <= 1],
    ["seed", 0, (value) => Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 0 && value <= 2 ** 31 - 1],
    ["maxOutputTokens", 64, (value) => Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 1 && value <= 1_024]
  ];
  for (const [key, expected, inRange] of expectedNumbers) {
    const value = numberAt(decoding, key);
    if (!inRange(value) || value !== expected) {
      errors.push(error("PROVIDER_TUPLE_INVALID", `${path}/decoding/${key}`));
      fixed = false;
    }
  }
  return fixed;
}

function sameProvider(left: JsonRecord, right: JsonRecord): boolean {
  return canonicalize(left) === canonicalize(right);
}

function providerRangesAreWellFormed(provider: JsonRecord): boolean {
  const decoding = recordAt(provider, "decoding");
  const temperature = numberAt(decoding, "temperature");
  const topP = numberAt(decoding, "topP");
  const seed = numberAt(decoding, "seed");
  const maxOutputTokens = numberAt(decoding, "maxOutputTokens");
  return (
    Number.isFinite(temperature) &&
    !Object.is(temperature, -0) &&
    temperature >= 0 &&
    temperature <= 2 &&
    Number.isFinite(topP) &&
    !Object.is(topP, -0) &&
    topP > 0 &&
    topP <= 1 &&
    Number.isSafeInteger(seed) &&
    !Object.is(seed, -0) &&
    seed >= 0 &&
    seed <= 2 ** 31 - 1 &&
    Number.isSafeInteger(maxOutputTokens) &&
    !Object.is(maxOutputTokens, -0) &&
    maxOutputTokens >= 1 &&
    maxOutputTokens <= 1_024
  );
}

function collectPhaseFiveErrors(manifest: JsonRecord): QuarantineValidationError[] {
  const errors: QuarantineValidationError[] = [];
  const baselineProvider = recordAt(recordAt(manifest, "baseline"), "provider");
  const candidateProvider = recordAt(recordAt(manifest, "candidate"), "provider");
  providerIsFixed(baselineProvider, "/baseline/provider", errors);
  providerIsFixed(candidateProvider, "/candidate/provider", errors);
  if (providerRangesAreWellFormed(baselineProvider) && providerRangesAreWellFormed(candidateProvider) && !sameProvider(baselineProvider, candidateProvider)) {
    errors.push(error("PROVIDER_TUPLE_MISMATCH", "/candidate/provider"));
  }
  return sortedSubphase(errors);
}

function collectPhaseSixErrors(manifest: JsonRecord, frozenMilliseconds: number): QuarantineValidationError[] {
  const expiresAt = stringAt(manifest, "expiresAt");
  const expiresAtMilliseconds = strictTimestampMilliseconds(expiresAt);
  if (expiresAtMilliseconds === undefined) {
    return [error("VALUE_INVALID", "/expiresAt")];
  }
  if (frozenMilliseconds >= expiresAtMilliseconds) {
    return [error("EXPIRED", "/expiresAt")];
  }
  return [];
}

function collectPhaseSevenErrors(manifest: JsonRecord): QuarantineValidationError[] {
  const errors: QuarantineValidationError[] = [];
  const holdoutHashes = new Set(stringsAt(recordAt(manifest, "holdout"), "hashes"));
  for (const [artifact, path, code] of [
    [recordAt(manifest, "baseline"), "/baseline", "BASELINE_HOLDOUT_CONTAMINATION"],
    [recordAt(manifest, "candidate"), "/candidate", "CANDIDATE_HOLDOUT_CONTAMINATION"]
  ] as const) {
    const sourceHashes = stringsAt(artifact, "sourceHashes");
    const index = sourceHashes.findIndex((value) => holdoutHashes.has(value));
    if (index >= 0) {
      errors.push(error(code, `${path}/sourceHashes/${index}`));
    }
  }
  return sortedSubphase(errors);
}

function collectPhaseEightErrors(manifest: JsonRecord): QuarantineValidationError[] {
  const errors: QuarantineValidationError[] = [];
  const candidate = recordAt(manifest, "candidate");
  const writeTargets = stringsAt(candidate, "writeTargets");
  if (writeTargets.length > 0) {
    errors.push(error("WRITE_TARGET_FORBIDDEN", "/candidate/writeTargets/0"));
  }
  if (booleanAt(candidate, "promotionRequested")) {
    errors.push(error("PROMOTION_REQUEST_FORBIDDEN", "/candidate/promotionRequested"));
  }
  return sortedSubphase(errors);
}

function collectPhaseNineErrors(manifest: JsonRecord): QuarantineValidationError[] {
  const errors: QuarantineValidationError[] = [];
  const baseline = recordAt(manifest, "baseline");
  const rollback = recordAt(manifest, "rollbackPointer");
  if (stringAt(rollback, "baselineId") !== stringAt(baseline, "id")) {
    errors.push(error("ROLLBACK_POINTER_INVALID", "/rollbackPointer/baselineId"));
  }
  if (stringAt(rollback, "baselineArtifactHash") !== stringAt(baseline, "artifactHash")) {
    errors.push(error("ROLLBACK_HASH_MISMATCH", "/rollbackPointer/baselineArtifactHash"));
  }
  return sortedSubphase(errors);
}

function rootAnchorError(manifest: JsonRecord): QuarantineValidationError | undefined {
  try {
    const computed = hashCanonical(withoutKey(manifest, "fixtureHash"));
    if (
      stringAt(manifest, "fixtureId") !== TRUSTED_FIXTURE_ID ||
      stringAt(manifest, "fixtureHash") !== TRUSTED_FIXTURE_HASH ||
      computed !== stringAt(manifest, "fixtureHash")
    ) {
      return error("FIXTURE_HASH_MISMATCH", "");
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function score(artifact: JsonRecord, cases: readonly JsonRecord[]): number {
  const outputs = new Map(recordsAt(artifact, "outputs").map((item) => [stringAt(item, "caseId"), stringAt(item, "output")]));
  const matches = cases.filter((item) => outputs.get(stringAt(item, "id")) === stringAt(item, "expected")).length;
  return matches / cases.length;
}

/**
 * Evaluates only a frozen, checked-in synthetic manifest. It neither persists
 * results nor exposes a promotion, approval, restore, model, or network path.
 */
export function evaluateSyntheticQuarantineJson(rawJson: unknown, frozenAsOf: unknown): QuarantineResult {
  if (typeof rawJson !== "string" || typeof frozenAsOf !== "string") {
    return invalid([error("INVALID_INPUT", "")]);
  }
  if (Buffer.byteLength(rawJson, "utf8") > MAX_RAW_UTF8_BYTES || strictTimestampMilliseconds(frozenAsOf) === undefined) {
    return invalid([error("INVALID_INPUT", "")]);
  }

  let parsed: JsonValue;
  let duplicates: readonly string[];
  try {
    const parser = new HandwrittenJsonParser(rawJson);
    parsed = parser.parse();
    duplicates = parser.duplicatePaths;
  } catch (failure) {
    if (failure instanceof ResourceLimitError) {
      return invalid([error("VALUE_INVALID", failure.path)]);
    }
    if (failure instanceof InvalidJsonError) {
      return invalid([error("INVALID_JSON", "")]);
    }
    return invalid([error("INVALID_JSON", "")]);
  }
  if (!isJsonRecord(parsed)) {
    return invalid([error("INVALID_INPUT", "")]);
  }
  if (duplicates.length > 0) {
    return invalid(duplicates.map((path) => error("DUPLICATE_FIELD", path)));
  }
  const structuralErrors = schemaErrors(parsed);
  if (structuralErrors.length > 0) {
    return invalid(structuralErrors);
  }

  const frozenMilliseconds = strictTimestampMilliseconds(frozenAsOf);
  if (frozenMilliseconds === undefined) {
    return invalid([error("INVALID_INPUT", "")]);
  }
  const semanticErrors = [
    ...collectPhaseOneErrors(parsed),
    ...collectPhaseTwoErrors(parsed),
    ...collectPhaseThreeErrors(parsed),
    ...collectPhaseFourErrors(parsed),
    ...collectPhaseFiveErrors(parsed),
    ...collectPhaseSixErrors(parsed, frozenMilliseconds),
    ...collectPhaseSevenErrors(parsed),
    ...collectPhaseEightErrors(parsed),
    ...collectPhaseNineErrors(parsed)
  ];
  const anchor = rootAnchorError(parsed);
  if (anchor) {
    semanticErrors.push(anchor);
  }
  if (semanticErrors.length > 0) {
    return invalid(semanticErrors);
  }

  const baseline = recordAt(parsed, "baseline");
  const candidate = recordAt(parsed, "candidate");
  const cases = recordsAt(recordAt(parsed, "holdout"), "cases");
  const baselineScore = score(baseline, cases);
  const candidateScore = score(candidate, cases);
  return {
    schemaVersion: RESULT_SCHEMA_VERSION,
    status: candidateScore < baselineScore ? "QUARANTINED" : "SHADOW",
    promotionState: "PROMOTION_DISABLED",
    fixtureId: TRUSTED_FIXTURE_ID,
    fixtureHash: stringAt(parsed, "fixtureHash"),
    scorecard: {
      metricId: "synthetic-exact-match.v1",
      caseCount: cases.length,
      baselineScore,
      candidateScore,
      delta: candidateScore - baselineScore
    },
    rollback: {
      baselineId: stringAt(baseline, "id"),
      baselineArtifactHash: stringAt(baseline, "artifactHash")
    },
    errors: []
  };
}
