/**
 * Cross-session input history for the Ink chat — the lines you've typed,
 * recalled with ↑/↓ like a shell. Persists to `~/.muse/chat-input-history`
 * (override: `MUSE_INPUT_HISTORY_FILE`), one entry per line, capped. Append is
 * best-effort and never blocks the chat.
 */

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const DEFAULT_CAP = 200;

function historyFile(): string {
  const fromEnv = process.env.MUSE_INPUT_HISTORY_FILE?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : path.join(homedir(), ".muse", "chat-input-history");
}

/** Parse stored history into oldest→newest non-blank entries, capped. Pure. */
export function parseInputHistory(raw: string, cap = DEFAULT_CAP): string[] {
  const lines = raw
    .split("\n")
    .map((line) => line.replace(/\r$/u, ""))
    .filter((line) => line.trim().length > 0);
  return lines.slice(-Math.max(1, cap));
}

/** Load recent inputs (oldest→newest) for seeding the ↑/↓ recall ring. */
export async function loadInputHistory(cap = DEFAULT_CAP): Promise<string[]> {
  try {
    return parseInputHistory(await readFile(historyFile(), "utf8"), cap);
  } catch {
    return [];
  }
}

/** Append one submitted line (newlines flattened to spaces). Best-effort. */
export async function appendInputHistory(line: string): Promise<void> {
  const value = line.trim();
  if (value.length === 0) return;
  try {
    const file = historyFile();
    await mkdir(path.dirname(file), { recursive: true });
    await appendFile(file, `${value.replace(/\n/gu, " ")}\n`, "utf8");
  } catch {
    /* best-effort — a failed write just loses this turn's history entry */
  }
}
