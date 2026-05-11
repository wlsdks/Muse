/**
 * Setup-status snapshot — shared shape consumed by `muse setup --json`
 * (apps/cli) and `GET /api/setup/status` (apps/api). Both surfaces
 * agree on a single source of truth: model / mcp / calendar / notes
 * / tasks / voice / messaging sections, each with a coarse
 * `status: "ok" | "todo" | "info"` plus section-specific detail.
 *
 * The detection helpers (readModelKeyState etc.) are also exported
 * so the CLI text renderer can keep showing the same data points
 * without re-implementing the per-file scans.
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join as pathJoin } from "node:path";

import {
  mergeModelKeysFromFile,
  resolveLocalCalendarFile,
  resolveMessagingCredentialsFile,
  resolveNotesDir,
  resolveTasksFile,
  type MuseEnvironment
} from "./index.js";

export interface SetupStatusSnapshot {
  readonly model: {
    readonly status: "ok" | "todo";
    readonly muse_model?: string;
    readonly keysFile: string;
    readonly providerKeys: readonly string[];
  };
  readonly mcp: { readonly status: "ok" | "info"; readonly file: string; readonly externalServerCount: number };
  readonly calendar: {
    readonly local: { readonly status: "ok" | "info"; readonly file: string; readonly bytes?: number };
    readonly credentials: { readonly status: "ok" | "info"; readonly file: string };
  };
  readonly notes: { readonly status: "ok" | "info"; readonly dir: string; readonly fileCount?: number };
  readonly tasks: { readonly status: "ok" | "info"; readonly file: string; readonly entryCount?: number };
  readonly voice: { readonly status: "ok" | "info"; readonly source: "openai_api_key" | "muse_voice_openai_api_key" | "none" };
  readonly messaging: { readonly status: "ok" | "info"; readonly providers: readonly string[] };
}

/**
 * Capture a fresh snapshot of the user's setup state. Both surfaces
 * (CLI --json, REST /api/setup/status) call this with no arguments;
 * the env-merge mirrors autoconfigure's runtime boot so the snapshot
 * reflects what the next `muse` invocation will see, not just raw
 * process.env (Loop #56's UX-drift fix).
 */
export async function collectSetupStatusJson(): Promise<SetupStatusSnapshot> {
  const env = mergeModelKeysFromFile(process.env as Record<string, string | undefined>);
  const home = homedir();

  const modelKeysFile = env.MUSE_MODEL_KEYS_FILE?.trim() && env.MUSE_MODEL_KEYS_FILE.trim().length > 0
    ? env.MUSE_MODEL_KEYS_FILE.trim()
    : pathJoin(home, ".muse", "models.json");
  const providerKeys = await readModelKeyState(modelKeysFile, env);
  const museModel = env.MUSE_MODEL?.trim() ?? "";

  const mcpFile = env.MUSE_MCP_CONFIG?.trim() && env.MUSE_MCP_CONFIG.trim().length > 0
    ? env.MUSE_MCP_CONFIG.trim()
    : pathJoin(home, ".muse", "mcp.json");
  const mcpCount = await readMcpEntryCount(mcpFile);

  const calendarFile = resolveLocalCalendarFile(env);
  const calendarBytes = await statBytes(calendarFile);
  const credentialsFile = pathJoin(home, ".muse", "credentials.json");
  const credentialsBytes = await statBytes(credentialsFile);

  const notesDir = resolveNotesDir(env);
  const notesCount = await countNotes(notesDir);
  const tasksFile = resolveTasksFile(env);
  const tasksCount = await readTaskCount(tasksFile);

  const voiceFromBase = Boolean(env.OPENAI_API_KEY?.trim());
  const voiceFromMuse = Boolean(env.MUSE_VOICE_OPENAI_API_KEY?.trim());
  const voiceSource: "openai_api_key" | "muse_voice_openai_api_key" | "none" = voiceFromMuse
    ? "muse_voice_openai_api_key"
    : voiceFromBase ? "openai_api_key" : "none";

  const messagingFile = resolveMessagingCredentialsFile(env);
  const messagingHits = await readMessagingProviderState(messagingFile, env);

  return {
    calendar: {
      credentials: {
        file: credentialsFile,
        status: credentialsBytes !== undefined ? "ok" : "info"
      },
      local: {
        file: calendarFile,
        status: calendarBytes !== undefined ? "ok" : "info",
        ...(calendarBytes !== undefined ? { bytes: calendarBytes } : {})
      }
    },
    messaging: {
      providers: messagingHits,
      status: messagingHits.length > 0 ? "ok" : "info"
    },
    mcp: {
      externalServerCount: mcpCount,
      file: mcpFile,
      status: mcpCount > 0 ? "ok" : "info"
    },
    model: {
      keysFile: modelKeysFile,
      providerKeys,
      status: museModel.length > 0 || providerKeys.length > 0 ? "ok" : "todo",
      ...(museModel.length > 0 ? { muse_model: museModel } : {})
    },
    notes: {
      dir: notesDir,
      status: notesCount !== undefined ? "ok" : "info",
      ...(notesCount !== undefined ? { fileCount: notesCount } : {})
    },
    tasks: {
      file: tasksFile,
      status: tasksCount !== undefined ? "ok" : "info",
      ...(tasksCount !== undefined ? { entryCount: tasksCount } : {})
    },
    voice: {
      source: voiceSource,
      status: voiceSource === "none" ? "info" : "ok"
    }
  };
}

export async function readModelKeyState(file: string, env: MuseEnvironment): Promise<readonly string[]> {
  let storedProviders: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as { providers?: Record<string, unknown> };
    if (parsed && typeof parsed === "object" && parsed.providers && typeof parsed.providers === "object") {
      storedProviders = parsed.providers;
    }
  } catch {
    // missing or malformed → treat as empty
  }
  const lines: string[] = [];
  const probe = (id: string, envKey: string): void => {
    const fromEnv = env[envKey]?.trim();
    const fromFile = isRecord(storedProviders[id]) && typeof storedProviders[id].token === "string"
      ? "file"
      : undefined;
    if (fromEnv && fromEnv.length > 0) {
      lines.push(`${id} (env)`);
    } else if (fromFile) {
      lines.push(`${id} (file)`);
    }
  };
  probe("openai", "OPENAI_API_KEY");
  probe("anthropic", "ANTHROPIC_API_KEY");
  probe("gemini", "GEMINI_API_KEY");
  probe("openrouter", "OPENROUTER_API_KEY");
  probe("ollama", "OLLAMA_BASE_URL");
  return lines;
}

export async function readMessagingProviderState(file: string, env: MuseEnvironment): Promise<readonly string[]> {
  let storedProviders: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as { providers?: Record<string, unknown> };
    if (parsed && typeof parsed === "object" && parsed.providers && typeof parsed.providers === "object") {
      storedProviders = parsed.providers;
    }
  } catch {
    // missing or malformed → treat as empty
  }
  const lines: string[] = [];
  const probe = (id: string, envKey: string): void => {
    const fromEnv = env[envKey]?.trim();
    const fromFile = isRecord(storedProviders[id]) && typeof storedProviders[id].token === "string"
      ? "file"
      : undefined;
    if (fromEnv && fromEnv.length > 0) {
      lines.push(`${id} (env)`);
    } else if (fromFile) {
      lines.push(`${id} (file)`);
    }
  };
  probe("telegram", "MUSE_TELEGRAM_BOT_TOKEN");
  probe("discord", "MUSE_DISCORD_BOT_TOKEN");
  probe("slack", "MUSE_SLACK_BOT_TOKEN");
  probe("line", "MUSE_LINE_CHANNEL_ACCESS_TOKEN");
  return lines;
}

export async function readMcpEntryCount(file: string): Promise<number> {
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as { mcpServers?: Record<string, unknown> };
    if (parsed && typeof parsed === "object" && parsed.mcpServers && typeof parsed.mcpServers === "object") {
      return Object.keys(parsed.mcpServers).length;
    }
  } catch {
    // missing / malformed → treat as zero
  }
  return 0;
}

export async function statBytes(file: string): Promise<number | undefined> {
  try {
    const stat = await fs.stat(file);
    return stat.size;
  } catch {
    return undefined;
  }
}

export async function countNotes(dir: string): Promise<number | undefined> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    let total = 0;
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      if (entry.isFile() && /\.(md|markdown|txt)$/iu.test(entry.name)) {
        total += 1;
      } else if (entry.isDirectory()) {
        total += 1; // count subdirs as a single bucket without recursing — `muse today` does the deep walk
      }
    }
    return total;
  } catch {
    return undefined;
  }
}

export async function readTaskCount(file: string): Promise<number | undefined> {
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as { tasks?: unknown };
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.tasks)) {
      return parsed.tasks.length;
    }
    return 0;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
