/**
 * Per-provider "last injected at" cursor for the agent-prompt
 * inbox-injection surface (Context Engineering Phase 2).
 *
 * Same file-shape as `telegram-offset-store` / `discord-after-store`:
 * a single JSON object versioned in case the schema evolves. Storage
 * is per-provider so a Slack daemon advancing its cursor never races
 * with a Discord daemon.
 *
 * `~/.muse/{providerId}-inbox-injection.json`
 *
 *   { version: 1, lastInjectedAt: { [source]: ISO8601 } }
 *
 * "source" mirrors `InboundMessage.source` — chat / channel / user id.
 * Telegram is the lone exception: it has a single global source,
 * which we key as `"_global"`.
 */

import { promises as fs } from "node:fs";
import { dirname } from "node:path";

interface PersistedShape {
  readonly version: 1;
  readonly lastInjectedAt: Readonly<Record<string, string>>;
}

export async function readInboxInjectionCursor(
  file: string
): Promise<Readonly<Record<string, string>>> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object") {
    return {};
  }
  const candidate = (parsed as { lastInjectedAt?: unknown }).lastInjectedAt;
  if (!candidate || typeof candidate !== "object") {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(candidate)) {
    if (typeof value === "string" && value.trim().length > 0) {
      out[key] = value;
    }
  }
  return out;
}

export async function writeInboxInjectionCursor(
  file: string,
  cursor: Readonly<Record<string, string>>
): Promise<void> {
  const payload: PersistedShape = { lastInjectedAt: cursor, version: 1 };
  const tmp = `${file}.tmp-${process.pid.toString()}-${Date.now().toString()}`;
  await fs.mkdir(dirname(file), { recursive: true });
  await fs.writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.rename(tmp, file);
}

/**
 * Merge an `advance` map into the persisted cursor. Each (source →
 * iso) pair is only written when the new ISO is strictly greater
 * than the existing one (string comparison works for ISO-8601 in UTC).
 * Returns the merged cursor so callers can avoid an extra read.
 */
export async function advanceInboxInjectionCursor(
  file: string,
  advance: Readonly<Record<string, string>>
): Promise<Readonly<Record<string, string>>> {
  const existing = await readInboxInjectionCursor(file);
  const merged: Record<string, string> = { ...existing };
  for (const [source, iso] of Object.entries(advance)) {
    const current = merged[source];
    if (!current || iso > current) {
      merged[source] = iso;
    }
  }
  await writeInboxInjectionCursor(file, merged);
  return merged;
}
