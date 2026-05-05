import { describe, expect, it } from "vitest";
import {
  AuthRateLimiter,
  AuthService,
  DefaultAuthProvider,
  InMemoryTokenRevocationStore,
  InMemoryUserStore,
  JwtTokenProvider,
  PasswordHasher,
  adminScope,
  anonymousActor,
  currentActor,
  extractBearerToken,
  isAnyAdmin,
  isDeveloperAdmin,
  maskedAdminAccountRef,
  normalizeEmail
} from "../src/index.js";

const jwtSecret = "0123456789abcdef0123456789abcdef";

describe("users and password auth", () => {
  it("stores users by normalized account id and authenticates password hashes", () => {
    const store = new InMemoryUserStore();
    const hasher = new PasswordHasher();
    const provider = new DefaultAuthProvider(store, hasher);
    const passwordHash = hasher.hashPassword("correct-password", "fixed-salt");

    const user = store.save({
      email: "USER_ACCOUNT",
      name: "User",
      passwordHash
    });

    expect(normalizeEmail(" USER_ACCOUNT ")).toBe("user_account");
    expect(store.findByEmail("user_account")?.id).toBe(user.id);
    expect(provider.authenticate("user_account", "correct-password")?.id).toBe(user.id);
    expect(provider.authenticate("user_account", "wrong-password")).toBeUndefined();
  });
});

describe("jwt tokens and revocation", () => {
  it("creates, validates, extracts, and revokes HS256 tokens", () => {
    const jwt = new JwtTokenProvider({
      defaultTenantId: "tenant-1",
      jwtExpirationMs: 60_000,
      jwtSecret
    });
    const user = {
      createdAt: new Date("2026-05-05T00:00:00.000Z"),
      email: "user_account",
      id: "user-1",
      name: "User",
      passwordHash: "hash",
      role: "admin_developer" as const
    };
    const now = new Date();
    const token = jwt.createToken(user, now);
    const revocations = new InMemoryTokenRevocationStore(() => new Date(now.getTime() + 1_000));
    const service = new AuthService({
      authProvider: { authenticate: () => user, getUserById: () => user },
      jwt,
      revocationStore: revocations
    });

    expect(jwt.validateToken(token, new Date(now.getTime() + 1_000))).toBe("user-1");
    expect(jwt.extractRole(token)).toBe("admin_developer");
    expect(service.authenticateBearer(token)?.tenantId).toBe("tenant-1");
    expect(service.logout(token)).toBe(true);
    expect(service.authenticateBearer(token)).toBeUndefined();
    expect(revocations.size()).toBe(1);
  });

  it("rejects weak JWT secrets", () => {
    expect(() => new JwtTokenProvider({ jwtSecret: "short" })).toThrow("JWT secret");
  });
});

describe("AuthService registration and login", () => {
  it("registers first user as admin and returns login tokens", () => {
    const store = new InMemoryUserStore();
    const provider = new DefaultAuthProvider(store);
    const service = new AuthService({
      authProvider: provider,
      jwt: new JwtTokenProvider({ jwtSecret }),
      userStore: store
    });
    const registered = service.register({
      email: "first_account",
      name: "First",
      password: "password-1"
    });
    const login = service.login("first_account", "password-1");

    expect(registered.user.role).toBe("admin");
    expect(login?.token).toBeTruthy();
    expect(login?.user).not.toHaveProperty("passwordHash");
  });
});

describe("authorization helpers", () => {
  it("handles admin scopes and actor masking", () => {
    expect(isAnyAdmin("admin_manager")).toBe(true);
    expect(isDeveloperAdmin("admin_manager")).toBe(false);
    expect(adminScope("admin_developer")).toBe("developer");
    expect(currentActor(undefined)).toBe(anonymousActor);
    expect(maskedAdminAccountRef("admin-1")).toMatch(/^admin-account:[a-f0-9]{12}$/u);
    expect(maskedAdminAccountRef(anonymousActor)).toBe("admin-account:anonymous");
  });

  it("extracts bearer tokens conservatively", () => {
    expect(extractBearerToken("Bearer token-1")).toBe("token-1");
    expect(extractBearerToken("Basic token-1")).toBeUndefined();
  });
});

describe("AuthRateLimiter", () => {
  it("blocks after configured failures and does not clear on unknown status", () => {
    let now = 0;
    const limiter = new AuthRateLimiter({
      maxAttemptsPerMinute: 2,
      now: () => now,
      windowMs: 1_000
    });

    limiter.recordFailure("ip:/auth/login");
    limiter.recordCompletedAttempt("ip:/auth/login", undefined);
    expect(limiter.isBlocked("ip:/auth/login")).toBe(false);

    limiter.recordFailure("ip:/auth/login");
    expect(limiter.isBlocked("ip:/auth/login")).toBe(true);

    now += 1_000;
    expect(limiter.isBlocked("ip:/auth/login")).toBe(false);
  });

  it("clears failures only on explicit success", () => {
    const limiter = new AuthRateLimiter({ maxAttemptsPerMinute: 1 });

    limiter.recordFailure("ip:/auth/login");
    limiter.recordCompletedAttempt("ip:/auth/login", 200);

    expect(limiter.isBlocked("ip:/auth/login")).toBe(false);
  });
});
