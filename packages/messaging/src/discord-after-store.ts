/**
 * Per-channel "after" cursor for Discord's
 * `GET /channels/:id/messages?after=<snowflake>` endpoint.
 *
 * Mirrors `telegram-offset-store.ts` but with a per-channel map
 * rather than a single integer — Discord doesn't have a global
 * "what's new?" stream; each channel is polled independently.
 *
 * Shape:
 *   { "version": 1, "after": { "<channelId>": "<snowflake>", ... } }
 *
 * Snowflakes are stored verbatim as strings (they're 64-bit IDs
 * serialised as decimal strings — JSON numbers would lose precision
 * on large values, and BigInt isn't JSON-native). Missing / malformed
 * file → undefined for the given channel, so the first poll falls
 * back to Discord's default (newest-first snapshot).
 */

import { promises as fs } from "node:fs";
import { dirname } from "node:path";

interface PersistedShape {
  readonly version: 1;
  readonly after: Readonly<Record<string, string>>;
}

export async function readDiscordAfter(file: string, channelId: string): Promise<string | undefined> {
  const map = await readMap(file);
  const value = map[channelId];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function writeDiscordAfter(file: string, channelId: string, after: string): Promise<void> {
  if (typeof after !== "string" || after.length === 0) {
    throw new TypeError(`after must be a non-empty string, got ${String(after)}`);
  }
  const existing = await readMap(file);
  const next: PersistedShape = {
    after: { ...existing, [channelId]: after },
    version: 1
  };
  const tmp = `${file}.tmp-${process.pid.toString()}-${Date.now().toString()}`;
  await fs.mkdir(dirname(file), { recursive: true });
  await fs.writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await fs.rename(tmp, file);
}

async function readMap(file: string): Promise<Readonly<Record<string, string>>> {
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
  const candidate = (parsed as { after?: unknown }).after;
  if (!candidate || typeof candidate !== "object") {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(candidate as Record<string, unknown>)) {
    if (typeof value === "string" && value.length > 0) {
      out[key] = value;
    }
  }
  return out;
}
