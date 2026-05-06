import { spawn } from "node:child_process";
import type { ModelTool } from "@muse/model";
import {
  createAlwaysApprovePolicy,
  ToolOutputSanitizer,
  type SanitizedToolOutput,
  type ToolApprovalPolicy
} from "@muse/policy";
import type { JsonObject, JsonValue } from "@muse/shared";

export type ToolRisk = "read" | "write" | "execute";
export type ToolExecutionStatus = "completed" | "blocked" | "failed";

export interface MuseToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
  readonly risk: ToolRisk;
}

export interface MuseToolContext {
  readonly runId: string;
  readonly userId?: string;
  readonly workspaceId?: string;
}

export type ToolExecutionValue = string | JsonValue;

export interface MuseTool {
  readonly definition: MuseToolDefinition;
  execute(args: JsonObject, context: MuseToolContext): Promise<ToolExecutionValue> | ToolExecutionValue;
}

export interface RunnerCommandRequest {
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
}

export interface RunnerCommandResponse {
  readonly ok: boolean;
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly truncated: boolean;
  readonly error: string | null;
}

export interface RustRunnerToolOptions {
  readonly runnerPath?: string;
  readonly invokeRunner?: (request: RunnerCommandRequest) => Promise<RunnerCommandResponse>;
}

export interface ToolCallRequest {
  readonly id: string;
  readonly name: string;
  readonly arguments: JsonObject;
  readonly context: MuseToolContext;
}

export interface ToolApprovalStore {
  requestApproval(input: {
    readonly runId: string;
    readonly userId: string;
    readonly toolName: string;
    readonly arguments: JsonObject;
    readonly timeoutMs?: number;
    readonly context?: JsonObject;
  }): Promise<{
    readonly approved: boolean;
    readonly reason?: string;
    readonly modifiedArguments?: JsonObject;
  }>;
}

export interface ToolExecutionResult {
  readonly id: string;
  readonly name: string;
  readonly status: ToolExecutionStatus;
  readonly output: string;
  readonly sanitized?: SanitizedToolOutput;
  readonly error?: string;
}

export class ToolRegistry {
  private readonly tools = new Map<string, MuseTool>();

  constructor(tools: Iterable<MuseTool> = []) {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  register(tool: MuseTool): void {
    if (this.tools.has(tool.definition.name)) {
      throw new ToolRegistryError(`Duplicate tool registered: ${tool.definition.name}`);
    }

    this.tools.set(tool.definition.name, tool);
  }

  get(name: string): MuseTool | undefined {
    return this.tools.get(name);
  }

  list(): readonly MuseTool[] {
    return [...this.tools.values()];
  }

  toModelTools(): readonly ModelTool[] {
    return this.list().map((tool) => toModelTool(tool));
  }
}

export class ToolExecutor {
  private readonly approvalPolicy: ToolApprovalPolicy;
  private readonly approvalStore?: ToolApprovalStore;
  private readonly registry: ToolRegistry;
  private readonly sanitizer: ToolOutputSanitizer;

  constructor(options: {
    readonly approvalPolicy?: ToolApprovalPolicy;
    readonly approvalStore?: ToolApprovalStore;
    readonly registry: ToolRegistry;
    readonly sanitizer?: ToolOutputSanitizer;
  }) {
    this.approvalPolicy = options.approvalPolicy ?? createAlwaysApprovePolicy();
    this.approvalStore = options.approvalStore;
    this.registry = options.registry;
    this.sanitizer = options.sanitizer ?? new ToolOutputSanitizer();
  }

  async execute(request: ToolCallRequest): Promise<ToolExecutionResult> {
    const tool = this.registry.get(request.name);

    if (!tool) {
      return this.failed(request, `Error: tool not found: ${request.name}`);
    }

    const argsWithRisk = { ...request.arguments, risk: tool.definition.risk };
    let executionArguments = request.arguments;

    if (this.approvalPolicy.requiresApproval(tool.definition.name, argsWithRisk)) {
      const approval = await this.requestApproval(request);

      if (!approval.approved) {
        return {
          id: request.id,
          name: request.name,
          output: approval.reason
            ? `Error: tool execution was not approved: ${approval.reason}`
            : "Error: tool execution requires approval",
          status: "blocked"
        };
      }

      executionArguments = approval.modifiedArguments ?? request.arguments;
    }

    try {
      const raw = await tool.execute(executionArguments, request.context);
      const output = stringifyToolOutput(raw);
      const sanitized = this.sanitizer.sanitize(request.name, output);

      return {
        id: request.id,
        name: request.name,
        output: sanitized.content,
        sanitized,
        status: "completed"
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown tool failure";
      return this.failed(request, `Error: ${message}`);
    }
  }

  private async requestApproval(request: ToolCallRequest) {
    if (!this.approvalStore) {
      return { approved: false };
    }

    return this.approvalStore.requestApproval({
      arguments: request.arguments,
      context: {
        toolCallId: request.id,
        workspaceId: request.context.workspaceId ?? null
      },
      runId: request.context.runId,
      toolName: request.name,
      userId: request.context.userId ?? "anonymous"
    });
  }

  private failed(request: ToolCallRequest, error: string): ToolExecutionResult {
    return {
      error,
      id: request.id,
      name: request.name,
      output: error,
      status: "failed"
    };
  }
}

export class ToolRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolRegistryError";
  }
}

export function toModelTool(tool: MuseTool): ModelTool {
  return {
    description: shortenToolDescription(tool.definition.description),
    inputSchema: tool.definition.inputSchema,
    name: tool.definition.name,
    risk: tool.definition.risk
  };
}

export function shortenToolDescription(text: string, maxChars = 200): string {
  if (text.trim().length === 0) {
    return text;
  }

  const firstParagraph = text.split(/\n\s*\n/u)[0]?.trim() ?? "";

  if (firstParagraph.length <= maxChars) {
    return firstParagraph;
  }

  return `${firstParagraph.slice(0, Math.max(0, maxChars - 1))}...`;
}

export function isWorkspaceMutationPrompt(prompt: string | undefined | null): boolean {
  if (!prompt) {
    return false;
  }

  return workspaceMutationPatterns.some((pattern) => pattern.test(prompt));
}

export function createRustRunnerTool(options: RustRunnerToolOptions = {}): MuseTool {
  const invoke = options.invokeRunner ?? ((request) => invokeRustRunner(options.runnerPath ?? "muse-runner", request));

  return {
    definition: {
      description: "Execute an approved local command through the Muse Rust runner child process.",
      inputSchema: {
        additionalProperties: false,
        properties: {
          args: { items: { type: "string" }, type: "array" },
          command: { type: "string" },
          cwd: { type: "string" },
          env: { additionalProperties: { type: "string" }, type: "object" },
          maxOutputBytes: { minimum: 1, type: "integer" },
          timeoutMs: { minimum: 1, type: "integer" }
        },
        required: ["command"],
        type: "object"
      },
      name: "run_command",
      risk: "execute"
    },
    async execute(args) {
      const request = parseRunnerCommandRequest(args);
      const response = await invoke(request);

      return {
        ...response,
        stderr: response.stderr.slice(0, request.maxOutputBytes ?? response.stderr.length),
        stdout: response.stdout.slice(0, request.maxOutputBytes ?? response.stdout.length)
      };
    }
  };
}

export async function invokeRustRunner(
  runnerPath: string,
  request: RunnerCommandRequest
): Promise<RunnerCommandResponse> {
  return new Promise((resolve) => {
    const child = spawn(runnerPath, [], {
      stdio: ["pipe", "pipe", "pipe"]
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      resolve({
        error: error.message,
        ok: false,
        status: null,
        stderr: "",
        stdout: "",
        timedOut: false,
        truncated: false
      });
    });
    child.on("close", () => {
      const output = Buffer.concat(stdout).toString("utf8");
      const parsed = parseRunnerResponse(output);

      if (parsed) {
        resolve(parsed);
        return;
      }

      resolve({
        error: "runner returned invalid JSON",
        ok: false,
        status: null,
        stderr: Buffer.concat(stderr).toString("utf8"),
        stdout: output,
        timedOut: false,
        truncated: false
      });
    });
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}

export function parseRunnerCommandRequest(value: JsonObject): RunnerCommandRequest {
  const command = typeof value.command === "string" ? value.command.trim() : "";

  if (!command) {
    throw new ToolRegistryError("run_command requires a non-empty command");
  }

  return {
    args: Array.isArray(value.args) ? value.args.filter((entry): entry is string => typeof entry === "string") : undefined,
    command,
    cwd: typeof value.cwd === "string" && value.cwd.trim().length > 0 ? value.cwd : undefined,
    env: readStringRecord(value.env),
    maxOutputBytes: readPositiveInteger(value.maxOutputBytes),
    timeoutMs: readPositiveInteger(value.timeoutMs)
  };
}

function parseRunnerResponse(value: string): RunnerCommandResponse | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (!isRecord(parsed)) {
      return undefined;
    }

    return {
      error: typeof parsed.error === "string" ? parsed.error : null,
      ok: parsed.ok === true,
      status: typeof parsed.status === "number" ? parsed.status : null,
      stderr: typeof parsed.stderr === "string" ? parsed.stderr : "",
      stdout: typeof parsed.stdout === "string" ? parsed.stdout : "",
      timedOut: parsed.timedOut === true,
      truncated: parsed.truncated === true
    };
  } catch {
    return undefined;
  }
}

function readStringRecord(value: unknown): Readonly<Record<string, string>> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

function readPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

const workspaceMutationPatterns = [
  /\b(create|update|delete|remove|assign|reassign|close|merge|deploy|send|publish)\b/i,
  /(생성|수정|삭제|제거|할당|재할당|닫아|종료|병합|배포|전송|게시|등록)/
] as const;

function stringifyToolOutput(value: ToolExecutionValue): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
