import net from "node:net";
import type { McpSecurityPolicyTable, McpServerTable, MuseDatabase } from "@muse/db";
import { createRunId, type JsonObject, type JsonValue } from "@muse/shared";
import type { MuseTool, ToolRisk } from "@muse/tools";
import type { Insertable, Kysely, Selectable } from "kysely";

export type Awaitable<T> = T | Promise<T>;
export type McpTransportType = "stdio" | "sse" | "streamable" | "http";
export type McpServerStatus = "pending" | "connecting" | "connected" | "disconnected" | "failed" | "disabled";

export interface McpServer {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly transportType: McpTransportType;
  readonly config: JsonObject;
  readonly version?: string;
  readonly autoConnect: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface McpServerInput {
  readonly id?: string;
  readonly name: string;
  readonly description?: string | null;
  readonly transportType: McpTransportType;
  readonly config?: JsonObject;
  readonly version?: string | null;
  readonly autoConnect?: boolean;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

export interface McpServerStore {
  list(): Awaitable<readonly McpServer[]>;
  findByName(name: string): Awaitable<McpServer | undefined>;
  save(input: McpServerInput): Awaitable<McpServer>;
  update(name: string, input: McpServerInput): Awaitable<McpServer | undefined>;
  delete(name: string): Awaitable<void>;
}

export interface McpSecurityPolicy {
  readonly allowedServerNames: readonly string[];
  readonly maxToolOutputLength: number;
  readonly allowedStdioCommands: readonly string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface McpSecurityPolicyInput {
  readonly allowedServerNames?: readonly string[];
  readonly maxToolOutputLength?: number;
  readonly allowedStdioCommands?: readonly string[];
}

export interface McpSecurityPolicyStore {
  getOrNull(): Awaitable<McpSecurityPolicy | undefined>;
  save(input: McpSecurityPolicyInput): Awaitable<McpSecurityPolicy>;
  delete(): Awaitable<boolean>;
}

export interface McpRemoteTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema?: JsonObject;
  readonly risk?: ToolRisk;
}

export interface McpConnection {
  listTools(): Awaitable<readonly McpRemoteTool[]>;
  callTool?(toolName: string, args: JsonObject): Awaitable<string | JsonValue>;
  close?(): Awaitable<void>;
}

export interface McpTransportConnector {
  connect(server: McpServer, policy: McpSecurityPolicy): Promise<McpConnection>;
}

export interface McpManagerOptions {
  readonly connector?: McpTransportConnector;
  readonly securityPolicyProvider?: McpSecurityPolicyProvider;
  readonly store?: McpServerStore;
  readonly now?: () => Date;
}

export interface InMemoryMcpServerStoreOptions {
  readonly idFactory?: () => string;
  readonly maxServers?: number;
  readonly now?: () => Date;
}

export interface InMemoryMcpSecurityPolicyStoreOptions {
  readonly initial?: McpSecurityPolicyInput;
  readonly now?: () => Date;
}

export interface KyselyMcpServerStoreOptions {
  readonly idFactory?: () => string;
  readonly now?: () => Date;
}

export interface KyselyMcpSecurityPolicyStoreOptions {
  readonly now?: () => Date;
}

type McpServerRow = Selectable<McpServerTable>;
type McpServerInsert = Insertable<McpServerTable>;
type McpSecurityPolicyRow = Selectable<McpSecurityPolicyTable>;
type McpSecurityPolicyInsert = Insertable<McpSecurityPolicyTable>;

const defaultAllowedStdioCommands = ["npx", "node", "python", "python3", "uvx", "uv", "docker", "deno", "bun"] as const;
const defaultMaxToolOutputLength = 50_000;
const minToolOutputLength = 1_024;
const maxToolOutputLength = 500_000;
const singletonPolicyId = "default";

export class InMemoryMcpServerStore implements McpServerStore {
  static readonly defaultMaxServers = 1_000;

  private readonly idFactory: () => string;
  private readonly maxServers: number;
  private readonly now: () => Date;
  private readonly servers = new Map<string, McpServer>();

  constructor(options: InMemoryMcpServerStoreOptions = {}) {
    this.idFactory = options.idFactory ?? (() => createRunId("mcp_server"));
    this.maxServers = options.maxServers ?? InMemoryMcpServerStore.defaultMaxServers;
    this.now = options.now ?? (() => new Date());
  }

  list(): readonly McpServer[] {
    return [...this.servers.values()].sort(compareServers);
  }

  findByName(name: string): McpServer | undefined {
    return this.servers.get(name);
  }

  save(input: McpServerInput): McpServer {
    if (this.servers.has(input.name)) {
      throw new McpRegistryError(`MCP server already exists: ${input.name}`);
    }

    const server = normalizeMcpServerInput(input, {
      id: input.id ?? this.idFactory(),
      now: this.now
    });

    this.servers.set(server.name, server);
    this.evictOverflow();
    return server;
  }

  update(name: string, input: McpServerInput): McpServer | undefined {
    const existing = this.servers.get(name);

    if (!existing) {
      return undefined;
    }

    const updated = normalizeMcpServerInput(
      {
        ...input,
        id: existing.id,
        name,
        createdAt: existing.createdAt
      },
      {
        id: existing.id,
        now: this.now
      }
    );

    this.servers.set(name, updated);
    return updated;
  }

  delete(name: string): void {
    this.servers.delete(name);
  }

  private evictOverflow(): void {
    while (this.servers.size > this.maxServers) {
      const oldest = this.list()[0];

      if (!oldest) {
        return;
      }

      this.servers.delete(oldest.name);
    }
  }
}

export class InMemoryMcpSecurityPolicyStore implements McpSecurityPolicyStore {
  private readonly now: () => Date;
  private policy?: McpSecurityPolicy;

  constructor(options: InMemoryMcpSecurityPolicyStoreOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.policy = options.initial ? normalizeMcpSecurityPolicy(options.initial, this.now()) : undefined;
  }

  getOrNull(): McpSecurityPolicy | undefined {
    return this.policy;
  }

  save(input: McpSecurityPolicyInput): McpSecurityPolicy {
    const now = this.now();
    const saved = {
      ...normalizeMcpSecurityPolicy(input, now),
      createdAt: this.policy?.createdAt ?? now,
      updatedAt: now
    };

    this.policy = saved;
    return saved;
  }

  delete(): boolean {
    const existed = Boolean(this.policy);
    this.policy = undefined;
    return existed;
  }
}

export class McpSecurityPolicyProvider {
  constructor(
    private readonly store: McpSecurityPolicyStore = new InMemoryMcpSecurityPolicyStore(),
    private readonly defaults: McpSecurityPolicyInput = {}
  ) {}

  async currentPolicy(): Promise<McpSecurityPolicy> {
    const stored = await this.store.getOrNull();

    if (stored) {
      return normalizeMcpSecurityPolicy(stored, stored.updatedAt);
    }

    return normalizeMcpSecurityPolicy(this.defaults, new Date(0));
  }

  async isServerAllowed(serverName: string): Promise<boolean> {
    const policy = await this.currentPolicy();

    return policy.allowedServerNames.length === 0 || policy.allowedServerNames.includes(serverName);
  }
}

export class McpManager {
  private readonly connector?: McpTransportConnector;
  private readonly securityPolicyProvider: McpSecurityPolicyProvider;
  private readonly statuses = new Map<string, McpServerStatus>();
  private readonly connections = new Map<string, McpConnection>();
  private readonly tools = new Map<string, readonly McpRemoteTool[]>();

  constructor(
    private readonly store: McpServerStore = new InMemoryMcpServerStore(),
    options: McpManagerOptions = {}
  ) {
    this.connector = options.connector;
    this.securityPolicyProvider = options.securityPolicyProvider ?? new McpSecurityPolicyProvider();
    this.store = options.store ?? store;
  }

  async register(input: McpServerInput): Promise<McpServer | undefined> {
    if (!(await this.securityPolicyProvider.isServerAllowed(input.name))) {
      this.statuses.set(input.name, "disabled");
      return undefined;
    }

    const saved = await this.store.save(input);
    this.statuses.set(saved.name, "pending");
    return saved;
  }

  async syncRuntimeServer(input: McpServerInput): Promise<McpServer | undefined> {
    const existing = await this.store.findByName(input.name);

    if (!existing) {
      return this.register(input);
    }

    return this.store.update(input.name, input);
  }

  async unregister(name: string): Promise<void> {
    await this.disconnect(name);
    await this.store.delete(name);
    this.statuses.delete(name);
    this.tools.delete(name);
  }

  async initializeFromStore(): Promise<void> {
    for (const server of await this.store.list()) {
      this.statuses.set(server.name, "pending");

      if (server.autoConnect) {
        await this.connect(server.name);
      }
    }
  }

  async connect(name: string): Promise<boolean> {
    const server = await this.store.findByName(name);

    if (!server || !(await this.securityPolicyProvider.isServerAllowed(name)) || !this.connector) {
      this.statuses.set(name, server ? "disabled" : "failed");
      return false;
    }

    const validation = validateMcpServer(server, await this.securityPolicyProvider.currentPolicy());

    if (!validation.valid) {
      this.statuses.set(name, "failed");
      return false;
    }

    this.statuses.set(name, "connecting");

    try {
      const connection = await this.connector.connect(server, await this.securityPolicyProvider.currentPolicy());
      const tools = await connection.listTools();

      this.connections.set(name, connection);
      this.tools.set(name, tools);
      this.statuses.set(name, "connected");
      return true;
    } catch {
      this.statuses.set(name, "failed");
      return false;
    }
  }

  async disconnect(name: string): Promise<void> {
    const connection = this.connections.get(name);

    try {
      await connection?.close?.();
    } finally {
      this.connections.delete(name);
      this.tools.delete(name);
      this.statuses.set(name, "disconnected");
    }
  }

  async listServers(): Promise<readonly McpServer[]> {
    return this.store.list();
  }

  getStatus(name: string): McpServerStatus | undefined {
    return this.statuses.get(name);
  }

  getToolCatalog(name?: string): readonly McpRemoteTool[] {
    if (name) {
      return this.tools.get(name) ?? [];
    }

    return [...this.tools.values()].flat();
  }

  toMuseTools(): readonly MuseTool[] {
    return [...this.connections.entries()].flatMap(([serverName, connection]) =>
      (this.tools.get(serverName) ?? []).map((tool) => createMcpMuseTool(serverName, tool, connection))
    );
  }
}

export class KyselyMcpServerStore implements McpServerStore {
  private readonly idFactory: () => string;
  private readonly now: () => Date;

  constructor(
    private readonly db: Kysely<MuseDatabase>,
    options: KyselyMcpServerStoreOptions = {}
  ) {
    this.idFactory = options.idFactory ?? (() => createRunId("mcp_server"));
    this.now = options.now ?? (() => new Date());
  }

  async list(): Promise<readonly McpServer[]> {
    const rows = await this.db.selectFrom("mcp_servers").selectAll().orderBy("created_at", "asc").execute();
    return rows.map(mapMcpServerRow);
  }

  async findByName(name: string): Promise<McpServer | undefined> {
    const row = await this.db.selectFrom("mcp_servers").selectAll().where("name", "=", name).executeTakeFirst();
    return row ? mapMcpServerRow(row) : undefined;
  }

  async save(input: McpServerInput): Promise<McpServer> {
    const row = await this.db
      .insertInto("mcp_servers")
      .values(createMcpServerInsert(input, { idFactory: this.idFactory, now: this.now }))
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapMcpServerRow(row);
  }

  async update(name: string, input: McpServerInput): Promise<McpServer | undefined> {
    const row = await this.db
      .updateTable("mcp_servers")
      .set(createMcpServerUpdate(input, this.now))
      .where("name", "=", name)
      .returningAll()
      .executeTakeFirst();

    return row ? mapMcpServerRow(row) : undefined;
  }

  async delete(name: string): Promise<void> {
    await this.db.deleteFrom("mcp_servers").where("name", "=", name).execute();
  }
}

export class KyselyMcpSecurityPolicyStore implements McpSecurityPolicyStore {
  private readonly now: () => Date;

  constructor(
    private readonly db: Kysely<MuseDatabase>,
    options: KyselyMcpSecurityPolicyStoreOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async getOrNull(): Promise<McpSecurityPolicy | undefined> {
    const row = await this.db
      .selectFrom("mcp_security_policy")
      .selectAll()
      .where("id", "=", singletonPolicyId)
      .executeTakeFirst();

    return row ? mapMcpSecurityPolicyRow(row) : undefined;
  }

  async save(input: McpSecurityPolicyInput): Promise<McpSecurityPolicy> {
    const row = createMcpSecurityPolicyInsert(input, this.now);
    const saved = await this.db
      .insertInto("mcp_security_policy")
      .values(row)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          allowed_server_names: row.allowed_server_names,
          allowed_stdio_commands: row.allowed_stdio_commands,
          max_tool_output_length: row.max_tool_output_length,
          updated_at: row.updated_at
        })
      )
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapMcpSecurityPolicyRow(saved);
  }

  async delete(): Promise<boolean> {
    const result = await this.db
      .deleteFrom("mcp_security_policy")
      .where("id", "=", singletonPolicyId)
      .executeTakeFirst();

    return Number(result.numDeletedRows ?? 0n) > 0;
  }
}

export class McpRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpRegistryError";
  }
}

export function normalizeMcpServerInput(
  input: McpServerInput,
  options: {
    readonly id: string;
    readonly now: () => Date;
  }
): McpServer {
  const createdAt = input.createdAt ?? options.now();

  return {
    autoConnect: input.autoConnect ?? false,
    config: input.config ?? {},
    createdAt,
    description: input.description ?? undefined,
    id: options.id,
    name: input.name,
    transportType: input.transportType,
    updatedAt: input.updatedAt ?? createdAt,
    version: input.version ?? undefined
  };
}

export function normalizeMcpSecurityPolicy(input: McpSecurityPolicyInput, now: Date): McpSecurityPolicy {
  return {
    allowedServerNames: uniqueStrings(input.allowedServerNames ?? []),
    allowedStdioCommands: uniqueStrings(input.allowedStdioCommands ?? defaultAllowedStdioCommands),
    createdAt: "createdAt" in input && input.createdAt instanceof Date ? input.createdAt : now,
    maxToolOutputLength: clamp(
      input.maxToolOutputLength ?? defaultMaxToolOutputLength,
      minToolOutputLength,
      maxToolOutputLength
    ),
    updatedAt: "updatedAt" in input && input.updatedAt instanceof Date ? input.updatedAt : now
  };
}

export function validateMcpServer(server: McpServer, policy: McpSecurityPolicy): {
  readonly reason?: string;
  readonly valid: boolean;
} {
  if (server.name.trim().length === 0) {
    return { reason: "MCP server name is required", valid: false };
  }

  if (server.transportType === "stdio") {
    const command = typeof server.config.command === "string" ? server.config.command : undefined;

    if (!command || !policy.allowedStdioCommands.includes(command)) {
      return { reason: "STDIO command is not allowed", valid: false };
    }
  }

  if (server.transportType === "sse" || server.transportType === "streamable" || server.transportType === "http") {
    const url = typeof server.config.url === "string" ? server.config.url : undefined;

    if (!url || !isPublicHttpUrl(url)) {
      return { reason: "Remote MCP URL is not allowed", valid: false };
    }
  }

  return { valid: true };
}

export function isPrivateOrReservedHost(host: string | undefined): boolean {
  if (!host) {
    return true;
  }

  const normalized = host.toLowerCase();

  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    return true;
  }

  const ipVersion = net.isIP(normalized);

  if (ipVersion === 0) {
    return false;
  }

  if (ipVersion === 4) {
    const parts = normalized.split(".").map(Number);
    const [a = 0, b = 0] = parts;

    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }

  return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80");
}

export function isPublicHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return (url.protocol === "https:" || url.protocol === "http:") && !isPrivateOrReservedHost(url.hostname);
  } catch {
    return false;
  }
}

export function createMcpMuseTool(serverName: string, tool: McpRemoteTool, connection: McpConnection): MuseTool {
  return {
    definition: {
      description: tool.description,
      inputSchema: tool.inputSchema ?? {},
      name: `${serverName}.${tool.name}`,
      risk: tool.risk ?? "read"
    },
    execute: async (args) => {
      if (!connection.callTool) {
        return `Error: MCP tool '${tool.name}' is not callable`;
      }

      return connection.callTool(tool.name, args);
    }
  };
}

export function createMcpServerInsert(
  input: McpServerInput,
  options: Required<KyselyMcpServerStoreOptions>
): McpServerInsert {
  const server = normalizeMcpServerInput(input, {
    id: input.id ?? options.idFactory(),
    now: options.now
  });

  return {
    auto_connect: server.autoConnect,
    config: server.config,
    created_at: server.createdAt,
    description: server.description ?? null,
    id: server.id,
    name: server.name,
    transport_type: server.transportType,
    updated_at: server.updatedAt,
    version: server.version ?? null
  };
}

export function createMcpServerUpdate(input: McpServerInput, now: () => Date) {
  return {
    auto_connect: input.autoConnect ?? false,
    config: input.config ?? {},
    description: input.description ?? null,
    transport_type: input.transportType,
    updated_at: input.updatedAt ?? now(),
    version: input.version ?? null
  };
}

export function createMcpSecurityPolicyInsert(
  input: McpSecurityPolicyInput,
  now: () => Date
): McpSecurityPolicyInsert {
  const timestamp = now();
  const policy = normalizeMcpSecurityPolicy(input, timestamp);

  return {
    allowed_server_names: [...policy.allowedServerNames],
    allowed_stdio_commands: [...policy.allowedStdioCommands],
    created_at: policy.createdAt,
    id: singletonPolicyId,
    max_tool_output_length: policy.maxToolOutputLength,
    updated_at: policy.updatedAt
  };
}

export function mapMcpServerRow(row: McpServerRow): McpServer {
  return {
    autoConnect: row.auto_connect,
    config: toJsonObject(row.config),
    createdAt: toDate(row.created_at),
    description: row.description ?? undefined,
    id: row.id,
    name: row.name,
    transportType: row.transport_type,
    updatedAt: toDate(row.updated_at),
    version: row.version ?? undefined
  };
}

export function mapMcpSecurityPolicyRow(row: McpSecurityPolicyRow): McpSecurityPolicy {
  return normalizeMcpSecurityPolicy(
    {
      allowedServerNames: toStringArray(row.allowed_server_names),
      allowedStdioCommands: toStringArray(row.allowed_stdio_commands),
      maxToolOutputLength: row.max_tool_output_length
    },
    toDate(row.updated_at)
  );
}

function compareServers(left: McpServer, right: McpServer): number {
  return left.createdAt.getTime() - right.createdAt.getTime() || left.name.localeCompare(right.name);
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toStringArray(value: JsonValue): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function toJsonObject(value: JsonValue): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
