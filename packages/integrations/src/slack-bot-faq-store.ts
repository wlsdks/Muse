/**
 * Slack bot-instance + channel-FAQ-registration persistence primitives
 * extracted from packages/integrations/src/index.ts.
 *
 * Owns the in-memory and Kysely-backed implementations of both
 * `SlackBotInstanceStore` and `ChannelFaqRegistrationStore`, plus
 * their row mappers (`buildSlackBotInstanceUpsertQuery`,
 * `createSlackBotInstanceInsert`, `mapSlackBotInstanceRow`,
 * `buildChannelFaqRegistrationUpsertQuery`,
 * `createChannelFaqRegistrationInsert`,
 * `mapChannelFaqRegistrationRow`) and the file-private
 * `normalizeSlackBotInstance` / `normalizeChannelFaqRegistration`
 * coercers. Re-exported from the integrations barrel for backwards
 * compatibility.
 */

import type {
  ChannelFaqRegistrationTable,
  MuseDatabase,
  SlackBotInstanceTable
} from "@muse/db";
import type { Insertable, Kysely, Selectable } from "kysely";
import type {
  ChannelFaqRegistration,
  ChannelFaqRegistrationStore,
  SlackBotInstance,
  SlackBotInstanceStore,
  SlackFaqAutoReplyMode,
  SlackFaqIngestStatus
} from "./index.js";

type SlackBotInstanceRow = Selectable<SlackBotInstanceTable>;
type SlackBotInstanceInsert = Insertable<SlackBotInstanceTable>;
type ChannelFaqRegistrationRow = Selectable<ChannelFaqRegistrationTable>;
type ChannelFaqRegistrationInsert = Insertable<ChannelFaqRegistrationTable>;

interface RequiredSlackBotInstance {
  readonly id: string;
  readonly name: string;
  readonly botToken: string;
  readonly appToken: string;
  readonly personaId: string;
  readonly defaultChannel: string | null;
  readonly enabled: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface RequiredChannelFaqRegistration {
  readonly channelId: string;
  readonly channelName: string | null;
  readonly enabled: boolean;
  readonly autoReplyMode: SlackFaqAutoReplyMode;
  readonly confidenceThreshold: number;
  readonly daysBack: number;
  readonly reIngestIntervalHours: number;
  readonly lastIngestedAt: Date | null;
  readonly lastMessageCount: number | null;
  readonly lastChunkCount: number | null;
  readonly lastStatus: SlackFaqIngestStatus | null;
  readonly lastError: string | null;
  readonly registeredBy: string | null;
  readonly registeredAt: Date;
  readonly updatedAt: Date;
}

export class InMemorySlackBotInstanceStore implements SlackBotInstanceStore {
  private readonly bots = new Map<string, RequiredSlackBotInstance>();
  private readonly now: () => Date;

  constructor(options: { readonly now?: () => Date } = {}) {
    this.now = options.now ?? (() => new Date());
  }

  list(): readonly SlackBotInstance[] {
    return [...this.bots.values()].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }

  listEnabled(): readonly SlackBotInstance[] {
    return this.list().filter((bot) => bot.enabled);
  }

  get(id: string): SlackBotInstance | undefined {
    return this.bots.get(id);
  }

  save(instance: SlackBotInstance): SlackBotInstance {
    const existing = this.bots.get(instance.id);
    const now = this.now();
    const normalized = normalizeSlackBotInstance(instance, {
      createdAt: existing?.createdAt ?? instance.createdAt ?? now,
      updatedAt: instance.updatedAt ?? now
    });

    this.bots.set(normalized.id, normalized);
    return normalized;
  }

  delete(id: string): boolean {
    return this.bots.delete(id);
  }
}

export class KyselySlackBotInstanceStore implements SlackBotInstanceStore {
  private readonly now: () => Date;

  constructor(
    private readonly db: Kysely<MuseDatabase>,
    options: { readonly now?: () => Date } = {}
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async list(): Promise<readonly SlackBotInstance[]> {
    const rows = await this.db.selectFrom("slack_bot_instances").selectAll().orderBy("created_at", "asc").execute();
    return rows.map(mapSlackBotInstanceRow);
  }

  async listEnabled(): Promise<readonly SlackBotInstance[]> {
    const rows = await this.db
      .selectFrom("slack_bot_instances")
      .selectAll()
      .where("enabled", "=", true)
      .orderBy("created_at", "asc")
      .execute();
    return rows.map(mapSlackBotInstanceRow);
  }

  async get(id: string): Promise<SlackBotInstance | undefined> {
    const row = await this.db.selectFrom("slack_bot_instances").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? mapSlackBotInstanceRow(row) : undefined;
  }

  async save(instance: SlackBotInstance): Promise<SlackBotInstance> {
    const existing = await this.get(instance.id);
    const row = await buildSlackBotInstanceUpsertQuery(this.db, instance, {
      createdAt: existing?.createdAt,
      now: this.now
    }).executeTakeFirstOrThrow();
    return mapSlackBotInstanceRow(row);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.deleteFrom("slack_bot_instances").where("id", "=", id).executeTakeFirst();
    return Number(result.numDeletedRows ?? 0) > 0;
  }
}

export class InMemoryChannelFaqRegistrationStore implements ChannelFaqRegistrationStore {
  private readonly registrations = new Map<string, RequiredChannelFaqRegistration>();
  private readonly now: () => Date;

  constructor(options: { readonly now?: () => Date } = {}) {
    this.now = options.now ?? (() => new Date());
  }

  save(registration: ChannelFaqRegistration): ChannelFaqRegistration {
    const existing = this.registrations.get(registration.channelId);
    const now = this.now();
    const normalized = normalizeChannelFaqRegistration(registration, {
      registeredAt: existing?.registeredAt ?? registration.registeredAt ?? now,
      updatedAt: registration.updatedAt ?? now
    });

    this.registrations.set(normalized.channelId, normalized);
    return normalized;
  }

  get(channelId: string): ChannelFaqRegistration | undefined {
    return this.registrations.get(channelId);
  }

  list(options: { readonly enabledOnly?: boolean } = {}): readonly ChannelFaqRegistration[] {
    return [...this.registrations.values()]
      .filter((registration) => !options.enabledOnly || registration.enabled)
      .sort(compareFaqRegistrations);
  }

  delete(channelId: string): boolean {
    return this.registrations.delete(channelId);
  }

  updateIngestResult(input: {
    readonly channelId: string;
    readonly status: SlackFaqIngestStatus;
    readonly messageCount?: number | null;
    readonly chunkCount?: number | null;
    readonly error?: string | null;
  }): ChannelFaqRegistration | undefined {
    const existing = this.registrations.get(input.channelId);

    if (!existing) {
      return undefined;
    }

    return this.save({
      ...existing,
      lastChunkCount: input.chunkCount ?? null,
      lastError: input.error ?? null,
      lastIngestedAt: this.now(),
      lastMessageCount: input.messageCount ?? null,
      lastStatus: input.status
    });
  }
}

export class KyselyChannelFaqRegistrationStore implements ChannelFaqRegistrationStore {
  private readonly now: () => Date;

  constructor(
    private readonly db: Kysely<MuseDatabase>,
    options: { readonly now?: () => Date } = {}
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async save(registration: ChannelFaqRegistration): Promise<ChannelFaqRegistration> {
    const existing = await this.get(registration.channelId);
    const row = await buildChannelFaqRegistrationUpsertQuery(this.db, registration, {
      registeredAt: existing?.registeredAt,
      now: this.now
    }).executeTakeFirstOrThrow();
    return mapChannelFaqRegistrationRow(row);
  }

  async get(channelId: string): Promise<ChannelFaqRegistration | undefined> {
    const row = await this.db
      .selectFrom("channel_faq_registrations")
      .selectAll()
      .where("channel_id", "=", channelId)
      .executeTakeFirst();
    return row ? mapChannelFaqRegistrationRow(row) : undefined;
  }

  async list(options: { readonly enabledOnly?: boolean } = {}): Promise<readonly ChannelFaqRegistration[]> {
    const rows = await this.db
      .selectFrom("channel_faq_registrations")
      .selectAll()
      .$if(Boolean(options.enabledOnly), (query) => query.where("enabled", "=", true))
      .orderBy("last_ingested_at", "asc")
      .orderBy("registered_at", "asc")
      .execute();
    return rows.map(mapChannelFaqRegistrationRow);
  }

  async delete(channelId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom("channel_faq_registrations")
      .where("channel_id", "=", channelId)
      .executeTakeFirst();
    return Number(result.numDeletedRows ?? 0) > 0;
  }

  async updateIngestResult(input: {
    readonly channelId: string;
    readonly status: SlackFaqIngestStatus;
    readonly messageCount?: number | null;
    readonly chunkCount?: number | null;
    readonly error?: string | null;
  }): Promise<ChannelFaqRegistration | undefined> {
    const row = await this.db
      .updateTable("channel_faq_registrations")
      .set({
        last_chunk_count: input.chunkCount ?? null,
        last_error: input.error ?? null,
        last_ingested_at: this.now(),
        last_message_count: input.messageCount ?? null,
        last_status: input.status,
        updated_at: this.now()
      })
      .where("channel_id", "=", input.channelId)
      .returningAll()
      .executeTakeFirst();
    return row ? mapChannelFaqRegistrationRow(row) : undefined;
  }
}

export function buildSlackBotInstanceUpsertQuery(
  db: Kysely<MuseDatabase>,
  instance: SlackBotInstance,
  options: { readonly createdAt?: Date; readonly now: () => Date }
) {
  const row = createSlackBotInstanceInsert(instance, options);

  return db
    .insertInto("slack_bot_instances")
    .values(row)
    .onConflict((oc) => oc.column("id").doUpdateSet({
      app_token: row.app_token,
      bot_token: row.bot_token,
      default_channel: row.default_channel,
      enabled: row.enabled,
      name: row.name,
      persona_id: row.persona_id,
      updated_at: row.updated_at
    }))
    .returningAll();
}

export function createSlackBotInstanceInsert(
  instance: SlackBotInstance,
  options: { readonly createdAt?: Date; readonly now: () => Date }
): SlackBotInstanceInsert {
  const now = options.now();
  const normalized = normalizeSlackBotInstance(instance, {
    createdAt: options.createdAt ?? instance.createdAt ?? now,
    updatedAt: instance.updatedAt ?? now
  });

  return {
    app_token: normalized.appToken,
    bot_token: normalized.botToken,
    created_at: normalized.createdAt,
    default_channel: normalized.defaultChannel,
    enabled: normalized.enabled,
    id: normalized.id,
    name: normalized.name,
    persona_id: normalized.personaId,
    updated_at: normalized.updatedAt
  };
}

export function mapSlackBotInstanceRow(row: SlackBotInstanceRow | SlackBotInstanceInsert): SlackBotInstance {
  return {
    appToken: row.app_token ?? "",
    botToken: row.bot_token ?? "",
    createdAt: dateValue(row.created_at ?? null),
    defaultChannel: row.default_channel ?? null,
    enabled: row.enabled ?? true,
    id: row.id ?? "",
    name: row.name ?? "",
    personaId: row.persona_id ?? "",
    updatedAt: dateValue(row.updated_at ?? null)
  };
}

export function buildChannelFaqRegistrationUpsertQuery(
  db: Kysely<MuseDatabase>,
  registration: ChannelFaqRegistration,
  options: { readonly registeredAt?: Date; readonly now: () => Date }
) {
  const row = createChannelFaqRegistrationInsert(registration, options);

  return db
    .insertInto("channel_faq_registrations")
    .values(row)
    .onConflict((oc) => oc.column("channel_id").doUpdateSet({
      auto_reply_mode: row.auto_reply_mode,
      channel_name: row.channel_name,
      confidence_threshold: row.confidence_threshold,
      days_back: row.days_back,
      enabled: row.enabled,
      last_chunk_count: row.last_chunk_count,
      last_error: row.last_error,
      last_ingested_at: row.last_ingested_at,
      last_message_count: row.last_message_count,
      last_status: row.last_status,
      re_ingest_interval_hours: row.re_ingest_interval_hours,
      updated_at: row.updated_at
    }))
    .returningAll();
}

export function createChannelFaqRegistrationInsert(
  registration: ChannelFaqRegistration,
  options: { readonly registeredAt?: Date; readonly now: () => Date }
): ChannelFaqRegistrationInsert {
  const now = options.now();
  const normalized = normalizeChannelFaqRegistration(registration, {
    registeredAt: options.registeredAt ?? registration.registeredAt ?? now,
    updatedAt: registration.updatedAt ?? now
  });

  return {
    auto_reply_mode: normalized.autoReplyMode,
    channel_id: normalized.channelId,
    channel_name: normalized.channelName,
    confidence_threshold: normalized.confidenceThreshold,
    days_back: normalized.daysBack,
    enabled: normalized.enabled,
    last_chunk_count: normalized.lastChunkCount,
    last_error: normalized.lastError,
    last_ingested_at: normalized.lastIngestedAt,
    last_message_count: normalized.lastMessageCount,
    last_status: normalized.lastStatus,
    re_ingest_interval_hours: normalized.reIngestIntervalHours,
    registered_at: normalized.registeredAt,
    registered_by: normalized.registeredBy,
    updated_at: normalized.updatedAt
  };
}

export function mapChannelFaqRegistrationRow(
  row: ChannelFaqRegistrationRow | ChannelFaqRegistrationInsert
): ChannelFaqRegistration {
  return {
    autoReplyMode: slackFaqAutoReplyMode(row.auto_reply_mode),
    channelId: row.channel_id ?? "",
    channelName: row.channel_name ?? null,
    confidenceThreshold: row.confidence_threshold ?? 0.8,
    daysBack: row.days_back ?? 30,
    enabled: row.enabled ?? true,
    lastChunkCount: row.last_chunk_count ?? null,
    lastError: row.last_error ?? null,
    lastIngestedAt: row.last_ingested_at ? dateValue(row.last_ingested_at) : null,
    lastMessageCount: row.last_message_count ?? null,
    lastStatus: slackFaqIngestStatus(row.last_status),
    reIngestIntervalHours: row.re_ingest_interval_hours ?? 24,
    registeredAt: dateValue(row.registered_at ?? null),
    registeredBy: row.registered_by ?? null,
    updatedAt: dateValue(row.updated_at ?? null)
  };
}

function normalizeSlackBotInstance(
  instance: SlackBotInstance,
  timestamps: { readonly createdAt: Date; readonly updatedAt: Date }
): RequiredSlackBotInstance {
  return {
    appToken: instance.appToken,
    botToken: instance.botToken,
    createdAt: timestamps.createdAt,
    defaultChannel: nullableString(instance.defaultChannel),
    enabled: instance.enabled ?? true,
    id: instance.id,
    name: instance.name.trim(),
    personaId: instance.personaId,
    updatedAt: timestamps.updatedAt
  };
}

function normalizeChannelFaqRegistration(
  registration: ChannelFaqRegistration,
  timestamps: { readonly registeredAt: Date; readonly updatedAt: Date }
): RequiredChannelFaqRegistration {
  return {
    autoReplyMode: slackFaqAutoReplyMode(registration.autoReplyMode),
    channelId: registration.channelId,
    channelName: nullableString(registration.channelName),
    confidenceThreshold: registration.confidenceThreshold ?? 0.8,
    daysBack: Math.max(1, Math.trunc(registration.daysBack ?? 30)),
    enabled: registration.enabled ?? true,
    lastChunkCount: registration.lastChunkCount ?? null,
    lastError: nullableString(registration.lastError),
    lastIngestedAt: registration.lastIngestedAt ?? null,
    lastMessageCount: registration.lastMessageCount ?? null,
    lastStatus: slackFaqIngestStatus(registration.lastStatus),
    reIngestIntervalHours: Math.max(1, Math.trunc(registration.reIngestIntervalHours ?? 24)),
    registeredAt: timestamps.registeredAt,
    registeredBy: nullableString(registration.registeredBy),
    updatedAt: timestamps.updatedAt
  };
}

function compareFaqRegistrations(left: RequiredChannelFaqRegistration, right: RequiredChannelFaqRegistration): number {
  const leftIngested = left.lastIngestedAt?.getTime() ?? 0;
  const rightIngested = right.lastIngestedAt?.getTime() ?? 0;
  return leftIngested - rightIngested || left.registeredAt.getTime() - right.registeredAt.getTime();
}

function nullableString(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function slackFaqAutoReplyMode(value: unknown): SlackFaqAutoReplyMode {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return normalized === "ALWAYS" || normalized === "OFF" ? normalized : "MENTION";
}

function slackFaqIngestStatus(value: unknown): SlackFaqIngestStatus | null {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return normalized === "OK" || normalized === "FAILED" || normalized === "RUNNING" ? normalized : null;
}

function dateValue(value: Date | string | null): Date {
  return value instanceof Date ? value : new Date(value ?? 0);
}
