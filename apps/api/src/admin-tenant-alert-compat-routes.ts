/**
 * Reactor-compat admin tenant + platform-alert routes extracted from
 * reactor-compat-routes.ts.
 *
 * Wires:
 *   - GET/POST /api/admin/platform/tenants
 *   - GET /api/admin/platform/tenants/:id
 *   - POST /api/admin/platform/tenants/:id/{activate,suspend}
 *   - GET /api/admin/platform/alerts (open only)
 *   - GET/POST /api/admin/platform/alerts/rules
 *   - DELETE /api/admin/platform/alerts/rules/:id
 *   - POST /api/admin/platform/alerts/evaluate
 *   - POST /api/admin/platform/alerts/:id/resolve
 */

import { createRunId } from "@muse/shared";
import type { FastifyInstance } from "fastify";
import {
  deletePlatformAlertRule,
  errorResponse,
  listPlatformAlertRules,
  nowIso,
  readBodyNullableString,
  readBodyString,
  readBoolean,
  readNumber,
  recordAdminAudit,
  savePlatformAlertRule,
  stringField,
  toJsonObject,
  toPlatformAlertRuleResponse,
  updateTenantStatus,
  type ReactorCompatibilityRouteOptions
} from "./reactor-compat-routes.js";

export function registerAdminTenantAlertCompatRoutes(server: FastifyInstance, options: ReactorCompatibilityRouteOptions): void {
  registerTenantRoutes(server, options);
  registerPlatformAlertRoutes(server, options);
}

function registerTenantRoutes(server: FastifyInstance, options: ReactorCompatibilityRouteOptions): void {
  server.get("/api/admin/platform/tenants", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    return options.admin?.operations?.listTenants() ?? [];
  });
  server.post("/api/admin/platform/tenants", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const name = readBodyString(request.body, "name");

    if (!name) {
      return reply.status(400).send(errorResponse("Invalid request"));
    }

    return options.admin?.operations?.upsertTenant({
      id: readBodyString(request.body, "id"),
      monthlyBudgetUsd: readBodyString(request.body, "monthlyBudgetUsd"),
      name
    }) ?? reply.status(404).send({ code: "ADMIN_OPERATIONS_UNAVAILABLE", message: "Admin store missing" });
  });
  server.get("/api/admin/platform/tenants/:id", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const { id } = request.params as { readonly id: string };
    const tenants = await (options.admin?.operations?.listTenants() ?? []);
    const tenant = tenants.find((item) => item.id === id);
    return tenant ?? reply.status(404).send(errorResponse(`Tenant not found: ${id}`));
  });
  server.post("/api/admin/platform/tenants/:id/activate", async (request, reply) =>
    updateTenantStatus(request, reply, options, "active")
  );
  server.post("/api/admin/platform/tenants/:id/suspend", async (request, reply) =>
    updateTenantStatus(request, reply, options, "suspended")
  );
}

function registerPlatformAlertRoutes(server: FastifyInstance, options: ReactorCompatibilityRouteOptions): void {
  server.get("/api/admin/platform/alerts", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const alerts = await (options.admin?.operations?.listAlerts() ?? []);
    return alerts.filter((alert) => alert.status === "open");
  });
  server.get("/api/admin/platform/alerts/rules", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    return (await listPlatformAlertRules(options)).map(toPlatformAlertRuleResponse);
  });
  server.post("/api/admin/platform/alerts/rules", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const body = toJsonObject(request.body);
    const name = readBodyString(body, "name");
    const metric = readBodyString(body, "metric");

    if (!name || !metric) {
      return reply.status(400).send(errorResponse("Body must include name and metric"));
    }

    const saved = await savePlatformAlertRule(options, {
      createdAt: readBodyString(body, "createdAt") ?? nowIso(),
      description: readBodyString(body, "description") ?? "",
      enabled: readBoolean(body.enabled, true),
      id: readBodyString(body, "id") ?? createRunId("alert_rule"),
      metric,
      name,
      platformOnly: readBoolean(body.platformOnly, false),
      severity: readBodyString(body, "severity") ?? "WARNING",
      tenantId: readBodyNullableString(body, "tenantId") ?? null,
      threshold: readNumber(body.threshold, 0),
      type: readBodyString(body, "type") ?? "STATIC_THRESHOLD",
      windowMinutes: readNumber(body.windowMinutes, 15)
    });

    await recordAdminAudit(request, options, {
      action: "RULE_UPSERT",
      category: "platform_alert",
      resourceId: stringField(saved.id, ""),
      resourceType: "alert_rule"
    });

    return toPlatformAlertRuleResponse(saved);
  });
  server.delete("/api/admin/platform/alerts/rules/:id", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const { id } = request.params as { readonly id: string };
    if (!(await deletePlatformAlertRule(options, id))) {
      return reply.status(404).send(errorResponse(`Alert rule not found: ${id}`));
    }

    await recordAdminAudit(request, options, {
      action: "RULE_DELETE",
      category: "platform_alert",
      resourceId: id,
      resourceType: "alert_rule"
    });

    return reply.status(204).send();
  });
  server.post("/api/admin/platform/alerts/evaluate", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    await recordAdminAudit(request, options, {
      action: "ALERT_EVALUATE",
      category: "platform_alert",
      resourceType: "alert_rule_set"
    });

    return { status: "evaluation complete" };
  });
  server.post("/api/admin/platform/alerts/:id/resolve", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const { id } = request.params as { readonly id: string };
    await options.admin?.operations?.resolveAlert(id);
    await recordAdminAudit(request, options, {
      action: "ALERT_RESOLVE",
      category: "platform_alert",
      resourceId: id,
      resourceType: "alert"
    });
    return reply.status(200).send();
  });
}
