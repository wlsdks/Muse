import { createHmac, createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { createRunId } from "@muse/shared";

export type UserRole = "user" | "admin" | "admin_manager" | "admin_developer";
export type AdminScope = "full" | "manager" | "developer";
export type TokenRevocationStoreType = "memory" | "jdbc" | "redis";

export interface User {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly passwordHash: string;
  readonly role: UserRole;
  readonly createdAt: Date;
}

export interface UserInput {
  readonly id?: string;
  readonly email: string;
  readonly name: string;
  readonly passwordHash: string;
  readonly role?: UserRole;
  readonly createdAt?: Date;
}

export interface AuthProperties {
  readonly jwtSecret: string;
  readonly jwtExpirationMs?: number;
  readonly defaultTenantId?: string;
  readonly selfRegistrationEnabled?: boolean;
  readonly publicPaths?: readonly string[];
  readonly loginRateLimitPerMinute?: number;
  readonly trustForwardedHeaders?: boolean;
  readonly tokenRevocationStore?: TokenRevocationStoreType;
  readonly tokenRevocationStoreStrict?: boolean;
}

export interface AuthProvider {
  authenticate(email: string, password: string): User | undefined;
  getUserById(userId: string): User | undefined;
}

export interface UserStore {
  findByEmail(email: string): User | undefined;
  findById(id: string): User | undefined;
  save(user: UserInput): User;
  update(user: UserInput): User;
  existsByEmail(email: string): boolean;
  count(): number;
}

export interface TokenRevocationStore {
  revoke(tokenId: string, expiresAt: Date): void;
  isRevoked(tokenId: string): boolean;
}

export interface JwtClaims {
  readonly sub: string;
  readonly jti: string;
  readonly email: string;
  readonly role: UserRole;
  readonly tenantId: string;
  readonly iat: number;
  readonly exp: number;
  readonly accountId?: string;
}

export interface AuthIdentity {
  readonly userId: string;
  readonly email: string;
  readonly role: UserRole;
  readonly tenantId: string;
  readonly tokenId: string;
  readonly expiresAt: Date;
  readonly accountId?: string;
}

export interface LoginResult {
  readonly token: string;
  readonly user: Omit<User, "passwordHash">;
  readonly expiresAt: Date;
}

export interface AuthServiceOptions {
  readonly authProvider: AuthProvider;
  readonly jwt: JwtTokenProvider;
  readonly revocationStore?: TokenRevocationStore;
  readonly userStore?: UserStore;
}

export interface AuthRateLimiterOptions {
  readonly maxAttemptsPerMinute?: number;
  readonly now?: () => number;
  readonly windowMs?: number;
}

export const anonymousActor = "anonymous";

const defaultJwtExpirationMs = 86_400_000;
const defaultTenantId = "default";
const minimumJwtSecretBytes = 32;
const passwordHashVersion = "scrypt-v1";
const passwordKeyLength = 64;
const defaultMaxUsers = 10_000;
const defaultRateWindowMs = 60_000;

export class AuthError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

export class InMemoryUserStore implements UserStore {
  private readonly maxUsers: number;
  private readonly usersById = new Map<string, User>();
  private readonly usersByEmail = new Map<string, User>();

  constructor(maxUsers = defaultMaxUsers) {
    this.maxUsers = Math.max(1, maxUsers);
  }

  findByEmail(email: string): User | undefined {
    return this.usersByEmail.get(normalizeEmail(email));
  }

  findById(id: string): User | undefined {
    return this.usersById.get(id);
  }

  save(input: UserInput): User {
    const email = normalizeEmail(input.email);

    if (this.usersByEmail.has(email)) {
      throw new AuthError("USER_EXISTS", `User already exists: ${email}`);
    }

    const user = normalizeUserInput({ ...input, email });
    this.usersById.set(user.id, user);
    this.usersByEmail.set(email, user);
    this.evictOverflow();
    return user;
  }

  update(input: UserInput): User {
    const email = normalizeEmail(input.email);
    const user = normalizeUserInput({ ...input, email });
    const existing = this.usersById.get(user.id);

    if (existing && existing.email !== email) {
      this.usersByEmail.delete(existing.email);
    }

    const duplicate = this.usersByEmail.get(email);

    if (duplicate && duplicate.id !== user.id) {
      throw new AuthError("USER_EXISTS", `User already exists: ${email}`);
    }

    this.usersById.set(user.id, user);
    this.usersByEmail.set(email, user);
    this.evictOverflow();
    return user;
  }

  existsByEmail(email: string): boolean {
    return this.usersByEmail.has(normalizeEmail(email));
  }

  count(): number {
    return this.usersById.size;
  }

  private evictOverflow(): void {
    while (this.usersById.size > this.maxUsers) {
      const oldest = [...this.usersById.values()].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())[0];

      if (!oldest) {
        return;
      }

      this.usersById.delete(oldest.id);
      this.usersByEmail.delete(oldest.email);
    }
  }
}

export class PasswordHasher {
  hashPassword(password: string, salt = randomBytes(16).toString("base64url")): string {
    const hash = scryptSync(password, salt, passwordKeyLength).toString("base64url");
    return `${passwordHashVersion}:${salt}:${hash}`;
  }

  verify(password: string, passwordHash: string): boolean {
    const [version, salt, hash] = passwordHash.split(":");

    if (version !== passwordHashVersion || !salt || !hash) {
      return false;
    }

    const expected = Buffer.from(hash, "base64url");
    const actual = scryptSync(password, salt, expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}

export class DefaultAuthProvider implements AuthProvider {
  constructor(
    private readonly userStore: UserStore,
    private readonly passwordHasher = new PasswordHasher()
  ) {}

  authenticate(email: string, password: string): User | undefined {
    const user = this.userStore.findByEmail(email);
    return user && this.passwordHasher.verify(password, user.passwordHash) ? user : undefined;
  }

  getUserById(userId: string): User | undefined {
    return this.userStore.findById(userId);
  }

  hashPassword(password: string): string {
    return this.passwordHasher.hashPassword(password);
  }
}

export class JwtTokenProvider {
  private readonly jwtExpirationMs: number;
  private readonly defaultTenantId: string;
  private readonly secret: Buffer;

  constructor(private readonly properties: AuthProperties) {
    this.jwtExpirationMs = properties.jwtExpirationMs ?? defaultJwtExpirationMs;
    this.defaultTenantId = properties.defaultTenantId ?? defaultTenantId;
    this.secret = Buffer.from(properties.jwtSecret);

    if (this.secret.byteLength < minimumJwtSecretBytes) {
      throw new AuthError(
        "WEAK_JWT_SECRET",
        `JWT secret must be at least ${minimumJwtSecretBytes} bytes for HS256`
      );
    }
  }

  createToken(user: User, now = new Date()): string {
    const issuedAt = Math.floor(now.getTime() / 1_000);
    const expiresAt = Math.floor((now.getTime() + this.jwtExpirationMs) / 1_000);
    const claims: JwtClaims = {
      email: user.email,
      exp: expiresAt,
      iat: issuedAt,
      jti: createRunId("token"),
      role: user.role,
      sub: user.id,
      tenantId: this.defaultTenantId
    };

    return signJwt(claims, this.secret);
  }

  parseToken(token: string, now = new Date()): JwtClaims | undefined {
    const claims = verifyJwt(token, this.secret);

    if (!claims || claims.exp <= Math.floor(now.getTime() / 1_000)) {
      return undefined;
    }

    return claims;
  }

  validateToken(token: string, now = new Date()): string | undefined {
    return this.parseToken(token, now)?.sub;
  }

  extractRole(token: string): UserRole | undefined {
    return this.parseToken(token)?.role;
  }

  extractTenantId(token: string): string | undefined {
    return this.parseToken(token)?.tenantId;
  }

  extractEmail(token: string): string | undefined {
    return this.parseToken(token)?.email;
  }

  extractAccountId(token: string): string | undefined {
    return this.parseToken(token)?.accountId;
  }

  extractTokenId(token: string): string | undefined {
    return this.parseToken(token)?.jti;
  }

  extractExpiration(token: string): Date | undefined {
    const claims = this.parseToken(token);
    return claims ? new Date(claims.exp * 1_000) : undefined;
  }
}

export class InMemoryTokenRevocationStore implements TokenRevocationStore {
  private readonly revoked = new Map<string, Date>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  revoke(tokenId: string, expiresAt: Date): void {
    if (expiresAt <= this.now()) {
      return;
    }

    this.revoked.set(tokenId, expiresAt);
    this.purgeExpired();
  }

  isRevoked(tokenId: string): boolean {
    this.purgeExpired();
    return this.revoked.has(tokenId);
  }

  size(): number {
    this.purgeExpired();
    return this.revoked.size;
  }

  purgeExpired(): void {
    const now = this.now();

    for (const [tokenId, expiresAt] of this.revoked) {
      if (expiresAt <= now) {
        this.revoked.delete(tokenId);
      }
    }
  }
}

export class AuthService {
  private readonly revocationStore?: TokenRevocationStore;
  private readonly userStore?: UserStore;

  constructor(private readonly options: AuthServiceOptions) {
    this.revocationStore = options.revocationStore;
    this.userStore = options.userStore;
  }

  login(email: string, password: string): LoginResult | undefined {
    const user = this.options.authProvider.authenticate(email, password);

    if (!user) {
      return undefined;
    }

    const token = this.options.jwt.createToken(user);
    const expiresAt = this.options.jwt.extractExpiration(token) ?? new Date(Date.now() + defaultJwtExpirationMs);
    return { expiresAt, token, user: publicUser(user) };
  }

  register(input: { readonly email: string; readonly name: string; readonly password: string }): LoginResult {
    if (!this.userStore) {
      throw new AuthError("REGISTRATION_DISABLED", "Registration requires a user store");
    }

    const provider = this.options.authProvider;
    const passwordHash =
      provider instanceof DefaultAuthProvider ? provider.hashPassword(input.password) : new PasswordHasher().hashPassword(input.password);
    const role: UserRole = this.userStore.count() === 0 ? "admin" : "user";
    const user = this.userStore.save({
      email: input.email,
      name: input.name,
      passwordHash,
      role
    });
    const token = this.options.jwt.createToken(user);
    const expiresAt = this.options.jwt.extractExpiration(token) ?? new Date(Date.now() + defaultJwtExpirationMs);
    return { expiresAt, token, user: publicUser(user) };
  }

  authenticateBearer(token: string | undefined): AuthIdentity | undefined {
    if (!token) {
      return undefined;
    }

    const claims = this.options.jwt.parseToken(token);

    if (!claims || this.revocationStore?.isRevoked(claims.jti)) {
      return undefined;
    }

    return {
      accountId: claims.accountId,
      email: claims.email,
      expiresAt: new Date(claims.exp * 1_000),
      role: claims.role,
      tenantId: claims.tenantId,
      tokenId: claims.jti,
      userId: claims.sub
    };
  }

  logout(token: string | undefined): boolean {
    if (!token || !this.revocationStore) {
      return false;
    }

    const claims = this.options.jwt.parseToken(token);

    if (!claims) {
      return false;
    }

    this.revocationStore.revoke(claims.jti, new Date(claims.exp * 1_000));
    return true;
  }
}

export class AuthRateLimiter {
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly attempts = new Map<string, { count: number; expiresAt: number }>();

  constructor(options: AuthRateLimiterOptions = {}) {
    this.maxAttempts = Math.max(1, options.maxAttemptsPerMinute ?? 10);
    this.windowMs = Math.max(1, options.windowMs ?? defaultRateWindowMs);
    this.now = options.now ?? Date.now;
  }

  isBlocked(key: string): boolean {
    return this.currentCount(key) >= this.maxAttempts;
  }

  recordFailure(key: string): number {
    const now = this.now();
    const entry = this.attempts.get(key);
    const next = !entry || entry.expiresAt <= now
      ? { count: 1, expiresAt: now + this.windowMs }
      : { count: entry.count + 1, expiresAt: entry.expiresAt };

    this.attempts.set(key, next);
    return next.count;
  }

  recordSuccess(key: string): void {
    this.attempts.delete(key);
  }

  recordCompletedAttempt(key: string, statusCode: number | undefined): void {
    if (statusCode === undefined) {
      return;
    }

    if (statusCode >= 200 && statusCode < 300) {
      this.recordSuccess(key);
    } else if (statusCode >= 400) {
      this.recordFailure(key);
    }
  }

  private currentCount(key: string): number {
    const entry = this.attempts.get(key);

    if (!entry) {
      return 0;
    }

    if (entry.expiresAt <= this.now()) {
      this.attempts.delete(key);
      return 0;
    }

    return entry.count;
  }
}

export function isAnyAdmin(role: UserRole | undefined | null): boolean {
  return role === "admin" || role === "admin_manager" || role === "admin_developer";
}

export function isDeveloperAdmin(role: UserRole | undefined | null): boolean {
  return role === "admin" || role === "admin_developer";
}

export function adminScope(role: UserRole | undefined | null): AdminScope | undefined {
  if (role === "admin") {
    return "full";
  }

  if (role === "admin_manager") {
    return "manager";
  }

  if (role === "admin_developer") {
    return "developer";
  }

  return undefined;
}

export function currentActor(identity: AuthIdentity | undefined): string {
  return identity?.userId?.trim() || anonymousActor;
}

export function maskedAdminAccountRef(actor: string | undefined | null): string {
  const normalized = actor?.trim();

  if (!normalized) {
    return "admin-account:unknown";
  }

  if (normalized === anonymousActor) {
    return `admin-account:${anonymousActor}`;
  }

  return `admin-account:${sha256Hex(normalized).slice(0, 12)}`;
}

export function extractBearerToken(authorization: string | undefined): string | undefined {
  if (!authorization) {
    return undefined;
  }

  const [scheme, token] = authorization.split(/\s+/u);
  return scheme?.toLowerCase() === "bearer" && token ? token : undefined;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeUserInput(input: UserInput): User {
  const email = normalizeEmail(input.email);

  if (!email) {
    throw new AuthError("INVALID_USER", "User email must not be blank");
  }

  if (!input.name.trim()) {
    throw new AuthError("INVALID_USER", "User name must not be blank");
  }

  return {
    createdAt: input.createdAt ?? new Date(),
    email,
    id: input.id ?? createRunId("user"),
    name: input.name.trim(),
    passwordHash: input.passwordHash,
    role: input.role ?? "user"
  };
}

function publicUser(user: User): Omit<User, "passwordHash"> {
  return {
    createdAt: user.createdAt,
    email: user.email,
    id: user.id,
    name: user.name,
    role: user.role
  };
}

function signJwt(claims: JwtClaims, secret: Buffer): string {
  const header = { alg: "HS256", typ: "JWT" };
  const unsigned = `${base64UrlJson(header)}.${base64UrlJson(claims)}`;
  const signature = createHmac("sha256", secret).update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
}

function verifyJwt(token: string, secret: Buffer): JwtClaims | undefined {
  const [header, payload, signature] = token.split(".");

  if (!header || !payload || !signature) {
    return undefined;
  }

  const expected = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    return undefined;
  }

  const parsedHeader = parseBase64UrlJson(header);

  if (!isRecord(parsedHeader) || parsedHeader.alg !== "HS256") {
    return undefined;
  }

  const parsedClaims = parseBase64UrlJson(payload);
  return isJwtClaims(parsedClaims) ? parsedClaims : undefined;
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function parseBase64UrlJson(value: string): unknown {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function isJwtClaims(value: unknown): value is JwtClaims {
  return (
    isRecord(value) &&
    typeof value.sub === "string" &&
    typeof value.jti === "string" &&
    typeof value.email === "string" &&
    isUserRole(value.role) &&
    typeof value.tenantId === "string" &&
    typeof value.iat === "number" &&
    typeof value.exp === "number"
  );
}

function isUserRole(value: unknown): value is UserRole {
  return value === "user" || value === "admin" || value === "admin_manager" || value === "admin_developer";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
