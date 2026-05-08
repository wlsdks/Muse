/**
 * Reactor-compat tenant operations + platform alert response shape +
 * the static reactor prompt-section keys list, extracted from
 * reactor-compat-routes.ts.
 */

import type { JsonObject } from "@muse/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  errorResponse,
  nowIso,
  nullableStringResponse,
  readBoolean,
  readNumber,
  stringField,
  type ReactorCompatibilityRouteOptions
} from "./reactor-compat-routes.js";

export function reactorPromptSectionKeys(): string[] {
  return [
    "accuracy",
    "cross-tool",
    "critical",
    "domain:aggregate",
    "domain:marketing",
    "domain:onboarding",
    "domain:policy",
    "domain:summon",
    "domain:workspace",
    "format-slack",
    "identity",
    "proactive",
    "rules",
    "safety",
    "tools",
    "workflow:ask",
    "workflow:search"
  ];
}

export async function updateTenantStatus(
  request: FastifyRequest,
  reply: FastifyReply,
  options: ReactorCompatibilityRouteOptions,
  status: "active" | "suspended"
) {
  if (!options.authorizeAdmin(request, reply)) {
    return reply;
  }

  const { id } = request.params as { readonly id: string };
  const tenants = await (options.admin?.operations?.listTenants() ?? []);
  const tenant = tenants.find((item) => item.id === id);

  if (!tenant) {
    return reply.status(404).send(errorResponse(`Tenant not found: ${id}`));
  }

  return options.admin?.operations?.upsertTenant({
    id,
    monthlyBudgetUsd: tenant.monthlyBudgetUsd,
    name: tenant.name,
    status
  });
}

export async function tenantSummary(
  request: FastifyRequest,
  reply: FastifyReply,
  options: ReactorCompatibilityRouteOptions
) {
  if (!options.authorizeAnyAdmin(request, reply)) {
    return reply;
  }

  const [tenants, alerts, slos, cost] = await Promise.all([
    options.admin?.operations?.listTenants() ?? [],
    options.admin?.operations?.listAlerts() ?? [],
    options.admin?.operations?.listSlos() ?? [],
    options.admin?.operations?.costSummary() ?? { byModel: {}, byTenant: {}, totalCostUsd: "0.00000000" }
  ]);

  return { alerts, cost, slos, tenants };
}

export function toPlatformAlertRuleResponse(record: JsonObject): JsonObject {
  return {
    createdAt: stringField(record.createdAt, nowIso()),
    description: stringField(record.description, ""),
    enabled: readBoolean(record.enabled, true),
    id: stringField(record.id, ""),
    metric: stringField(record.metric, ""),
    name: stringField(record.name, ""),
    platformOnly: readBoolean(record.platformOnly, false),
    severity: stringField(record.severity, "WARNING"),
    tenantId: nullableStringResponse(record.tenantId),
    threshold: readNumber(record.threshold, 0),
    type: stringField(record.type, "STATIC_THRESHOLD"),
    windowMinutes: readNumber(record.windowMinutes, 15)
  };
}
