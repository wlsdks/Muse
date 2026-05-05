import { InMemoryAgentSpecRegistry } from "@muse/agent-specs";
import {
  AuthService,
  DefaultAuthProvider,
  InMemoryTokenRevocationStore,
  InMemoryUserStore,
  JwtTokenProvider
} from "@muse/auth";
import { InMemoryRuntimeSettingsStore, RuntimeSettingsService } from "@muse/runtime-settings";
import { InMemoryAgentRunHistoryStore } from "@muse/runtime-state";
import { InMemoryScheduledJobExecutionStore, InMemoryScheduledJobStore } from "@muse/scheduler";

export interface MuseEnvironment {
  readonly [key: string]: string | undefined;
}

export interface MuseRuntimeAssembly {
  readonly agentSpecRegistry: InMemoryAgentSpecRegistry;
  readonly authService?: AuthService;
  readonly historyStore: InMemoryAgentRunHistoryStore;
  readonly requireAuth: boolean;
  readonly runtimeSettings: RuntimeSettingsService;
  readonly scheduler: {
    readonly executionStore: InMemoryScheduledJobExecutionStore;
    readonly store: InMemoryScheduledJobStore;
  };
}

export interface ApiServerAssemblyOptions {
  readonly env?: MuseEnvironment;
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export function createMuseRuntimeAssembly(options: ApiServerAssemblyOptions = {}): MuseRuntimeAssembly {
  const env = options.env ?? process.env;
  const userStore = new InMemoryUserStore(parseInteger(env.MUSE_AUTH_MAX_USERS, 10_000));
  const authService = createAuthService(env, userStore);

  return {
    agentSpecRegistry: new InMemoryAgentSpecRegistry(),
    authService,
    historyStore: new InMemoryAgentRunHistoryStore(),
    requireAuth: parseBoolean(env.MUSE_REQUIRE_AUTH, Boolean(authService)),
    runtimeSettings: new RuntimeSettingsService(new InMemoryRuntimeSettingsStore()),
    scheduler: {
      executionStore: new InMemoryScheduledJobExecutionStore({
        maxEntries: parseInteger(env.MUSE_SCHEDULER_MAX_EXECUTIONS, 200)
      }),
      store: new InMemoryScheduledJobStore({
        maxJobs: parseInteger(env.MUSE_SCHEDULER_MAX_JOBS, 1_000)
      })
    }
  };
}

export function createApiServerOptions(options: ApiServerAssemblyOptions = {}) {
  const assembly = createMuseRuntimeAssembly(options);

  return {
    agentSpecRegistry: assembly.agentSpecRegistry,
    authService: assembly.authService,
    historyStore: assembly.historyStore,
    requireAuth: assembly.requireAuth,
    runtimeSettings: assembly.runtimeSettings,
    scheduler: assembly.scheduler
  };
}

export function requireEnv(env: MuseEnvironment, key: string): string {
  const value = env[key]?.trim();

  if (!value) {
    throw new ConfigurationError(`Missing required environment variable: ${key}`);
  }

  return value;
}

export function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
}

export function parseInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createAuthService(env: MuseEnvironment, userStore: InMemoryUserStore): AuthService | undefined {
  const jwtSecret = env.MUSE_AUTH_JWT_SECRET?.trim();

  if (!jwtSecret) {
    return undefined;
  }

  const provider = new DefaultAuthProvider(userStore);
  return new AuthService({
    authProvider: provider,
    jwt: new JwtTokenProvider({
      defaultTenantId: env.MUSE_DEFAULT_TENANT_ID ?? "default",
      jwtExpirationMs: parseInteger(env.MUSE_AUTH_JWT_EXPIRATION_MS, 86_400_000),
      jwtSecret
    }),
    revocationStore: new InMemoryTokenRevocationStore(),
    userStore
  });
}
