/**
 * Reactor-compat input/output guard-rule store helpers extracted from
 * reactor-compat-routes.ts.
 *
 * Each helper dispatches to options.guardRuleStore (the @muse/policy
 * GuardRuleStore) when configured, otherwise falls back to the file-private
 * compat state via accessors. Pairs with guard-compat-routes.ts.
 */

import { createRunId, type JsonObject } from "@muse/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  createRecord,
  epochMillisOrNull,
  errorResponse,
  findCompatRecord,
  getStateInputGuardRules,
  getStateOutputGuardRuleAudits,
  getStateOutputGuardRules,
  nowIso,
  nullableStringResponse,
  readAuthUserId,
  readBodyString,
  readBoolean,
  readNullableStringField,
  readNumber,
  stringField,
  toBody,
  validationErrorResponse,
  type CompatRecord,
  type ReactorCompatibilityRouteOptions
} from "./reactor-compat-routes.js";

export async function createInputGuardRule(
  options: ReactorCompatibilityRouteOptions,
  bodyValue: unknown
): Promise<CompatRecord> {
  const body = toBody(bodyValue);
  return saveInputGuardRule(options, {
    action: inputGuardAction(body.action),
    category: readBodyString(body, "category") ?? "custom",
    description: readNullableStringField(body, "description"),
    enabled: readBoolean(body.enabled, true),
    name: readBodyString(body, "name") ?? "",
    pattern: readBodyString(body, "pattern") ?? "",
    patternType: inputGuardPatternType(body.patternType),
    priority: readNumber(body.priority, 100)
  });
}

export async function updateInputGuardRule(
  options: ReactorCompatibilityRouteOptions,
  existing: CompatRecord,
  bodyValue: unknown
): Promise<CompatRecord> {
  const body = toBody(bodyValue);
  return saveInputGuardRule(options, {
    ...existing,
    action: inputGuardAction(body.action),
    category: readBodyString(body, "category") ?? "custom",
    description: readNullableStringField(body, "description"),
    enabled: readBoolean(body.enabled, true),
    name: readBodyString(body, "name") ?? "",
    pattern: readBodyString(body, "pattern") ?? "",
    patternType: inputGuardPatternType(body.patternType),
    priority: readNumber(body.priority, 100)
  });
}

async function saveInputGuardRule(options: ReactorCompatibilityRouteOptions, record: JsonObject): Promise<CompatRecord> {
  if (options.guardRuleStore) {
    const saved = await options.guardRuleStore.saveInputRule(prepareGuardRecord(record, "input_guard_rule"));
    return guardStoreRecordToCompat(saved, "input_guard_rule");
  }

  return createRecord(getStateInputGuardRules(), record, "input_guard_rule");
}

export async function listInputGuardRules(options: ReactorCompatibilityRouteOptions): Promise<readonly CompatRecord[]> {
  if (options.guardRuleStore) {
    const rows = await options.guardRuleStore.listInputRules();
    return rows.map((row) => guardStoreRecordToCompat(row, "input_guard_rule"));
  }

  return [...getStateInputGuardRules().values()];
}

export async function getInputGuardRule(options: ReactorCompatibilityRouteOptions, id: string): Promise<CompatRecord | undefined> {
  if (options.guardRuleStore) {
    const row = await options.guardRuleStore.getInputRule(id);
    return row ? guardStoreRecordToCompat(row, "input_guard_rule") : undefined;
  }

  return findCompatRecord(getStateInputGuardRules(), id);
}

export async function deleteInputGuardRule(options: ReactorCompatibilityRouteOptions, id: string): Promise<boolean> {
  if (options.guardRuleStore) {
    return options.guardRuleStore.deleteInputRule(id);
  }

  return getStateInputGuardRules().delete(id);
}

export function toInputGuardRuleResponse(record: JsonObject) {
  return {
    action: inputGuardAction(record.action),
    category: stringField(record.category, "custom"),
    createdAt: stringField(record.createdAt, nowIso()),
    description: nullableStringResponse(record.description),
    enabled: readBoolean(record.enabled, true),
    id: stringField(record.id, ""),
    name: stringField(record.name, ""),
    pattern: stringField(record.pattern, ""),
    patternType: inputGuardPatternType(record.patternType),
    priority: readNumber(record.priority, 100),
    updatedAt: stringField(record.updatedAt, nowIso())
  };
}

export function validateInputGuardRule(bodyValue: unknown): JsonObject | undefined {
  const body = toBody(bodyValue);
  const name = readBodyString(body, "name") ?? "";
  const pattern = readBodyString(body, "pattern") ?? "";
  const patternType = typeof body.patternType === "string" ? body.patternType.trim().toLowerCase() : "regex";
  const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "block";

  if (name.length === 0) {
    return validationErrorResponse({ name: "name은 필수입니다" });
  }

  if (pattern.length === 0) {
    return validationErrorResponse({ pattern: "pattern은 필수입니다" });
  }

  if (patternType !== "regex" && patternType !== "keyword") {
    return errorResponse("patternType은 regex 또는 keyword 여야 합니다");
  }

  if (action !== "block" && action !== "warn" && action !== "flag") {
    return errorResponse("action은 block, warn 또는 flag 여야 합니다");
  }

  if (patternType === "regex") {
    return validateRegexPattern(pattern) ? errorResponse("유효하지 않은 정규식 패턴") : undefined;
  }

  return undefined;
}

function inputGuardPatternType(value: unknown): string {
  return typeof value === "string" && value.trim().toLowerCase() === "keyword" ? "keyword" : "regex";
}

function inputGuardAction(value: unknown): string {
  if (typeof value !== "string") {
    return "block";
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "warn" || normalized === "flag" ? normalized : "block";
}

export async function createOutputGuardRule(
  options: ReactorCompatibilityRouteOptions,
  bodyValue: unknown
): Promise<CompatRecord> {
  const body = toBody(bodyValue);
  return saveOutputGuardRule(options, {
    action: outputGuardAction(body.action),
    enabled: readBoolean(body.enabled, true),
    name: (readBodyString(body, "name") ?? "").trim(),
    pattern: (readBodyString(body, "pattern") ?? "").trim(),
    priority: readNumber(body.priority, 100),
    replacement: stringField(body.replacement, "[REDACTED]")
  });
}

export async function updateOutputGuardRule(
  options: ReactorCompatibilityRouteOptions,
  existing: CompatRecord,
  bodyValue: unknown
): Promise<CompatRecord> {
  const body = toBody(bodyValue);
  const pattern = typeof body.pattern === "string" ? body.pattern.trim() : stringField(existing.pattern, "");
  return saveOutputGuardRule(options, {
    ...existing,
    action: typeof body.action === "string" ? outputGuardAction(body.action) : outputGuardAction(existing.action),
    enabled: readBoolean(body.enabled, readBoolean(existing.enabled, true)),
    name: typeof body.name === "string" ? body.name.trim() : stringField(existing.name, ""),
    pattern,
    priority: readNumber(body.priority, readNumber(existing.priority, 100)),
    replacement: typeof body.replacement === "string" ? body.replacement : stringField(existing.replacement, "[REDACTED]")
  });
}

async function saveOutputGuardRule(options: ReactorCompatibilityRouteOptions, record: JsonObject): Promise<CompatRecord> {
  if (options.guardRuleStore) {
    const saved = await options.guardRuleStore.saveOutputRule(prepareGuardRecord(record, "output_guard_rule"));
    return guardStoreRecordToCompat(saved, "output_guard_rule");
  }

  return createRecord(getStateOutputGuardRules(), record, "output_guard_rule");
}

export async function listOutputGuardRules(options: ReactorCompatibilityRouteOptions): Promise<readonly CompatRecord[]> {
  if (options.guardRuleStore) {
    const rows = await options.guardRuleStore.listOutputRules();
    return rows.map((row) => guardStoreRecordToCompat(row, "output_guard_rule"));
  }

  return [...getStateOutputGuardRules().values()];
}

export async function getOutputGuardRule(options: ReactorCompatibilityRouteOptions, id: string): Promise<CompatRecord | undefined> {
  if (options.guardRuleStore) {
    const row = await options.guardRuleStore.getOutputRule(id);
    return row ? guardStoreRecordToCompat(row, "output_guard_rule") : undefined;
  }

  return findCompatRecord(getStateOutputGuardRules(), id);
}

export async function deleteOutputGuardRule(options: ReactorCompatibilityRouteOptions, id: string): Promise<boolean> {
  if (options.guardRuleStore) {
    return options.guardRuleStore.deleteOutputRule(id);
  }

  return getStateOutputGuardRules().delete(id);
}

export function toOutputGuardRuleResponse(record: JsonObject) {
  return {
    action: outputGuardAction(record.action),
    createdAt: epochMillisOrNull(record.createdAt) ?? Date.now(),
    enabled: readBoolean(record.enabled, true),
    id: stringField(record.id, ""),
    name: stringField(record.name, ""),
    pattern: stringField(record.pattern, ""),
    priority: readNumber(record.priority, 100),
    replacement: stringField(record.replacement, "[REDACTED]"),
    updatedAt: epochMillisOrNull(record.updatedAt) ?? Date.now()
  };
}

export function validateOutputGuardRule(bodyValue: unknown, partial = false): JsonObject | undefined {
  const body = toBody(bodyValue);
  const action = body.action;
  const name = body.name;
  const pattern = body.pattern;

  if (!partial && !readBodyString(body, "name")) {
    return validationErrorResponse({ name: "name must not be blank" });
  }

  if (typeof name === "string" && name.length > 120) {
    return validationErrorResponse({ name: "name must not exceed 120 characters" });
  }

  if (!partial || action !== undefined) {
    const normalizedAction = typeof action === "string" ? action.trim().toUpperCase() : "";

    if (normalizedAction.length === 0) {
      return validationErrorResponse({ action: "action must not be blank" });
    }

    if (!["MASK", "REJECT"].includes(normalizedAction)) {
      return errorResponse(`Invalid action: ${String(action)}`);
    }
  }

  if (!partial || pattern !== undefined) {
    const trimmed = typeof pattern === "string" ? pattern.trim() : "";

    if (trimmed.length === 0) {
      return validationErrorResponse({ pattern: "pattern must not be blank" });
    }

    const regexError = validateRegexPattern(trimmed);

    if (regexError) {
      return errorResponse(`Invalid pattern: ${regexError}`);
    }
  }

  return undefined;
}

export function validateOutputGuardSimulation(bodyValue: unknown): JsonObject | undefined {
  const body = toBody(bodyValue);
  const content = body.content;

  if (!readBodyString(body, "content")) {
    return validationErrorResponse({ content: "content must not be blank" });
  }

  if (typeof content === "string" && content.length > 50_000) {
    return validationErrorResponse({ content: "content must not exceed 50000 characters" });
  }

  return undefined;
}

export function outputGuardRuleNotFound(reply: FastifyReply, id: string) {
  return reply.status(404).send(errorResponse(`Output guard rule '${id}' not found`));
}

function outputGuardAction(value: unknown): string {
  return typeof value === "string" && value.trim().toUpperCase() === "REJECT" ? "REJECT" : "MASK";
}

export async function simulateOutputGuardRules(options: ReactorCompatibilityRouteOptions, bodyValue: unknown) {
  const body = toBody(bodyValue);
  const originalContent = readBodyString(body, "content") ?? readBodyString(body, "text") ?? "";
  const includeDisabled = readBoolean(body.includeDisabled, false);
  const matchedRules: JsonObject[] = [];
  const invalidRules: JsonObject[] = [];
  let blockedByRuleId: string | null = null;
  let blockedByRuleName: string | null = null;
  let resultContent = originalContent;

  const rules = (await listOutputGuardRules(options))
    .filter((rule) => includeDisabled || readBoolean(rule.enabled, true))
    .sort((left, right) => readNumber(left.priority, 100) - readNumber(right.priority, 100));

  for (const rule of rules) {
    const pattern = stringField(rule.pattern, "");
    const regexError = validateRegexPattern(pattern);

    if (regexError) {
      invalidRules.push({ reason: regexError, ruleId: rule.id, ruleName: stringField(rule.name, "") });
      continue;
    }

    const regex = new RegExp(pattern, "g");

    if (!regex.test(resultContent)) {
      continue;
    }

    const action = outputGuardAction(rule.action);
    matchedRules.push({
      action,
      priority: readNumber(rule.priority, 100),
      ruleId: rule.id,
      ruleName: stringField(rule.name, "")
    });

    if (action === "REJECT") {
      blockedByRuleId = rule.id;
      blockedByRuleName = stringField(rule.name, "");
      break;
    }

    resultContent = resultContent.replace(new RegExp(pattern, "g"), stringField(rule.replacement, "[REDACTED]"));
  }

  return {
    blocked: blockedByRuleId !== null,
    blockedByRuleId,
    blockedByRuleName,
    invalidRules,
    matchedRules,
    modified: resultContent !== originalContent,
    originalContent,
    resultContent
  };
}

export async function recordOutputGuardAudit(
  options: ReactorCompatibilityRouteOptions,
  action: string,
  request: FastifyRequest,
  ruleId?: string,
  detail?: string
): Promise<CompatRecord> {
  const record = {
    action,
    actor: readAuthUserId(request) ?? "anonymous",
    detail: detail ?? null,
    ruleId: ruleId ?? null
  };

  if (options.guardRuleStore) {
    const saved = await options.guardRuleStore.saveOutputAudit(prepareGuardRecord(record, "output_guard_audit"));
    return guardStoreRecordToCompat(saved, "output_guard_audit");
  }

  return createRecord(getStateOutputGuardRuleAudits(), record, "output_guard_audit");
}

export async function listOutputGuardAudits(
  options: ReactorCompatibilityRouteOptions,
  limit: number
): Promise<readonly CompatRecord[]> {
  if (options.guardRuleStore) {
    const rows = await options.guardRuleStore.listOutputAudits(limit);
    return rows.map((row) => guardStoreRecordToCompat(row, "output_guard_audit"));
  }

  return [...getStateOutputGuardRuleAudits().values()].slice(-Math.min(Math.max(limit, 1), 1000));
}

function prepareGuardRecord(record: JsonObject, prefix: string): JsonObject {
  const createdAt = nullableStringResponse(record.createdAt) ?? nowIso();
  return {
    ...record,
    createdAt,
    id: stringField(record.id, "") || createRunId(prefix),
    updatedAt: nullableStringResponse(record.updatedAt) ?? nowIso()
  };
}

function guardStoreRecordToCompat(record: JsonObject, prefix: string): CompatRecord {
  const createdAt = nullableStringResponse(record.createdAt) ?? nowIso();
  return {
    ...record,
    createdAt,
    id: stringField(record.id, "") || createRunId(prefix),
    updatedAt: nullableStringResponse(record.updatedAt) ?? createdAt
  };
}

export function toOutputGuardAuditResponse(record: JsonObject) {
  return {
    action: outputGuardAction(record.action) === "REJECT" ? "REJECT" : stringField(record.action, "CREATE"),
    actor: stringField(record.actor, "anonymous"),
    createdAt: epochMillisOrNull(record.createdAt) ?? Date.now(),
    detail: nullableStringResponse(record.detail),
    id: stringField(record.id, ""),
    ruleId: nullableStringResponse(record.ruleId)
  };
}

export function outputGuardRuleDetail(rule: JsonObject): string {
  return `name=${stringField(rule.name, "")}, action=${outputGuardAction(rule.action)}, priority=${readNumber(rule.priority, 100)}, enabled=${readBoolean(rule.enabled, true)}`;
}

function validateRegexPattern(pattern: string): string | undefined {
  try {
    new RegExp(pattern);
    return undefined;
  } catch {
    return "Invalid regex pattern";
  }
}
