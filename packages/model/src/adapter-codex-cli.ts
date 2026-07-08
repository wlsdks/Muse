/**
 * Codex CLI model provider — talk to OpenAI's ChatGPT models through the user's
 * OWN official `codex` CLI login, never through a Muse-held token. Muse shells
 * out to the official `codex` binary, which owns the OAuth session under
 * `~/.codex/auth.json`; Muse never sees or stores the ChatGPT credential.
 *
 * This is an UNOFFICIAL third-party route, opt-in and OFF by default. It is
 * `cloud` (egresses to OpenAI via the subscription), so `MUSE_LOCAL_ONLY=true`
 * refuses it at the model-router gate before this adapter is ever constructed.
 *
 * The subprocess bridge uses the VERIFIED-safe invocation:
 *   codex exec --skip-git-repo-check --ephemeral -s read-only -C <tmp> -o <out> "<prompt>"
 * `-s read-only` (no file writes / destructive commands), `--ephemeral` (no
 * session litter), `-C <neutral tmp dir>` (codex does NOT scan the caller's
 * repo), `-o <out>` (the final assistant message is written there — cleanest
 * extraction, no JSONL parsing). `runCodexExecSafe` is the SINGLE spawn code
 * path shared by the CLI's `runCodexExec`, so there is no divergent argv.
 */

import { spawn as nodeSpawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DEFAULT_MODEL_CALL_TIMEOUT_MS,
  ModelProviderError,
  parseModelName,
  type ModelCapabilities,
  type ModelEvent,
  type ModelInfo,
  type ModelProvider,
  type ModelRequest,
  type ModelResponse
} from "./index.js";

export const CODEX_PROVIDER_ID = "codex";

/** Sentinel model id meaning "let the codex CLI pick its own default" — no `-m`. */
export const CODEX_DEFAULT_MODEL_ID = "codex-default";

export type CodexSpawnLike = typeof nodeSpawn;

export interface CodexInvocationDeps {
  /** Model id to pass via `-m`; undefined / the sentinel omits it (codex default). */
  readonly model?: string;
  /** Kill the child + fail retryably after this many ms. Default 300s (model-call cap). */
  readonly timeoutMs?: number;
  /** Cooperative cancellation — an abort kills the child and fails NON-retryably. */
  readonly signal?: AbortSignal;
  /** Injectable spawn for unit tests (a fake child, no live subscription). */
  readonly spawn?: CodexSpawnLike;
  /** The codex binary name / path. Default `"codex"`. */
  readonly binary?: string;
  readonly env?: NodeJS.ProcessEnv;
  /** Injectable neutral-workspace factory (test seam). Defaults to `mkdtemp`. */
  readonly makeWorkspace?: () => Promise<{ readonly dir: string; readonly outFile: string }>;
}

export interface CodexInvocationResult {
  readonly output: string;
  readonly exitCode: number | null;
  readonly stderr: string;
  readonly usage?: { readonly outputTokens: number };
}

async function defaultWorkspace(): Promise<{ readonly dir: string; readonly outFile: string }> {
  const dir = await mkdtemp(join(tmpdir(), "muse-codex-"));
  return { dir, outFile: join(dir, "codex-output.txt") };
}

/**
 * Build the exact argv for the verified-safe non-interactive codex run. Pure so
 * the arg contract is unit-testable without spawning. `prompt` is the LAST
 * positional so codex reads it as the instruction.
 */
export function buildCodexExecArgs(params: {
  readonly cwd: string;
  readonly outFile: string;
  readonly prompt: string;
  readonly model?: string;
}): readonly string[] {
  const { cwd, outFile, prompt, model } = params;
  const args = [
    "exec",
    "--skip-git-repo-check",
    "--ephemeral",
    "-s",
    "read-only",
    "-C",
    cwd,
    "-o",
    outFile
  ];
  if (model && model !== CODEX_DEFAULT_MODEL_ID) {
    args.push("-m", model);
  }
  args.push(prompt);
  return args;
}

function parseCodexTokensUsed(diagnostics: string): number | undefined {
  const match =
    /tokens used[:\s]+([\d,]+)/iu.exec(diagnostics) ?? /([\d,]+)\s+tokens used/iu.exec(diagnostics);
  const digits = match?.[1];
  if (!digits) {
    return undefined;
  }
  const value = Number(digits.replace(/,/gu, ""));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function codexErrorFromExit(exitCode: number | null, diagnostics: string): ModelProviderError {
  const lower = diagnostics.toLowerCase();
  const looksLikeAuth =
    lower.includes("not logged in")
    || lower.includes("unauthorized")
    || lower.includes("login")
    || lower.includes("authenticate")
    || lower.includes("401");
  const detail = diagnostics.trim().slice(0, 500) || `codex exited with code ${String(exitCode)}`;
  const hint = looksLikeAuth
    ? " — run `codex login` to sign in with your ChatGPT subscription"
    : " — is the official `codex` CLI installed and on PATH? (npm i -g @openai/codex)";
  // Both classes are the caller's to fix (auth / install / bad request), never a
  // transient blip, so NON-retryable — a retry would burn subscription quota.
  return new ModelProviderError(CODEX_PROVIDER_ID, `codex exec failed: ${detail}${hint}`, false);
}

/**
 * Run ONE non-interactive completion through the official `codex exec` with the
 * verified-safe flags and return the final assistant message (read from the `-o`
 * file, not parsed from stdout). Honors `signal` (kills the child on abort →
 * NON-retryable error) and a timeout (kills the child → retryable error). Always
 * cleans up the neutral temp workspace.
 */
export async function runCodexExecSafe(prompt: string, deps: CodexInvocationDeps = {}): Promise<CodexInvocationResult> {
  const spawnImpl = deps.spawn ?? nodeSpawn;
  const binary = deps.binary ?? "codex";
  const timeoutMs = deps.timeoutMs ?? DEFAULT_MODEL_CALL_TIMEOUT_MS;

  if (deps.signal?.aborted) {
    throw new ModelProviderError(CODEX_PROVIDER_ID, "codex exec cancelled by the caller", false);
  }

  const workspace = await (deps.makeWorkspace ?? defaultWorkspace)();
  const args = buildCodexExecArgs({
    cwd: workspace.dir,
    outFile: workspace.outFile,
    prompt,
    ...(deps.model ? { model: deps.model } : {})
  });

  try {
    return await new Promise<CodexInvocationResult>((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let aborted = false;
      let settled = false;

      const child = spawnImpl(binary, args, {
        cwd: workspace.dir,
        env: deps.env ?? process.env,
        stdio: ["ignore", "pipe", "pipe"]
      });

      const timer =
        timeoutMs > 0
          ? setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
          }, timeoutMs)
          : undefined;

      const onAbort = (): void => {
        aborted = true;
        child.kill("SIGKILL");
      };
      if (deps.signal) {
        deps.signal.addEventListener("abort", onAbort, { once: true });
        // The signal can fire during the async workspace setup above, before the
        // listener existed — re-check so that abort is never dropped.
        if (deps.signal.aborted) {
          onAbort();
        }
      }

      const cleanup = (): void => {
        if (timer) clearTimeout(timer);
        if (deps.signal) deps.signal.removeEventListener("abort", onAbort);
      };

      child.stdout?.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });

      child.on("error", (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        // ENOENT etc. — the binary isn't runnable. Not transient; NON-retryable.
        reject(
          new ModelProviderError(
            CODEX_PROVIDER_ID,
            `could not run '${binary}': ${error.message} — is the official codex CLI installed and on PATH? (npm i -g @openai/codex)`,
            false
          )
        );
      });

      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        cleanup();
        const diagnostics = `${stderr}\n${stdout}`;
        if (aborted) {
          reject(new ModelProviderError(CODEX_PROVIDER_ID, "codex exec cancelled by the caller", false));
          return;
        }
        if (timedOut) {
          reject(
            new ModelProviderError(
              CODEX_PROVIDER_ID,
              `codex exec timed out after ${String(timeoutMs)}ms`,
              true
            )
          );
          return;
        }
        if (code !== 0) {
          reject(codexErrorFromExit(code, diagnostics));
          return;
        }
        readFile(workspace.outFile, "utf8")
          .then((raw) => {
            const tokens = parseCodexTokensUsed(diagnostics);
            resolve({
              exitCode: code,
              output: raw.trim(),
              stderr: stderr.trim(),
              ...(tokens !== undefined ? { usage: { outputTokens: tokens } } : {})
            });
          })
          .catch((cause: unknown) => {
            reject(
              new ModelProviderError(
                CODEX_PROVIDER_ID,
                `codex exec produced no readable output file: ${cause instanceof Error ? cause.message : String(cause)}`,
                false
              )
            );
          });
      });
    });
  } finally {
    await rm(workspace.dir, { force: true, recursive: true }).catch(() => undefined);
  }
}

export interface CodexCliProviderOptions {
  readonly id?: string;
  /** Model id (e.g. `"gpt-5.1"`). Undefined ⇒ the codex CLI default (no `-m`). */
  readonly model?: string;
  readonly models?: readonly string[];
  readonly spawn?: CodexSpawnLike;
  readonly binary?: string;
  readonly timeoutMs?: number;
  readonly env?: NodeJS.ProcessEnv;
  readonly makeWorkspace?: () => Promise<{ readonly dir: string; readonly outFile: string }>;
}

export function codexModelCapabilities(): ModelCapabilities {
  return {
    cost: "high",
    latencyProfile: "batch",
    local: false,
    maxInputTokens: 256_000,
    maxOutputTokens: 32_000,
    promptCaching: false,
    reasoning: false,
    streaming: false,
    // Codex is an autonomous agent, not a tool-call/structured-output API — it
    // returns a final assistant message only. Both stay false for the MVP.
    structuredOutput: false,
    toolCalling: false,
    vision: false
  };
}

/**
 * Flatten a Muse `ModelRequest`'s messages into ONE plain-text prompt for codex:
 * every system message first, then the conversation turns, each labeled by role.
 * codex has no chat-message channel here — it takes a single instruction string.
 */
export function flattenCodexPrompt(messages: readonly ModelRequest["messages"][number][]): string {
  const systems = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content.trim())
    .filter((content) => content.length > 0);
  const parts: string[] = [];
  if (systems.length > 0) {
    parts.push(`System:\n${systems.join("\n\n")}`);
  }
  for (const message of messages) {
    if (message.role === "system") {
      continue;
    }
    const label =
      message.role === "user"
        ? "User"
        : message.role === "assistant"
          ? "Assistant"
          : message.role === "tool"
            ? "Tool"
            : message.role;
    parts.push(`${label}:\n${message.content}`);
  }
  return parts.join("\n\n");
}

export class CodexCliProvider implements ModelProvider {
  readonly id: string;
  private readonly model?: string;
  private readonly models: readonly string[];
  private readonly invocationBase: Omit<CodexInvocationDeps, "model" | "signal">;

  constructor(options: CodexCliProviderOptions = {}) {
    this.id = options.id ?? CODEX_PROVIDER_ID;
    this.model = options.model;
    this.models = options.models ?? [options.model ?? CODEX_DEFAULT_MODEL_ID];
    this.invocationBase = {
      ...(options.spawn ? { spawn: options.spawn } : {}),
      ...(options.binary ? { binary: options.binary } : {}),
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.env ? { env: options.env } : {}),
      ...(options.makeWorkspace ? { makeWorkspace: options.makeWorkspace } : {})
    };
  }

  async listModels(): Promise<readonly ModelInfo[]> {
    return this.models.map((modelId) => ({
      capabilities: codexModelCapabilities(),
      displayName: `Codex ${modelId}`,
      modelId,
      providerId: this.id
    }));
  }

  private resolveModelId(requestModel: string): string | undefined {
    const requested = parseModelName(requestModel ?? "").modelId;
    const modelId = requested && requested !== CODEX_DEFAULT_MODEL_ID && requested !== this.id ? requested : this.model;
    return modelId && modelId !== CODEX_DEFAULT_MODEL_ID ? modelId : undefined;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    // request.tools is deliberately IGNORED — codex is an agent, not a tool-call
    // API; this provider never returns toolCalls.
    const prompt = flattenCodexPrompt([...request.messages]);
    const modelId = this.resolveModelId(request.model);
    const result = await runCodexExecSafe(prompt, {
      ...this.invocationBase,
      ...(modelId ? { model: modelId } : {}),
      ...(request.signal ? { signal: request.signal } : {})
    });
    return {
      id: `codex-${Date.now().toString(36)}`,
      model: request.model || `${this.id}/${this.model ?? CODEX_DEFAULT_MODEL_ID}`,
      output: result.output,
      ...(result.usage ? { usage: result.usage } : {})
    };
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelEvent> {
    const response = await this.generate(request);
    if (response.output.length > 0) {
      yield { text: response.output, type: "text-delta" };
    }
    yield { response, type: "done" };
  }
}
