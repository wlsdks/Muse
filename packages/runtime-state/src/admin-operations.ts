import type {
  AdminAuditTable,
  AdminAlertTable,
  AlertRuleTable,
  AdminCostUsageTable,
  AdminSloTable,
  AdminTenantTable,
  MetricAuditTrailTable,
  ModelPricingTable,
  MuseDatabase
} from "@muse/db";
import { createRunId, type JsonObject } from "@muse/shared";
import type { Insertable, Kysely, Selectable } from "kysely";

type Awaitable<T> = T | Promise<T>;

export type AdminTenantStatus = "active" | "suspended" | "disabled";
export type AdminAlertSeverity = "info" | "warning" | "critical";
export type AdminAlertStatus = "open" | "acknowledged" | "resolved";
export type AdminSloStatus = "healthy" | "at_risk" | "violated";

export interface AdminTenant {
  readonly id: string;
  readonly name: string;
  readonly status: AdminTenantStatus;
  readonly monthlyBudgetUsd?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AdminAlert {
  readonly id: string;
  readonly severity: AdminAlertSeverity;
  readonly status: AdminAlertStatus;
  readonly message: string;
  readonly target?: string;
  readonly createdAt: Date;
  readonly acknowledgedAt?: Date;
}

export interface AdminSlo {
  readonly id: string;
  readonly name: string;
  readonly target: number;
  readonly actual?: number;
  readonly window: string;
  readonly status: AdminSloStatus;
  readonly updatedAt: Date;
}

export interface AdminCostUsage {
  readonly tenantId?: string;
  readonly model?: string;
  readonly costUsd: string;
}

export interface AdminCostSummary {
  readonly totalCostUsd: string;
  readonly byModel: Readonly<Record<string, string>>;
  readonly byTenant: Readonly<Record<string, string>>;
}

export interface AdminOperationsStore {
  listTenants(): Awaitable<readonly AdminTenant[]>;
  upsertTenant(input: AdminTenantInput): Awaitable<AdminTenant>;
  listAlerts(): Awaitable<readonly AdminAlert[]>;
  createAlert(input: AdminAlertInput): Awaitable<AdminAlert>;
  acknowledgeAlert(id: string): Awaitable<AdminAlert | undefined>;
  resolveAlert(id: string): Awaitable<AdminAlert | undefined>;
  listSlos(): Awaitable<readonly AdminSlo[]>;
  upsertSlo(input: AdminSloInput): Awaitable<AdminSlo>;
  recordCost(input: AdminCostUsage): Awaitable<AdminCostSummary>;
  costSummary(): Awaitable<AdminCostSummary>;
}

export interface AdminAuditRecord {
  readonly id: string;
  readonly category: string;
  readonly action: string;
  readonly actor: string;
  readonly resourceType?: string | null;
  readonly resourceId?: string | null;
  readonly detail?: string | null;
  readonly createdAt: Date;
}

export interface AdminAuditInput {
  readonly id?: string;
  readonly category: string;
  readonly action: string;
  readonly actor: string;
  readonly resourceType?: string | null;
  readonly resourceId?: string | null;
  readonly detail?: string | null;
}

export interface AdminAuditStore {
  record(input: AdminAuditInput): Awaitable<AdminAuditRecord>;
  listRecent(limit?: number): Awaitable<readonly AdminAuditRecord[]>;
}

export interface MetricAuditEvent {
  readonly id: string;
  readonly kind: string;
  readonly payload: JsonObject;
  readonly createdAt: Date;
  readonly tenantId?: string;
}

export interface MetricAuditEventInput {
  readonly id?: string;
  readonly kind: string;
  readonly payload: JsonObject;
  readonly tenantId?: string;
}

export interface MetricAuditEventStore {
  record(input: MetricAuditEventInput): Awaitable<MetricAuditEvent>;
  listRecent(limit?: number): Awaitable<readonly MetricAuditEvent[]>;
}

export interface PlatformModelPricing {
  readonly id: string;
  readonly provider: string;
  readonly model: string;
  readonly promptPricePer1k: string | number;
  readonly completionPricePer1k: string | number;
  readonly cachedInputPricePer1k: string | number;
  readonly reasoningPricePer1k: string | number;
  readonly batchPromptPricePer1k: string | number;
  readonly batchCompletionPricePer1k: string | number;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string | null;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export interface PlatformPricingStore {
  list(): Awaitable<readonly PlatformModelPricing[]>;
  save(input: PlatformModelPricing): Awaitable<PlatformModelPricing>;
}

export interface PlatformAlertRule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly type: string;
  readonly severity: string;
  readonly metric: string;
  readonly threshold: number;
  readonly windowMinutes: number;
  readonly enabled: boolean;
  readonly platformOnly: boolean;
  readonly tenantId?: string | null;
  readonly createdAt: string;
}

export interface PlatformAlertRuleStore {
  list(): Awaitable<readonly PlatformAlertRule[]>;
  save(input: PlatformAlertRule): Awaitable<PlatformAlertRule>;
  delete(id: string): Awaitable<boolean>;
}

export interface AdminTenantInput {
  readonly id?: string;
  readonly name: string;
  readonly status?: AdminTenantStatus;
  readonly monthlyBudgetUsd?: string;
}

export interface AdminAlertInput {
  readonly id?: string;
  readonly severity?: AdminAlertSeverity;
  readonly message: string;
  readonly target?: string;
}

export interface AdminSloInput {
  readonly id?: string;
  readonly name: string;
  readonly target: number;
  readonly actual?: number;
  readonly window: string;
}

export interface InMemoryAdminOperationsStoreOptions {
  readonly idFactory?: (kind: "tenant" | "alert" | "slo") => string;
  readonly now?: () => Date;
}

export interface KyselyAdminOperationsStoreOptions {
  readonly idFactory?: (kind: "tenant" | "alert" | "slo" | "cost_usage") => string;
  readonly now?: () => Date;
}

type AdminTenantRow = Selectable<AdminTenantTable>;
type AdminAlertRow = Selectable<AdminAlertTable>;
type AdminSloRow = Selectable<AdminSloTable>;
type AdminCostUsageRow = Selectable<AdminCostUsageTable>;
type AdminAuditRow = Selectable<AdminAuditTable>;
type AdminAuditInsert = Insertable<AdminAuditTable>;
type MetricAuditTrailRow = Selectable<MetricAuditTrailTable>;
type MetricAuditTrailInsert = Insertable<MetricAuditTrailTable>;
type ModelPricingRow = Selectable<ModelPricingTable>;
type ModelPricingInsert = Insertable<ModelPricingTable>;
type AlertRuleRow = Selectable<AlertRuleTable>;
type AlertRuleInsert = Insertable<AlertRuleTable>;
type AdminTenantInsert = Insertable<AdminTenantTable>;
type AdminAlertInsert = Insertable<AdminAlertTable>;
type AdminSloInsert = Insertable<AdminSloTable>;
type AdminCostUsageInsert = Insertable<AdminCostUsageTable>;

export class InMemoryAdminOperationsStore implements AdminOperationsStore {
  private readonly idFactory: (kind: "tenant" | "alert" | "slo") => string;
  private readonly now: () => Date;
  private readonly tenants = new Map<string, AdminTenant>();
  private readonly alerts = new Map<string, AdminAlert>();
  private readonly slos = new Map<string, AdminSlo>();
  private readonly costs: AdminCostUsage[] = [];

  constructor(options: InMemoryAdminOperationsStoreOptions = {}) {
    this.idFactory = options.idFactory ?? ((kind) => createRunId(kind));
    this.now = options.now ?? (() => new Date());
  }

  listTenants(): readonly AdminTenant[] {
    return [...this.tenants.values()].sort(compareById);
  }

  upsertTenant(input: AdminTenantInput): AdminTenant {
    const id = input.id ?? this.idFactory("tenant");
    const existing = this.tenants.get(id);
    const tenant: AdminTenant = {
      createdAt: existing?.createdAt ?? this.now(),
      id,
      ...(input.monthlyBudgetUsd ? { monthlyBudgetUsd: input.monthlyBudgetUsd } : {}),
      name: input.name,
      status: input.status ?? existing?.status ?? "active",
      updatedAt: this.now()
    };

    this.tenants.set(id, tenant);
    return tenant;
  }

  listAlerts(): readonly AdminAlert[] {
    return [...this.alerts.values()].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  }

  createAlert(input: AdminAlertInput): AdminAlert {
    const alert: AdminAlert = {
      createdAt: this.now(),
      id: input.id ?? this.idFactory("alert"),
      message: input.message,
      severity: input.severity ?? "warning",
      status: "open",
      ...(input.target ? { target: input.target } : {})
    };

    this.alerts.set(alert.id, alert);
    return alert;
  }

  acknowledgeAlert(id: string): AdminAlert | undefined {
    const existing = this.alerts.get(id);

    if (!existing) {
      return undefined;
    }

    const updated: AdminAlert = {
      ...existing,
      acknowledgedAt: this.now(),
      status: "acknowledged"
    };

    this.alerts.set(id, updated);
    return updated;
  }

  resolveAlert(id: string): AdminAlert | undefined {
    const existing = this.alerts.get(id);

    if (!existing) {
      return undefined;
    }

    const updated: AdminAlert = {
      ...existing,
      acknowledgedAt: existing.acknowledgedAt ?? this.now(),
      status: "resolved"
    };

    this.alerts.set(id, updated);
    return updated;
  }

  listSlos(): readonly AdminSlo[] {
    return [...this.slos.values()].sort(compareById);
  }

  upsertSlo(input: AdminSloInput): AdminSlo {
    const slo: AdminSlo = {
      id: input.id ?? this.idFactory("slo"),
      name: input.name,
      status: calculateSloStatus(input.target, input.actual),
      target: input.target,
      ...(input.actual !== undefined ? { actual: input.actual } : {}),
      updatedAt: this.now(),
      window: input.window
    };

    this.slos.set(slo.id, slo);
    return slo;
  }

  recordCost(input: AdminCostUsage): AdminCostSummary {
    this.costs.push(input);
    return this.costSummary();
  }

  costSummary(): AdminCostSummary {
    return {
      byModel: sumCosts(this.costs, "model"),
      byTenant: sumCosts(this.costs, "tenantId"),
      totalCostUsd: formatCost(this.costs.reduce((sum, item) => sum + Number(item.costUsd), 0))
    };
  }
}

export class InMemoryAdminAuditStore implements AdminAuditStore {
  private readonly audits = new Map<string, AdminAuditRecord>();
  private readonly idFactory: () => string;
  private readonly maxAudits: number;
  private readonly now: () => Date;

  constructor(options: {
    readonly idFactory?: () => string;
    readonly maxAudits?: number;
    readonly now?: () => Date;
  } = {}) {
    this.idFactory = options.idFactory ?? (() => createRunId("admin_audit"));
    this.maxAudits = Math.max(1, options.maxAudits ?? 50_000);
    this.now = options.now ?? (() => new Date());
  }

  record(input: AdminAuditInput): AdminAuditRecord {
    const record: AdminAuditRecord = {
      action: input.action.toUpperCase(),
      actor: input.actor,
      category: input.category,
      createdAt: this.now(),
      detail: input.detail ?? null,
      id: input.id ?? this.idFactory(),
      resourceId: input.resourceId ?? null,
      resourceType: input.resourceType ?? null
    };

    this.audits.set(record.id, record);
    trimOldestMap(this.audits, this.maxAudits);
    return record;
  }

  listRecent(limit = 1000): readonly AdminAuditRecord[] {
    return [...this.audits.values()]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, Math.max(1, limit));
  }
}

export class KyselyAdminAuditStore implements AdminAuditStore {
  private readonly idFactory: () => string;
  private readonly now: () => Date;

  constructor(
    private readonly db: Kysely<MuseDatabase>,
    options: { readonly idFactory?: () => string; readonly now?: () => Date } = {}
  ) {
    this.idFactory = options.idFactory ?? (() => createRunId("admin_audit"));
    this.now = options.now ?? (() => new Date());
  }

  async record(input: AdminAuditInput): Promise<AdminAuditRecord> {
    const row = await this.db
      .insertInto("admin_audits")
      .values(createAdminAuditInsert(input, { idFactory: this.idFactory, now: this.now }))
      .returningAll()
      .executeTakeFirstOrThrow();
    return mapAdminAuditRow(row);
  }

  async listRecent(limit = 1000): Promise<readonly AdminAuditRecord[]> {
    const rows = await this.db
      .selectFrom("admin_audits")
      .selectAll()
      .orderBy("created_at", "desc")
      .limit(Math.max(1, limit))
      .execute();
    return rows.map(mapAdminAuditRow);
  }
}

export class InMemoryMetricAuditEventStore implements MetricAuditEventStore {
  private readonly events: MetricAuditEvent[] = [];
  private readonly idFactory: () => string;
  private readonly maxEvents: number;
  private readonly now: () => Date;

  constructor(options: {
    readonly idFactory?: () => string;
    readonly maxEvents?: number;
    readonly now?: () => Date;
  } = {}) {
    this.idFactory = options.idFactory ?? (() => createRunId("metric_event"));
    this.maxEvents = Math.max(1, options.maxEvents ?? 50_000);
    this.now = options.now ?? (() => new Date());
  }

  record(input: MetricAuditEventInput): MetricAuditEvent {
    const event: MetricAuditEvent = {
      createdAt: this.now(),
      id: input.id ?? this.idFactory(),
      kind: input.kind,
      payload: input.payload,
      tenantId: input.tenantId
    };

    this.events.push(event);

    while (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    return event;
  }

  listRecent(limit = 1000): readonly MetricAuditEvent[] {
    return [...this.events]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, Math.max(1, limit));
  }
}

export class KyselyMetricAuditEventStore implements MetricAuditEventStore {
  private readonly idFactory: () => string;
  private readonly now: () => Date;

  constructor(
    private readonly db: Kysely<MuseDatabase>,
    options: { readonly idFactory?: () => string; readonly now?: () => Date } = {}
  ) {
    this.idFactory = options.idFactory ?? (() => createRunId("metric_event"));
    this.now = options.now ?? (() => new Date());
  }

  async record(input: MetricAuditEventInput): Promise<MetricAuditEvent> {
    const event: MetricAuditEvent = {
      createdAt: this.now(),
      id: input.id ?? this.idFactory(),
      kind: input.kind,
      payload: input.payload,
      tenantId: input.tenantId
    };

    await this.db
      .insertInto("metric_audit_trail")
      .values(createMetricAuditTrailInsert(event))
      .executeTakeFirstOrThrow();

    return event;
  }

  async listRecent(limit = 1000): Promise<readonly MetricAuditEvent[]> {
    const rows = await this.db
      .selectFrom("metric_audit_trail")
      .selectAll()
      .orderBy("time", "desc")
      .limit(Math.max(1, limit))
      .execute();
    return rows.map(mapMetricAuditTrailRow);
  }
}

export class InMemoryPlatformPricingStore implements PlatformPricingStore {
  private readonly pricing = new Map<string, PlatformModelPricing>();

  list(): readonly PlatformModelPricing[] {
    return [...this.pricing.values()].sort(comparePricingDesc);
  }

  save(input: PlatformModelPricing): PlatformModelPricing {
    this.pricing.set(input.id, input);
    return input;
  }
}

export class KyselyPlatformPricingStore implements PlatformPricingStore {
  constructor(private readonly db: Kysely<MuseDatabase>) {}

  async list(): Promise<readonly PlatformModelPricing[]> {
    const rows = await this.db
      .selectFrom("model_pricing")
      .selectAll()
      .orderBy("effective_from", "desc")
      .execute();
    return rows.map(mapModelPricingRow);
  }

  async save(input: PlatformModelPricing): Promise<PlatformModelPricing> {
    const row = createModelPricingInsert(input);
    const saved = await this.db
      .insertInto("model_pricing")
      .values(row)
      .onConflict((oc) => oc.column("id").doUpdateSet({
        batch_completion_price_per_1k: row.batch_completion_price_per_1k,
        batch_prompt_price_per_1k: row.batch_prompt_price_per_1k,
        cached_input_price_per_1k: row.cached_input_price_per_1k,
        completion_price_per_1k: row.completion_price_per_1k,
        effective_from: row.effective_from,
        effective_to: row.effective_to,
        model: row.model,
        prompt_price_per_1k: row.prompt_price_per_1k,
        provider: row.provider,
        reasoning_price_per_1k: row.reasoning_price_per_1k
      }))
      .returningAll()
      .executeTakeFirstOrThrow();
    return mapModelPricingRow(saved);
  }
}

export class InMemoryPlatformAlertRuleStore implements PlatformAlertRuleStore {
  private readonly rules = new Map<string, PlatformAlertRule>();

  list(): readonly PlatformAlertRule[] {
    return [...this.rules.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  save(input: PlatformAlertRule): PlatformAlertRule {
    this.rules.set(input.id, input);
    return input;
  }

  delete(id: string): boolean {
    return this.rules.delete(id);
  }
}

export class KyselyPlatformAlertRuleStore implements PlatformAlertRuleStore {
  constructor(private readonly db: Kysely<MuseDatabase>) {}

  async list(): Promise<readonly PlatformAlertRule[]> {
    const rows = await this.db.selectFrom("alert_rules").selectAll().orderBy("name", "asc").execute();
    return rows.map(mapAlertRuleRow);
  }

  async save(input: PlatformAlertRule): Promise<PlatformAlertRule> {
    const row = createAlertRuleInsert(input);
    const saved = await this.db
      .insertInto("alert_rules")
      .values(row)
      .onConflict((oc) => oc.column("id").doUpdateSet({
        description: row.description,
        enabled: row.enabled,
        metric: row.metric,
        name: row.name,
        platform_only: row.platform_only,
        severity: row.severity,
        tenant_id: row.tenant_id,
        threshold: row.threshold,
        type: row.type,
        window_minutes: row.window_minutes
      }))
      .returningAll()
      .executeTakeFirstOrThrow();
    return mapAlertRuleRow(saved);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.deleteFrom("alert_rules").where("id", "=", id).executeTakeFirst();
    return Number(result.numDeletedRows ?? 0) > 0;
  }
}

export class KyselyAdminOperationsStore implements AdminOperationsStore {
  private readonly idFactory: (kind: "tenant" | "alert" | "slo" | "cost_usage") => string;
  private readonly now: () => Date;

  constructor(
    private readonly db: Kysely<MuseDatabase>,
    options: KyselyAdminOperationsStoreOptions = {}
  ) {
    this.idFactory = options.idFactory ?? ((kind) => createRunId(kind));
    this.now = options.now ?? (() => new Date());
  }

  async listTenants(): Promise<readonly AdminTenant[]> {
    const rows = await this.db.selectFrom("admin_tenants").selectAll().orderBy("id", "asc").execute();
    return rows.map(mapAdminTenantRow);
  }

  async upsertTenant(input: AdminTenantInput): Promise<AdminTenant> {
    const row = createAdminTenantInsert(input, {
      idFactory: this.idFactory,
      now: this.now
    });
    const saved = await this.db
      .insertInto("admin_tenants")
      .values(row)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          monthly_budget_usd: row.monthly_budget_usd,
          name: row.name,
          status: row.status,
          updated_at: row.updated_at
        })
      )
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapAdminTenantRow(saved);
  }

  async listAlerts(): Promise<readonly AdminAlert[]> {
    const rows = await this.db
      .selectFrom("admin_alerts")
      .selectAll()
      .orderBy("created_at", "desc")
      .execute();
    return rows.map(mapAdminAlertRow);
  }

  async createAlert(input: AdminAlertInput): Promise<AdminAlert> {
    const row = await this.db
      .insertInto("admin_alerts")
      .values(createAdminAlertInsert(input, {
        idFactory: this.idFactory,
        now: this.now
      }))
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapAdminAlertRow(row);
  }

  async acknowledgeAlert(id: string): Promise<AdminAlert | undefined> {
    const row = await this.db
      .updateTable("admin_alerts")
      .set({
        acknowledged_at: this.now(),
        status: "acknowledged"
      })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();

    return row ? mapAdminAlertRow(row) : undefined;
  }

  async resolveAlert(id: string): Promise<AdminAlert | undefined> {
    const row = await this.db
      .updateTable("admin_alerts")
      .set({
        acknowledged_at: this.now(),
        status: "resolved"
      })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();

    return row ? mapAdminAlertRow(row) : undefined;
  }

  async listSlos(): Promise<readonly AdminSlo[]> {
    const rows = await this.db.selectFrom("admin_slos").selectAll().orderBy("id", "asc").execute();
    return rows.map(mapAdminSloRow);
  }

  async upsertSlo(input: AdminSloInput): Promise<AdminSlo> {
    const row = createAdminSloInsert(input, {
      idFactory: this.idFactory,
      now: this.now
    });
    const saved = await this.db
      .insertInto("admin_slos")
      .values(row)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          actual: row.actual,
          name: row.name,
          status: row.status,
          target: row.target,
          updated_at: row.updated_at,
          window: row.window
        })
      )
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapAdminSloRow(saved);
  }

  async recordCost(input: AdminCostUsage): Promise<AdminCostSummary> {
    await this.db
      .insertInto("admin_cost_usage")
      .values(createAdminCostUsageInsert(input, {
        idFactory: this.idFactory,
        now: this.now
      }))
      .executeTakeFirstOrThrow();

    return this.costSummary();
  }

  async costSummary(): Promise<AdminCostSummary> {
    const [total, byModel, byTenant] = await Promise.all([
      this.costTotal(),
      this.costBy("model"),
      this.costBy("tenant_id")
    ]);

    return {
      byModel,
      byTenant,
      totalCostUsd: total
    };
  }

  private async costTotal(): Promise<string> {
    const row = await this.db
      .selectFrom("admin_cost_usage")
      .select((eb) => eb.fn.sum<string>("cost_usd").as("cost"))
      .executeTakeFirst();

    return formatCost(Number(row?.cost ?? 0));
  }

  private async costBy(column: "model" | "tenant_id"): Promise<Readonly<Record<string, string>>> {
    const rows = await this.db
      .selectFrom("admin_cost_usage")
      .select(column)
      .select((eb) => eb.fn.sum<string>("cost_usd").as("cost"))
      .groupBy(column)
      .execute();

    return Object.fromEntries(rows.map((row) => [String(row[column] ?? "unknown"), formatCost(Number(row.cost ?? 0))]));
  }
}

export function createAdminTenantInsert(
  input: AdminTenantInput,
  options: Required<KyselyAdminOperationsStoreOptions>
): AdminTenantInsert {
  const now = options.now();

  return {
    created_at: now,
    id: input.id ?? options.idFactory("tenant"),
    monthly_budget_usd: input.monthlyBudgetUsd ?? null,
    name: input.name,
    status: input.status ?? "active",
    updated_at: now
  };
}

export function createAdminAlertInsert(
  input: AdminAlertInput,
  options: Required<KyselyAdminOperationsStoreOptions>
): AdminAlertInsert {
  return {
    acknowledged_at: null,
    created_at: options.now(),
    id: input.id ?? options.idFactory("alert"),
    message: input.message,
    severity: input.severity ?? "warning",
    status: "open",
    target: input.target ?? null
  };
}

export function createAdminSloInsert(
  input: AdminSloInput,
  options: Required<KyselyAdminOperationsStoreOptions>
): AdminSloInsert {
  return {
    actual: input.actual ?? null,
    id: input.id ?? options.idFactory("slo"),
    name: input.name,
    status: calculateSloStatus(input.target, input.actual),
    target: input.target,
    updated_at: options.now(),
    window: input.window
  };
}

export function createAdminCostUsageInsert(
  input: AdminCostUsage,
  options: Required<KyselyAdminOperationsStoreOptions>
): AdminCostUsageInsert {
  return {
    cost_usd: input.costUsd,
    created_at: options.now(),
    id: options.idFactory("cost_usage"),
    model: input.model ?? null,
    tenant_id: input.tenantId ?? null
  };
}

export function mapAdminTenantRow(row: AdminTenantRow): AdminTenant {
  return {
    createdAt: toDate(row.created_at ?? new Date(0)),
    id: row.id,
    monthlyBudgetUsd: row.monthly_budget_usd ?? undefined,
    name: row.name,
    status: row.status,
    updatedAt: toDate(row.updated_at)
  };
}

export function mapAdminAlertRow(row: AdminAlertRow): AdminAlert {
  return {
    acknowledgedAt: row.acknowledged_at ? toDate(row.acknowledged_at) : undefined,
    createdAt: toDate(row.created_at ?? new Date(0)),
    id: row.id,
    message: row.message,
    severity: row.severity,
    status: row.status,
    target: row.target ?? undefined
  };
}

export function mapAdminSloRow(row: AdminSloRow): AdminSlo {
  return {
    actual: row.actual ?? undefined,
    id: row.id,
    name: row.name,
    status: row.status,
    target: row.target,
    updatedAt: toDate(row.updated_at),
    window: row.window
  };
}

export function mapAdminCostUsageRow(row: AdminCostUsageRow): AdminCostUsage {
  return {
    costUsd: row.cost_usd,
    model: row.model ?? undefined,
    tenantId: row.tenant_id ?? undefined
  };
}

export function createAdminAuditInsert(
  input: AdminAuditInput,
  options: { readonly idFactory: () => string; readonly now: () => Date }
): AdminAuditInsert {
  return {
    action: input.action.toUpperCase(),
    actor: input.actor,
    category: input.category,
    created_at: options.now(),
    detail: input.detail ?? null,
    id: input.id ?? options.idFactory(),
    resource_id: input.resourceId ?? null,
    resource_type: input.resourceType ?? null
  };
}

export function mapAdminAuditRow(row: AdminAuditRow | AdminAuditInsert): AdminAuditRecord {
  return {
    action: row.action.toUpperCase(),
    actor: row.actor,
    category: row.category,
    createdAt: toDate(row.created_at ?? new Date(0)),
    detail: row.detail ?? null,
    id: row.id,
    resourceId: row.resource_id ?? null,
    resourceType: row.resource_type ?? null
  };
}

export function createMetricAuditTrailInsert(event: MetricAuditEvent): MetricAuditTrailInsert {
  return {
    actor_email: null,
    actor_id: null,
    detail: event.payload,
    event_type: event.kind,
    resource_id: event.id,
    resource_type: "metric_event",
    source_ip: null,
    tenant_id: event.tenantId ?? "default",
    time: event.createdAt
  };
}

export function mapMetricAuditTrailRow(row: MetricAuditTrailRow | MetricAuditTrailInsert): MetricAuditEvent {
  return {
    createdAt: toDate(row.time ?? new Date(0)),
    id: row.resource_id ?? createRunId("metric_event"),
    kind: row.event_type,
    payload: jsonObject(row.detail),
    tenantId: row.tenant_id
  };
}

export function createModelPricingInsert(input: PlatformModelPricing): ModelPricingInsert {
  return {
    batch_completion_price_per_1k: input.batchCompletionPricePer1k,
    batch_prompt_price_per_1k: input.batchPromptPricePer1k,
    cached_input_price_per_1k: input.cachedInputPricePer1k,
    completion_price_per_1k: input.completionPricePer1k,
    effective_from: input.effectiveFrom,
    effective_to: input.effectiveTo ?? null,
    id: input.id,
    model: input.model,
    prompt_price_per_1k: input.promptPricePer1k,
    provider: input.provider,
    reasoning_price_per_1k: input.reasoningPricePer1k
  };
}

export function mapModelPricingRow(row: ModelPricingRow | ModelPricingInsert): PlatformModelPricing {
  const effectiveFrom = toDate(row.effective_from ?? new Date(0)).toISOString();
  const effectiveTo = row.effective_to ? toDate(row.effective_to).toISOString() : null;

  return {
    batchCompletionPricePer1k: row.batch_completion_price_per_1k ?? 0,
    batchPromptPricePer1k: row.batch_prompt_price_per_1k ?? 0,
    cachedInputPricePer1k: row.cached_input_price_per_1k ?? 0,
    completionPricePer1k: row.completion_price_per_1k ?? 0,
    createdAt: effectiveFrom,
    effectiveFrom,
    effectiveTo,
    id: row.id,
    model: row.model,
    promptPricePer1k: row.prompt_price_per_1k ?? 0,
    provider: row.provider,
    reasoningPricePer1k: row.reasoning_price_per_1k ?? 0,
    updatedAt: effectiveFrom
  };
}

export function createAlertRuleInsert(input: PlatformAlertRule): AlertRuleInsert {
  return {
    created_at: input.createdAt,
    description: input.description,
    enabled: input.enabled,
    id: input.id,
    metric: input.metric,
    name: input.name,
    platform_only: input.platformOnly,
    severity: input.severity,
    tenant_id: input.tenantId ?? null,
    threshold: input.threshold,
    type: input.type,
    window_minutes: input.windowMinutes
  };
}

export function mapAlertRuleRow(row: AlertRuleRow | AlertRuleInsert): PlatformAlertRule {
  return {
    createdAt: toDate(row.created_at ?? new Date(0)).toISOString(),
    description: row.description,
    enabled: row.enabled,
    id: row.id,
    metric: row.metric,
    name: row.name,
    platformOnly: row.platform_only,
    severity: row.severity,
    tenantId: row.tenant_id ?? null,
    threshold: row.threshold,
    type: row.type,
    windowMinutes: row.window_minutes
  };
}

function calculateSloStatus(target: number, actual: number | undefined): AdminSloStatus {
  if (actual === undefined || actual >= target) {
    return "healthy";
  }

  return actual >= target * 0.95 ? "at_risk" : "violated";
}

function sumCosts(items: readonly AdminCostUsage[], key: "model" | "tenantId"): Readonly<Record<string, string>> {
  const sums = new Map<string, number>();

  for (const item of items) {
    const value = item[key] ?? "unknown";
    sums.set(value, (sums.get(value) ?? 0) + Number(item.costUsd));
  }

  return Object.fromEntries([...sums.entries()].map(([name, value]) => [name, formatCost(value)]));
}

function formatCost(value: number): string {
  return Number.isFinite(value) ? value.toFixed(8) : "0.00000000";
}

function compareById(left: { readonly id: string }, right: { readonly id: string }): number {
  return left.id.localeCompare(right.id);
}

function comparePricingDesc(left: PlatformModelPricing, right: PlatformModelPricing): number {
  return String(right.effectiveFrom ?? right.createdAt).localeCompare(String(left.effectiveFrom ?? left.createdAt));
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function trimOldestMap<K, V>(map: Map<K, V>, maxSize: number): void {
  while (map.size > maxSize) {
    const oldest = map.keys().next().value as K | undefined;

    if (oldest === undefined) {
      return;
    }

    map.delete(oldest);
  }
}

function jsonObject(value: unknown): JsonObject {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return jsonObject(parsed);
    } catch {
      return {};
    }
  }

  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}
