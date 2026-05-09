/**
 * Reactor-compat policy + RBAC routes extracted from
 * reactor-compat-routes.ts.
 *
 * Wires:
 *   - GET/PUT/DELETE /api/tool-policy   (effective + stored shape)
 *   - GET   /api/admin/rbac/roles
 *   - PUT   /api/admin/rbac/users/:userId/role
 */

import type { FastifyInstance } from "fastify";
import {
  clearToolPolicy,
  errorResponse,
  getStateToolPolicy,
  parseUserRole,
  readBodyString,
  readStoredToolPolicy,
  roleDefinitions,
  saveToolPolicy,
  toBody,
  toToolPolicyResponse,
  userRoleResponse,
  validateToolPolicyBody,
  validationErrorResponse,
  type ReactorCompatibilityRouteOptions
} from "./reactor-compat-routes.js";

export function registerPolicyCompatibilityRoutes(server: FastifyInstance, options: ReactorCompatibilityRouteOptions): void {
  server.get("/api/tool-policy", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const stored = await readStoredToolPolicy(options);

    return {
      configEnabled: true,
      dynamicEnabled: true,
      effective: toToolPolicyResponse(stored ?? getStateToolPolicy()),
      stored: stored ? toToolPolicyResponse(stored) : null
    };
  });
  server.put("/api/tool-policy", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const validationError = validateToolPolicyBody(toBody(request.body));

    if (validationError) {
      return reply.status(400).send(validationErrorResponse(validationError));
    }

    const policy = await saveToolPolicy(options, request.body);
    return toToolPolicyResponse(policy);
  });
  server.delete("/api/tool-policy", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    await clearToolPolicy(options);
    return reply.status(204).send();
  });

  server.get("/api/admin/rbac/roles", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    return roleDefinitions();
  });

  server.put("/api/admin/rbac/users/:userId/role", async (request, reply) => {
    if (!options.authorizeAdmin(request, reply)) {
      return reply;
    }

    const { userId } = request.params as { readonly userId: string };
    const role = parseUserRole(readBodyString(request.body, "role"));

    if (!role) {
      return reply.status(400).send(errorResponse(`유효하지 않은 역할: ${readBodyString(request.body, "role") ?? ""}`));
    }

    if (!(await options.authService?.updateUserRole(userId, role))) {
      return reply.status(404).send(errorResponse(`사용자를 찾을 수 없습니다: ${userId}`));
    }

    return {
      role: userRoleResponse(role),
      userId
    };
  });

}
