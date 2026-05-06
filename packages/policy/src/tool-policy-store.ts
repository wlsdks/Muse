import type { MuseDatabase, ToolPolicyTable } from "@muse/db";
import type { JsonObject } from "@muse/shared";
import type { Insertable, Kysely, Selectable } from "kysely";

const defaultPolicyId = "default";

export interface ToolPolicyConfig {
  readonly allowWriteToolNamesByChannel: Readonly<Record<string, readonly string[]>>;
  readonly allowWriteToolNamesInDenyChannels: readonly string[];
  readonly createdAt: Date;
  readonly denyWriteChannels: readonly string[];
  readonly denyWriteMessage: string;
  readonly enabled: boolean;
  readonly updatedAt: Date;
  readonly writeToolNames: readonly string[];
}

export interface ToolPolicyInput {
  readonly allowWriteToolNamesByChannel?: Readonly<Record<string, readonly string[]>>;
  readonly allowWriteToolNamesInDenyChannels?: readonly string[];
  readonly denyWriteChannels?: readonly string[];
  readonly denyWriteMessage?: string;
  readonly enabled?: boolean;
  readonly writeToolNames?: readonly string[];
}

export interface ToolPolicyStore {
  getStored(): Promise<ToolPolicyConfig | undefined>;
  save(input: ToolPolicyInput): Promise<ToolPolicyConfig>;
  clear(): Promise<void>;
}

type ToolPolicyRow = Selectable<ToolPolicyTable>;
type ToolPolicyInsert = Insertable<ToolPolicyTable>;

export class InMemoryToolPolicyStore implements ToolPolicyStore {
  private stored?: ToolPolicyConfig;

  async getStored(): Promise<ToolPolicyConfig | undefined> {
    return this.stored ? cloneToolPolicy(this.stored) : undefined;
  }

  async save(input: ToolPolicyInput): Promise<ToolPolicyConfig> {
    this.stored = createToolPolicyConfig(input, new Date(), this.stored?.createdAt);
    return cloneToolPolicy(this.stored);
  }

  async clear(): Promise<void> {
    this.stored = undefined;
  }
}

export class KyselyToolPolicyStore implements ToolPolicyStore {
  constructor(private readonly db: Kysely<MuseDatabase>) {}

  async getStored(): Promise<ToolPolicyConfig | undefined> {
    const row = await this.db
      .selectFrom("tool_policy")
      .selectAll()
      .where("id", "=", defaultPolicyId)
      .executeTakeFirst();

    return row ? mapToolPolicyRow(row) : undefined;
  }

  async save(input: ToolPolicyInput): Promise<ToolPolicyConfig> {
    const existing = await this.getStored();
    const now = new Date();
    const config = createToolPolicyConfig(input, now, existing?.createdAt);
    const row = createToolPolicyInsert(config);
    const saved = await this.db
      .insertInto("tool_policy")
      .values(row)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          allow_write_tool_names_by_channel: row.allow_write_tool_names_by_channel,
          allow_write_tool_names_in_deny_channels: row.allow_write_tool_names_in_deny_channels,
          deny_write_channels: row.deny_write_channels,
          deny_write_message: row.deny_write_message,
          enabled: row.enabled,
          updated_at: row.updated_at,
          write_tool_names: row.write_tool_names
        })
      )
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapToolPolicyRow(saved);
  }

  async clear(): Promise<void> {
    await this.db.deleteFrom("tool_policy").where("id", "=", defaultPolicyId).execute();
  }
}

export function createToolPolicyConfig(
  input: ToolPolicyInput,
  now = new Date(),
  createdAt = now
): ToolPolicyConfig {
  return {
    allowWriteToolNamesByChannel: normalizeChannelMap(input.allowWriteToolNamesByChannel),
    allowWriteToolNamesInDenyChannels: normalizeStringSet(input.allowWriteToolNamesInDenyChannels),
    createdAt,
    denyWriteChannels: normalizeStringSet(input.denyWriteChannels, true),
    denyWriteMessage: (input.denyWriteMessage ?? "Error: This tool is not allowed in this channel").trim(),
    enabled: input.enabled ?? false,
    updatedAt: now,
    writeToolNames: normalizeStringSet(input.writeToolNames)
  };
}

export function createToolPolicyInsert(config: ToolPolicyConfig): ToolPolicyInsert {
  return {
    allow_write_tool_names_by_channel: config.allowWriteToolNamesByChannel as JsonObject,
    allow_write_tool_names_in_deny_channels: [...config.allowWriteToolNamesInDenyChannels],
    created_at: config.createdAt,
    deny_write_channels: [...config.denyWriteChannels],
    deny_write_message: config.denyWriteMessage,
    enabled: config.enabled,
    id: defaultPolicyId,
    updated_at: config.updatedAt,
    write_tool_names: [...config.writeToolNames]
  };
}

export function mapToolPolicyRow(row: ToolPolicyRow): ToolPolicyConfig {
  return {
    allowWriteToolNamesByChannel: normalizeChannelMap(row.allow_write_tool_names_by_channel),
    allowWriteToolNamesInDenyChannels: normalizeStringSet(row.allow_write_tool_names_in_deny_channels),
    createdAt: toDate(row.created_at),
    denyWriteChannels: normalizeStringSet(row.deny_write_channels, true),
    denyWriteMessage: row.deny_write_message,
    enabled: row.enabled,
    updatedAt: toDate(row.updated_at),
    writeToolNames: normalizeStringSet(row.write_tool_names)
  };
}

export function toolPolicyToJson(policy: ToolPolicyConfig): JsonObject {
  return {
    allowWriteToolNamesByChannel: Object.fromEntries(
      Object.entries(policy.allowWriteToolNamesByChannel).map(([key, value]) => [key, [...value]])
    ),
    allowWriteToolNamesInDenyChannels: [...policy.allowWriteToolNamesInDenyChannels],
    createdAt: policy.createdAt.toISOString(),
    denyWriteChannels: [...policy.denyWriteChannels],
    denyWriteMessage: policy.denyWriteMessage,
    enabled: policy.enabled,
    updatedAt: policy.updatedAt.toISOString(),
    writeToolNames: [...policy.writeToolNames]
  };
}

function cloneToolPolicy(policy: ToolPolicyConfig): ToolPolicyConfig {
  return {
    ...policy,
    allowWriteToolNamesByChannel: Object.fromEntries(
      Object.entries(policy.allowWriteToolNamesByChannel).map(([key, value]) => [key, [...value]])
    ),
    allowWriteToolNamesInDenyChannels: [...policy.allowWriteToolNamesInDenyChannels],
    denyWriteChannels: [...policy.denyWriteChannels],
    writeToolNames: [...policy.writeToolNames]
  };
}

function normalizeStringSet(value: unknown, lowercase = false): readonly string[] {
  const values = Array.isArray(value) ? value : [];
  return values
    .filter((item): item is string => typeof item === "string")
    .map((item) => lowercase ? item.trim().toLowerCase() : item.trim())
    .filter((item, index, items) => item.length > 0 && items.indexOf(item) === index);
}

function normalizeChannelMap(value: unknown): Readonly<Record<string, readonly string[]>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key.trim().toLowerCase(), normalizeStringSet(item)] as const)
      .filter(([key, item]) => key.length > 0 && item.length > 0)
  );
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

