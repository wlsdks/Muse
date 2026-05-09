/**
 * Reactor-compat RBAC role helpers extracted from
 * reactor-compat-routes.ts.
 *
 * Two-role taxonomy (user / admin) mapped into the response shape used
 * by /api/admin/rbac/roles + /api/admin/platform/users/:id/role.
 */

import type { UserRole } from "@muse/auth";
import type { JsonObject } from "@muse/shared";

export function userRoleResponse(role: UserRole): string {
  return role.toUpperCase();
}

export function parseUserRole(value: unknown): UserRole | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase() as UserRole;
  return normalized === "user" || normalized === "admin" ? normalized : undefined;
}

export function roleDefinitions(): readonly JsonObject[] {
  const roles: readonly UserRole[] = ["user", "admin"];
  return roles.map((role) => ({
    permissions: [...permissionsForRole(role)],
    role: userRoleResponse(role),
    scope: role === "admin" ? "FULL" : null
  }));
}

function permissionsForRole(role: UserRole): readonly string[] {
  if (role === "admin") {
    return [
      "persona:read", "persona:write",
      "prompt:read", "prompt:write",
      "session:read", "session:export",
      "feedback:read",
      "guard:read", "guard:write",
      "mcp:read", "mcp:write",
      "scheduler:read", "scheduler:write",
      "audit:read", "audit:export",
      "user:read", "user:write",
      "settings:read", "settings:write",
      "agent-spec:read", "agent-spec:write"
    ];
  }

  return ["chat:use", "persona:select"];
}
