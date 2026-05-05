import { createRunId } from "@muse/shared";

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
  listSlos(): Awaitable<readonly AdminSlo[]>;
  upsertSlo(input: AdminSloInput): Awaitable<AdminSlo>;
  recordCost(input: AdminCostUsage): Awaitable<AdminCostSummary>;
  costSummary(): Awaitable<AdminCostSummary>;
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
