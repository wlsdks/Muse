import type { JsonObject, JsonValue } from "@muse/shared";
import type { MuseTool, ToolRisk } from "@muse/tools";
import { createMcpMuseTool, type McpConnection, type McpRemoteTool } from "./index.js";

/**
 * Loopback MCP servers — provider-neutral built-in MCP surfaces.
 *
 * The MCP layer in Muse normally connects to external MCP servers over stdio /
 * SSE / streamable HTTP. To prove the MCP path works without external
 * processes (and to ship a JARVIS-style baseline), this module supplies an
 * in-process `McpConnection` adapter plus three reference servers (time,
 * text-utils, math) that operators can register alongside any external MCP
 * server.
 *
 * Each loopback server exposes a curated set of tools whose `execute` runs
 * in-process. They are read-risk by default, deterministic, and require no
 * credentials so they can ship by default.
 */

export interface LoopbackMcpToolDefinition extends McpRemoteTool {
  execute(args: JsonObject): Promise<string | JsonValue> | string | JsonValue;
}

export interface LoopbackMcpServer {
  readonly name: string;
  readonly description?: string;
  readonly tools: readonly LoopbackMcpToolDefinition[];
}

/**
 * Wrap a loopback server as an `McpConnection` so the rest of the MCP stack
 * (tool catalog, security policy, MuseTool adapter, span tracer) can treat it
 * exactly like an external MCP server.
 */
export function createLoopbackMcpConnection(server: LoopbackMcpServer): McpConnection {
  const tools = new Map(server.tools.map((tool) => [tool.name, tool] as const));
  return {
    callTool: async (toolName, args) => {
      const tool = tools.get(toolName);
      if (!tool) {
        return `Error: MCP tool '${toolName}' is not registered on '${server.name}'`;
      }
      try {
        const result = await tool.execute(args);
        return result;
      } catch (error) {
        return `Error: MCP tool '${toolName}' on '${server.name}' threw — ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    close: async () => {
      // Loopback servers have no resource to release.
    },
    listTools: async () =>
      server.tools.map((tool) => ({
        description: tool.description,
        inputSchema: tool.inputSchema ?? {},
        name: tool.name,
        ...(tool.risk ? { risk: tool.risk } : {})
      } satisfies McpRemoteTool))
  };
}

/**
 * Convenience: register every tool of the loopback server as a Muse tool with
 * the same `<server>.<tool>` namespacing used by external MCP servers.
 */
export function createLoopbackMcpMuseTools(server: LoopbackMcpServer): readonly MuseTool[] {
  const connection = createLoopbackMcpConnection(server);
  return server.tools.map((tool) =>
    createMcpMuseTool(
      server.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema ?? {},
        name: tool.name,
        ...(tool.risk ? { risk: tool.risk } : {})
      },
      connection
    )
  );
}

export interface BuiltinLoopbackOptions {
  readonly now?: () => Date;
}

/** Reference loopback server: read-only time / clock utilities. */
export function createTimeMcpServer(options: BuiltinLoopbackOptions = {}): LoopbackMcpServer {
  const now = options.now ?? (() => new Date());
  return {
    description: "Built-in clock and date utilities (loopback MCP).",
    name: "muse.time",
    tools: [
      {
        description: "Returns the current ISO timestamp, epoch milliseconds, and the resolved IANA timezone.",
        execute: (args): JsonObject => {
          const at = now();
          const timezone = readOptionalString(args, "timezone") ?? "UTC";
          try {
            const formatter = new Intl.DateTimeFormat("en-US", {
              timeZone: timezone,
              weekday: "long"
            });
            return {
              dayOfWeek: formatter.format(at),
              epochMs: at.getTime(),
              iso: at.toISOString(),
              timezone
            } satisfies JsonObject;
          } catch {
            return { error: `unsupported timezone: ${timezone}` };
          }
        },
        inputSchema: {
          additionalProperties: false,
          properties: {
            timezone: { type: "string" }
          },
          type: "object"
        },
        name: "now",
        risk: "read"
      },
      {
        description: "Returns the duration in milliseconds from `from` to `to` (negative if `to` precedes `from`).",
        execute: (args): JsonObject => {
          const from = readDate(args, "from");
          const to = readDate(args, "to");
          if (!from || !to) {
            return { error: "from/to must be valid ISO-8601 strings" };
          }
          return { milliseconds: to.getTime() - from.getTime() } satisfies JsonObject;
        },
        inputSchema: {
          additionalProperties: false,
          properties: {
            from: { type: "string" },
            to: { type: "string" }
          },
          required: ["from", "to"],
          type: "object"
        },
        name: "diff_ms",
        risk: "read"
      }
    ]
  };
}

/** Reference loopback server: text utilities. */
export function createTextUtilsMcpServer(): LoopbackMcpServer {
  return {
    description: "Built-in text utilities (loopback MCP).",
    name: "muse.text",
    tools: [
      {
        description: "Returns word, character, and line counts for the input text.",
        execute: (args): JsonObject => {
          const text = readString(args, "text") ?? "";
          if (text.trim().length === 0) {
            return { characters: 0, lines: 0, words: 0 } satisfies JsonObject;
          }
          const words = text.trim().split(/\s+/u).filter((segment) => segment.length > 0).length;
          const lines = text.split(/\r?\n/u).length;
          return { characters: text.length, lines, words } satisfies JsonObject;
        },
        inputSchema: {
          additionalProperties: false,
          properties: { text: { type: "string" } },
          required: ["text"],
          type: "object"
        },
        name: "stats",
        risk: "read"
      },
      {
        description: "Reverses the input text. Useful for unit tests and sanity checks.",
        execute: (args): JsonObject => {
          const text = readString(args, "text") ?? "";
          return { reversed: [...text].reverse().join("") } satisfies JsonObject;
        },
        inputSchema: {
          additionalProperties: false,
          properties: { text: { type: "string" } },
          required: ["text"],
          type: "object"
        },
        name: "reverse",
        risk: "read"
      }
    ]
  };
}

const SAFE_MATH_PATTERN = /^[\s\d+\-*/().,%]+$/u;

/** Reference loopback server: arithmetic without `eval`. */
export function createMathMcpServer(): LoopbackMcpServer {
  return {
    description: "Safe arithmetic evaluation (loopback MCP).",
    name: "muse.math",
    tools: [
      {
        description: "Evaluates an arithmetic expression composed of digits, parentheses, +, -, *, /, %.",
        execute: (args): JsonObject => {
          const expression = (readString(args, "expression") ?? "").trim();
          if (expression.length === 0) {
            return { error: "expression is required" };
          }
          if (expression.length > 256) {
            return { error: "expression exceeds 256 character limit" };
          }
          if (!SAFE_MATH_PATTERN.test(expression)) {
            return { error: "expression may only contain digits, parentheses, '.', ',' and + - * / %" };
          }
          try {
            const result = evaluateArithmetic(expression);
            if (!Number.isFinite(result)) {
              return { error: "expression evaluated to a non-finite number" };
            }
            return { expression, result } satisfies JsonObject;
          } catch (error) {
            return { error: error instanceof Error ? error.message : "expression evaluation failed" };
          }
        },
        inputSchema: {
          additionalProperties: false,
          properties: { expression: { type: "string" } },
          required: ["expression"],
          type: "object"
        },
        name: "evaluate",
        risk: "read"
      }
    ]
  };
}

/** All three reference loopback servers (time / text / math). */
export function createDefaultLoopbackMcpServers(options: BuiltinLoopbackOptions = {}): readonly LoopbackMcpServer[] {
  return [createTimeMcpServer(options), createTextUtilsMcpServer(), createMathMcpServer()];
}

function readString(args: JsonObject, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}

function readOptionalString(args: JsonObject, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readDate(args: JsonObject, key: string): Date | undefined {
  const value = args[key];
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function evaluateArithmetic(expression: string): number {
  let cursor = 0;
  const stripped = expression.replace(/,/gu, "");

  function parseExpression(): number {
    let value = parseTerm();
    while (cursor < stripped.length) {
      skip();
      const ch = stripped[cursor];
      if (ch === "+" || ch === "-") {
        cursor += 1;
        const right = parseTerm();
        value = ch === "+" ? value + right : value - right;
      } else {
        break;
      }
    }
    return value;
  }

  function parseTerm(): number {
    let value = parseFactor();
    while (cursor < stripped.length) {
      skip();
      const ch = stripped[cursor];
      if (ch === "*" || ch === "/" || ch === "%") {
        cursor += 1;
        const right = parseFactor();
        if (ch === "*") {
          value *= right;
        } else if (ch === "/") {
          if (right === 0) {
            throw new Error("division by zero");
          }
          value /= right;
        } else {
          if (right === 0) {
            throw new Error("modulo by zero");
          }
          value %= right;
        }
      } else {
        break;
      }
    }
    return value;
  }

  function parseFactor(): number {
    skip();
    const ch = stripped[cursor];
    if (ch === "+" || ch === "-") {
      cursor += 1;
      const inner = parseFactor();
      return ch === "+" ? inner : -inner;
    }
    if (ch === "(") {
      cursor += 1;
      const value = parseExpression();
      skip();
      if (stripped[cursor] !== ")") {
        throw new Error("unbalanced parentheses");
      }
      cursor += 1;
      return value;
    }
    return parseNumber();
  }

  function parseNumber(): number {
    skip();
    const start = cursor;
    while (cursor < stripped.length) {
      const ch = stripped[cursor] ?? "";
      if ((ch >= "0" && ch <= "9") || ch === ".") {
        cursor += 1;
      } else {
        break;
      }
    }
    if (cursor === start) {
      throw new Error("expected number");
    }
    const literal = stripped.slice(start, cursor);
    const value = Number.parseFloat(literal);
    if (Number.isNaN(value)) {
      throw new Error(`invalid number literal: ${literal}`);
    }
    return value;
  }

  function skip(): void {
    while (cursor < stripped.length && stripped[cursor] === " ") {
      cursor += 1;
    }
  }

  const value = parseExpression();
  skip();
  if (cursor !== stripped.length) {
    throw new Error("trailing characters after expression");
  }
  return value;
}

// Avoid unused-import warning for the type alias.
export type LoopbackToolRisk = ToolRisk;
