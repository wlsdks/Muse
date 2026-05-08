/**
 * Reactor-compat admin platform-infrastructure routes extracted from
 * reactor-compat-routes.ts. Covers the slice of /api/admin that deals with
 * runtime-settings, ops dashboard, capabilities, platform health/doctor,
 * cache, pricing, and vector-store stats.
 *
 * Wires:
 *   - GET/PUT/DELETE /api/admin/settings (+ /:key)
 *   - POST /api/admin/settings/refresh
 *   - GET /api/ops/dashboard
 *   - GET /api/ops/metrics/names
 *   - GET /api/admin/capabilities
 *   - GET /api/admin/platform/health
 *   - GET /api/admin/doctor (+ /summary)
 *   - GET /api/admin/platform/cache/stats
 *   - GET/POST /api/admin/platform/pricing
 *   - GET /api/admin/platform/vectorstore/stats
 *   - POST /api/admin/platform/cache/{invalidate,invalidate-key,invalidate-by-pattern}
 */

import type { FastifyInstance } from "fastify";
import {
  adminCapabilitiesResponse,
  adminDiagnostic,
  countDocuments,
  dashboardSummary,
  errorResponse,
  listPlatformPricing,
  nowIso,
  numberOrString,
  parseRuntimeSettingType,
  platformHealthDashboard,
  readAuthUserId,
  readBodyNullableString,
  readBodyString,
  readNumber,
  savePlatformPricing,
  toBody,
  toJsonObject,
  toReactorRuntimeSetting,
  type ReactorCompatibilityRouteOptions
} from "./reactor-compat-routes.js";

export function registerAdminPlatformCompatRoutes(server: FastifyInstance, options: ReactorCompatibilityRouteOptions): void {
  registerRuntimeSettingsRoutes(server, options);
  registerOpsAndCapabilitiesRoutes(server, options);
  registerPlatformHealthRoutes(server, options);
  registerPlatformPricingRoutes(server, options);
  registerPlatformCacheInvalidationRoutes(server, options);
}

function registerRuntimeSettingsRoutes(server: FastifyInstance, options: ReactorCompatibilityRouteOptions): void {
  server.get("/api/admin/settings", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    return (await options.runtimeSettings.list()).map(toReactorRuntimeSetting);
  });
  server.get("/api/admin/settings/:key", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const { key } = request.params as { readonly key: string };
    const setting = await options.runtimeSettings.find(key);
    return setting ? toReactorRuntimeSetting(setting) : reply.status(404).send(errorResponse(`설정을 찾을 수 없습니다: ${key}`));
  });
  server.put("/api/admin/settings/:key", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const { key } = request.params as { readonly key: string };
    const body = toBody(request.body);
    const value = readBodyString(body, "value");

    if (value === undefined) {
      return reply.status(400).send(errorResponse("요청 형식이 올바르지 않습니다"));
    }

    await options.runtimeSettings.set({
      category: readBodyString(body, "category"),
      description: readBodyNullableString(body, "description"),
      key,
      type: parseRuntimeSettingType(body.type),
      updatedBy: readAuthUserId(request) ?? null,
      value
    });

    return {
      key,
      status: "updated",
      value
    };
  });
  server.delete("/api/admin/settings/:key", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const { key } = request.params as { readonly key: string };
    await options.runtimeSettings.delete(key);
    return reply.status(204).send();
  });
  server.post("/api/admin/settings/refresh", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    options.runtimeSettings.refreshCache();
    return { status: "cache_refreshed" };
  });
}

function registerOpsAndCapabilitiesRoutes(server: FastifyInstance, options: ReactorCompatibilityRouteOptions): void {
  server.get("/api/ops/dashboard", async (request, reply) => {
    if (!options.authorizeAnyAdmin(request, reply)) {
      return reply;
    }

    return dashboardSummary(options);
  });
  server.get("/api/ops/metrics/names", async (request, reply) => {
    if (!options.authorizeAnyAdmin(request, reply)) {
      return reply;
    }

    return ["agent_run", "tool_call", "cache", "scheduler"];
  });
  server.get("/api/admin/capabilities", async (request, reply) => {
    if (!options.authorizeAnyAdmin(request, reply)) {
      return reply;
    }

    return adminCapabilitiesResponse(options);
  });
}

function registerPlatformHealthRoutes(server: FastifyInstance, options: ReactorCompatibilityRouteOptions): void {
  server.get("/api/admin/platform/health", async (request, reply) => {
    if (!options.authorizeAnyAdmin(request, reply)) {
      return reply;
    }

    return platformHealthDashboard(options);
  });
  server.get("/api/admin/doctor", async (request, reply) => adminDiagnostic(request, reply, options, "report"));
  server.get("/api/admin/doctor/summary", async (request, reply) => adminDiagnostic(request, reply, options, "summary"));
  server.get("/api/admin/platform/cache/stats", async (request, reply) => {
    if (!options.authorizeAnyAdmin(request, reply)) {
      return reply;
    }

    const snapshot = toJsonObject(options.admin?.cache?.metrics?.snapshot());
    const exact = readNumber(snapshot.exactHits, 0);
    const semantic = readNumber(snapshot.semanticHits, 0);
    const misses = readNumber(snapshot.misses, 0);
    const total = exact + semantic + misses;

    return {
      config: {
        cacheableTemperature: 1,
        maxCandidates: 50,
        maxSize: 1000,
        similarityThreshold: 0.92,
        ttlMinutes: 60
      },
      enabled: Boolean(options.admin?.cache?.responseCache),
      hitRate: total > 0 ? (exact + semantic) / total : 0,
      semanticEnabled: false,
      totalExactHits: exact,
      totalMisses: misses,
      totalSemanticHits: semantic
    };
  });
  server.get("/api/admin/platform/vectorstore/stats", async (request, reply) => {
    if (!options.authorizeAnyAdmin(request, reply)) {
      return reply;
    }

    return {
      available: true,
      documentCount: await countDocuments(options)
    };
  });
}

function registerPlatformPricingRoutes(server: FastifyInstance, options: ReactorCompatibilityRouteOptions): void {
  server.get("/api/admin/platform/pricing", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    return listPlatformPricing(options);
  });
  server.post("/api/admin/platform/pricing", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const body = toJsonObject(request.body);
    const provider = readBodyString(body, "provider");
    const model = readBodyString(body, "model");

    if (!provider || !model) {
      return reply.status(400).send({
        code: "INVALID_MODEL_PRICING",
        message: "Body must include provider and model"
      });
    }

    const id = readBodyString(body, "id") ?? `${provider}:${model}`;
    return savePlatformPricing(options, {
      batchCompletionPricePer1k: numberOrString(body.batchCompletionPricePer1k, 0),
      batchPromptPricePer1k: numberOrString(body.batchPromptPricePer1k, 0),
      cachedInputPricePer1k: numberOrString(body.cachedInputPricePer1k, 0),
      completionPricePer1k: numberOrString(body.completionPricePer1k, 0),
      effectiveFrom: readBodyString(body, "effectiveFrom") ?? nowIso(),
      effectiveTo: readBodyNullableString(body, "effectiveTo") ?? null,
      id,
      model,
      promptPricePer1k: numberOrString(body.promptPricePer1k, 0),
      provider,
      reasoningPricePer1k: numberOrString(body.reasoningPricePer1k, 0)
    });
  });
}

function registerPlatformCacheInvalidationRoutes(server: FastifyInstance, options: ReactorCompatibilityRouteOptions): void {
  server.post("/api/admin/platform/cache/invalidate", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const cache = options.admin?.cache?.responseCache;

    if (!cache) {
      return {
        cacheEnabled: false,
        invalidated: false,
        message: "Response cache is disabled"
      };
    }

    cache.invalidateAll();
    return {
      cacheEnabled: true,
      invalidated: true,
      message: "Response cache invalidated"
    };
  });
  server.post("/api/admin/platform/cache/invalidate-key", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const key = readBodyString(request.body, "key") ?? "";

    if (key.trim().length === 0) {
      return reply.status(400).send(errorResponse("key is required"));
    }

    const cache = options.admin?.cache?.responseCache;
    return {
      cacheEnabled: Boolean(cache),
      invalidated: cache?.invalidate?.(key) ?? false
    };
  });
  server.post("/api/admin/platform/cache/invalidate-by-pattern", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const pattern = readBodyString(request.body, "pattern") ?? "";

    if (pattern.trim().length === 0) {
      return reply.status(400).send(errorResponse("pattern is required"));
    }

    const cache = options.admin?.cache?.responseCache;
    return {
      cacheEnabled: Boolean(cache),
      invalidatedCount: cache?.invalidateByPattern?.(pattern) ?? 0
    };
  });
}
