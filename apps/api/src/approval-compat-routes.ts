/**
 * Reactor-compat approval routes extracted from reactor-compat-routes.ts.
 *
 * Wires:
 *   - GET /api/approvals (admin sees all, non-admin sees own)
 *   - GET /api/approvals/pending (raw list)
 *   - POST /api/approvals/:id/approve (admin only, optional modifiedArguments)
 *   - POST /api/approvals/:id/reject (admin only, ≤500-char reason)
 */

import type { PendingApprovalStore } from "@muse/runtime-state";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  clampLimit,
  errorResponse,
  isAdminLikeRequest,
  isRecord,
  readAuthUserId,
  readBodyNullableString,
  readQueryInteger,
  requirePendingApprovalStore,
  toBody,
  toJsonObject,
  validationErrorResponse,
  type ReactorCompatibilityRouteOptions
} from "./reactor-compat-routes.js";

export function registerApprovalCompatibilityRoutes(server: FastifyInstance, options: ReactorCompatibilityRouteOptions): void {
  server.get("/api/approvals", async (request, reply) => {
    const store = requirePendingApprovalStore(options, reply);

    if (!store) {
      return reply;
    }

    const offset = readQueryInteger(request, "offset", 0);
    const limit = readQueryInteger(request, "limit", 50);
    const items = await listVisiblePendingApprovals(store, request, reply);

    if (!items) {
      return reply;
    }

    const safeOffset = Math.max(0, offset);
    const safeLimit = clampLimit(limit);
    const paged = items.slice(safeOffset, safeOffset + safeLimit);

    return {
      items: paged,
      limit: safeLimit,
      offset: safeOffset,
      total: items.length
    };
  });

  server.get("/api/approvals/pending", async (request, reply) => {
    const store = requirePendingApprovalStore(options, reply);

    if (!store) {
      return reply;
    }

    const items = await listVisiblePendingApprovals(store, request, reply);
    return items ?? reply;
  });

  server.post("/api/approvals/:id/approve", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const store = requirePendingApprovalStore(options, reply);

    if (!store) {
      return reply;
    }

    const { id } = request.params as { readonly id: string };
    const modifiedArguments = toBody(request.body).modifiedArguments;
    const success = await store.approve(id, isRecord(modifiedArguments) ? toJsonObject(modifiedArguments) : undefined);
    return {
      message: success ? "Approved" : "Approval not found or already resolved",
      success
    };
  });

  server.post("/api/approvals/:id/reject", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const store = requirePendingApprovalStore(options, reply);

    if (!store) {
      return reply;
    }

    const { id } = request.params as { readonly id: string };
    const reason = readBodyNullableString(request.body, "reason") ?? undefined;

    if (reason && reason.length > 500) {
      return reply.status(400).send(validationErrorResponse({ reason: "reason 은 500자 이하여야 합니다" }));
    }

    const success = await store.reject(id, reason);
    return {
      message: success ? "Rejected" : "Approval not found or already resolved",
      success
    };
  });
}

async function listVisiblePendingApprovals(
  store: PendingApprovalStore,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const userId = readAuthUserId(request);
  const isAdmin = isAdminLikeRequest(request);

  if (!isAdmin && !userId) {
    reply.status(403).send(errorResponse("관리자 권한이 필요합니다"));
    return undefined;
  }

  return isAdmin ? store.listPending() : store.listPendingByUser(userId ?? "");
}
