/**
 * Reactor-compat tool-policy store helpers extracted from
 * reactor-compat-routes.ts.
 *
 * Each helper dispatches to options.toolPolicyStore (the configured
 * @muse/policy ToolPolicyStore) when present, otherwise falls back to the
 * file-private compat state via accessors. The state mutator
 * setStateToolPolicy mediates writes so the new module never touches the
 * file-private `state` directly.
 */

import { toolPolicyToJson, type ToolPolicyInput } from "@muse/policy";
import type { JsonObject } from "@muse/shared";
import {
  epochMillisOrNull,
  getStateToolPolicy,
  isRecord,
  isStateToolPolicyStored,
  nowIso,
  readBoolean,
  readStringSet,
  setStateToolPolicy,
  stringArrayField,
  stringField,
  toBody,
  type CompatBody,
  type ReactorCompatibilityRouteOptions
} from "./reactor-compat-routes.js";

export async function readStoredToolPolicy(options: ReactorCompatibilityRouteOptions): Promise<JsonObject | undefined> {
  const stored = await options.toolPolicyStore?.getStored();

  if (stored) {
    return toolPolicyToJson(stored);
  }

  return isStateToolPolicyStored() ? getStateToolPolicy() : undefined;
}

export async function saveToolPolicy(options: ReactorCompatibilityRouteOptions, bodyValue: unknown): Promise<JsonObject> {
  const body = toBody(bodyValue);

  if (options.toolPolicyStore) {
    const saved = await options.toolPolicyStore.save(toToolPolicyInput(body));
    const json = toolPolicyToJson(saved);
    setStateToolPolicy(json, true);
    return json;
  }

  return setStateToolPolicy(updateToolPolicy(body), true);
}

export async function clearToolPolicy(options: ReactorCompatibilityRouteOptions): Promise<void> {
  await options.toolPolicyStore?.clear();
  setStateToolPolicy(defaultToolPolicy(), false);
}

function toToolPolicyInput(body: CompatBody): ToolPolicyInput {
  return {
    allowWriteToolNamesByChannel: toolPolicyChannelMap(body.allowWriteToolNamesByChannel),
    allowWriteToolNamesInDenyChannels: toolPolicyStringSet(body.allowWriteToolNamesInDenyChannels),
    denyWriteChannels: toolPolicyStringSet(body.denyWriteChannels, true),
    denyWriteMessage: stringField(
      body.denyWriteMessage,
      "Error: This tool is not allowed in this channel"
    ).trim(),
    enabled: readBoolean(body.enabled, false),
    writeToolNames: toolPolicyStringSet(body.writeToolNames)
  };
}

function updateToolPolicy(bodyValue: unknown): JsonObject {
  const body = toBody(bodyValue);
  const timestamp = nowIso();
  return {
    allowWriteToolNamesByChannel: toolPolicyChannelMap(body.allowWriteToolNamesByChannel),
    allowWriteToolNamesInDenyChannels: toolPolicyStringSet(body.allowWriteToolNamesInDenyChannels),
    createdAt: timestamp,
    denyWriteChannels: toolPolicyStringSet(body.denyWriteChannels, true),
    denyWriteMessage: stringField(
      body.denyWriteMessage,
      "Error: This tool is not allowed in this channel"
    ).trim(),
    enabled: readBoolean(body.enabled, false),
    updatedAt: timestamp,
    writeToolNames: toolPolicyStringSet(body.writeToolNames)
  };
}

export function validateToolPolicyBody(body: CompatBody): JsonObject | undefined {
  const errors: Record<string, string> = {};

  if (toolPolicyStringSet(body.writeToolNames).length > 500) {
    errors.writeToolNames = "writeToolNames must not exceed 500 entries";
  }

  if (toolPolicyStringSet(body.denyWriteChannels).length > 50) {
    errors.denyWriteChannels = "denyWriteChannels must not exceed 50 entries";
  }

  if (toolPolicyStringSet(body.allowWriteToolNamesInDenyChannels).length > 500) {
    errors.allowWriteToolNamesInDenyChannels = "allowWriteToolNamesInDenyChannels must not exceed 500 entries";
  }

  if (isRecord(body.allowWriteToolNamesByChannel) && Object.keys(body.allowWriteToolNamesByChannel).length > 200) {
    errors.allowWriteToolNamesByChannel = "allowWriteToolNamesByChannel must not exceed 200 channels";
  }

  if (typeof body.denyWriteMessage === "string" && body.denyWriteMessage.length > 500) {
    errors.denyWriteMessage = "denyWriteMessage must not exceed 500 characters";
  }

  return Object.keys(errors).length > 0 ? errors : undefined;
}

function toolPolicyStringSet(value: unknown, lowercase = false): string[] {
  return readStringSet(value)
    .map((item) => lowercase ? item.trim().toLowerCase() : item.trim())
    .filter((item, index, items) => item.length > 0 && items.indexOf(item) === index);
}

function toolPolicyChannelMap(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key.trim().toLowerCase(), toolPolicyStringSet(item)] as const)
      .filter(([key, item]) => key.length > 0 && item.length > 0)
  );
}

export function defaultToolPolicy(): JsonObject {
  const timestamp = nowIso();
  return {
    allowWriteToolNamesByChannel: {},
    allowWriteToolNamesInDenyChannels: [],
    createdAt: timestamp,
    denyWriteChannels: [],
    denyWriteMessage: "Write tools are disabled for this channel.",
    enabled: true,
    updatedAt: timestamp,
    writeToolNames: []
  };
}

export function toToolPolicyResponse(record: JsonObject) {
  return {
    allowWriteToolNamesByChannel: stringArrayMapField(record.allowWriteToolNamesByChannel, {}),
    allowWriteToolNamesInDenyChannels: stringArrayField(record.allowWriteToolNamesInDenyChannels, []),
    createdAt: epochMillisOrNull(record.createdAt) ?? Date.now(),
    denyWriteChannels: stringArrayField(record.denyWriteChannels, []),
    denyWriteMessage: stringField(record.denyWriteMessage, ""),
    enabled: readBoolean(record.enabled, true),
    updatedAt: epochMillisOrNull(record.updatedAt) ?? Date.now(),
    writeToolNames: stringArrayField(record.writeToolNames, [])
  };
}

function stringArrayMapField(value: unknown, fallback: Record<string, string[]>): Record<string, string[]> {
  if (!isRecord(value)) {
    return fallback;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key.trim().length > 0)
      .map(([key, item]) => [key, stringArrayField(item, [])])
  );
}
