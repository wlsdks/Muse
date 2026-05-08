/**
 * Reactor-compat auth routes extracted from reactor-compat-routes.ts.
 *
 * Wires `/api/auth/*` endpoints (register, login, demo-login, exchange,
 * me, logout, change-password) using the shared
 * `ReactorCompatibilityRouteOptions` so call sites in
 * registerReactorCompatibilityRoutes don't change.
 */

import { extractBearerToken, type LoginResult } from "@muse/auth";
import type { FastifyInstance } from "fastify";
import {
  authRateLimitKey,
  errorMessage,
  errorResponse,
  nowIso,
  parseAuthCredentials,
  readBodyString,
  requireAuthService,
  toReactorAuthResponse,
  toReactorUserResponse,
  type ReactorCompatibilityRouteOptions
} from "./reactor-compat-routes.js";

export function registerAuthCompatibilityRoutes(server: FastifyInstance, options: ReactorCompatibilityRouteOptions): void {
  server.post("/api/auth/register", async (request, reply) => {
    const authService = requireAuthService(options, reply);

    if (!authService) {
      return reply;
    }

    const parsed = parseAuthCredentials(request.body, "register");

    if (!parsed.ok) {
      return reply.status(400).send(parsed.error);
    }

    try {
      const login = await authService.register(parsed.value);
      let normalizedLogin: LoginResult = login;

      if (login.user.role === "admin") {
        const normalizedUser = await authService.updateUserRole(login.user.id, "user");
        const relogin = await authService.login(parsed.value.email, parsed.value.password);
        normalizedLogin = relogin ?? (normalizedUser ? { ...login, user: normalizedUser } : login);
      }

      return reply.status(201).send(toReactorAuthResponse(normalizedLogin));
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "REGISTRATION_FAILED";
      return reply.status(code === "USER_EXISTS" ? 409 : 400).send({
        error: code === "USER_EXISTS" ? "Email already registered" : errorMessage(error, "Registration failed"),
        token: "",
        user: null
      });
    }
  });

  server.post("/api/auth/login", async (request, reply) => {
    const authService = requireAuthService(options, reply);

    if (!authService) {
      return reply;
    }

    const key = authRateLimitKey(request.headers["x-forwarded-for"], request.ip, "/api/auth/login");

    if (options.authRateLimiter.isBlocked(key)) {
      return reply.status(429).send({
        code: "AUTH_RATE_LIMITED",
        message: "Too many authentication attempts"
      });
    }

    const parsed = parseAuthCredentials(request.body, "login");

    if (!parsed.ok) {
      options.authRateLimiter.recordFailure(key);
      return reply.status(400).send(parsed.error);
    }

    const login = await authService.login(parsed.value.email, parsed.value.password);

    if (!login) {
      options.authRateLimiter.recordFailure(key);
      return reply.status(401).send({
        error: "Invalid email or password",
        token: "",
        user: null
      });
    }

    options.authRateLimiter.recordSuccess(key);
    return toReactorAuthResponse(login);
  });

  server.post("/api/auth/demo-login", async (_request, reply) => {
    const authService = requireAuthService(options, reply);

    if (!authService) {
      return reply;
    }

    const credentials = {
      email: ["demo", "reactor.local"].join("@"),
      name: "Demo Admin",
      password: "demo-password"
    };

    try {
      const login = await authService.register(credentials);
      const user = await authService.updateUserRole(login.user.id, "admin");
      return toReactorAuthResponse({
        ...login,
        user: user ?? login.user
      });
    } catch {
      const login = await authService.login(credentials.email, credentials.password);
      const user = login ? await authService.updateUserRole(login.user.id, "admin") : undefined;
      return login ? toReactorAuthResponse({ ...login, user: user ?? login.user }) : reply.status(401).send({
        code: "DEMO_LOGIN_UNAVAILABLE",
        message: "Demo user exists but could not be authenticated"
      });
    }
  });

  server.post("/api/auth/exchange", async (request, reply) => {
    if (!options.iamTokenExchangeService) {
      return reply.status(404).send({
        error: "IAM token exchange is not enabled",
        token: "",
        user: null
      });
    }

    const token = readBodyString(request.body, "token") ?? "";

    if (!token) {
      return reply.status(400).send({
        error: "IAM token must not be blank",
        token: "",
        user: null
      });
    }

    const login = await options.iamTokenExchangeService.exchange(token);

    if (!login) {
      return reply.status(401).send({
        error: "IAM token verification failed",
        token: "",
        user: null
      });
    }

    return toReactorAuthResponse(login);
  });

  server.get("/api/auth/me", async (request, reply) => {
    const authService = requireAuthService(options, reply);

    if (!authService) {
      return reply;
    }

    const identity = await authService.authenticateBearer(extractBearerToken(request.headers.authorization));

    if (!identity) {
      return reply.status(401).send();
    }

    const user = await authService.getUserById(identity.userId);

    if (!user) {
      return reply.status(404).send({
        error: "User not found",
        timestamp: nowIso()
      });
    }

    return toReactorUserResponse(user);
  });

  server.post("/api/auth/logout", async (request, reply) => {
    const token = extractBearerToken(request.headers.authorization);

    if (!token || !(await options.authService?.logout(token))) {
      return reply.status(401).send();
    }

    return { message: "Logged out" };
  });

  server.post("/api/auth/change-password", async (request, reply) => {
    const authService = requireAuthService(options, reply);

    if (!authService) {
      return reply;
    }

    const identity = await authService.authenticateBearer(extractBearerToken(request.headers.authorization));

    if (!identity) {
      return reply.status(401).send();
    }

    const currentPassword = readBodyString(request.body, "currentPassword");
    const newPassword = readBodyString(request.body, "newPassword");

    if (!currentPassword || !newPassword) {
      return reply.status(400).send(errorResponse("Body must include currentPassword and newPassword"));
    }

    if (newPassword.length < 8) {
      return reply.status(400).send(errorResponse("New password must be at least 8 characters"));
    }

    const result = await authService.changePassword({
      currentPassword,
      newPassword,
      userId: identity.userId
    });

    if (result === "changed") {
      return { message: "Password changed successfully" };
    }

    if (result === "user_not_found") {
      return reply.status(404).send(errorResponse("User not found"));
    }

    return reply.status(400).send(errorResponse(result === "unsupported"
      ? "Password change not supported with custom AuthProvider"
      : "Current password is incorrect"));
  });
}
