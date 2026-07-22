import { promises as fs } from "node:fs";

import { isRecord, parseStrictJson } from "@muse/shared";

import type { Conversation, ConversationTurn } from "./conversation-store.js";

export const EXACT_CONVERSATION_FILE_MAX_BYTES = 32 * 1024 * 1024;
const EXACT_CONVERSATION_MAX_RECORDS = 5_000;
const CANONICAL_CONVERSATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const CANONICAL_UTC_MILLISECOND_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export class ConversationExactReadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ConversationExactReadError";
  }
}

export function isCanonicalConversationId(value: unknown): value is string {
  return typeof value === "string" && CANONICAL_CONVERSATION_ID.test(value);
}

async function closeArchive(handle: Awaited<ReturnType<typeof fs.open>>): Promise<void> {
  try {
    await handle.close();
  } catch (cause) {
    throw new ConversationExactReadError("conversation archive could not be closed", { cause });
  }
}

function hasExactKeys(value: Readonly<Record<string, unknown>>, required: readonly string[], optional: readonly string[] = []): boolean {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return required.every((key) => Object.hasOwn(value, key)) && keys.every((key) => allowed.has(key));
}

function isCanonicalTimestamp(value: unknown): value is string {
  return typeof value === "string"
    && CANONICAL_UTC_MILLISECOND_ISO.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function parseTurn(value: unknown): ConversationTurn {
  if (!isRecord(value)
    || !hasExactKeys(value, ["content", "role"], ["at", "untrustedOnly", "userId"])
    || (value.role !== "user" && value.role !== "assistant" && value.role !== "system")
    || typeof value.content !== "string"
    || (value.at !== undefined && !isCanonicalTimestamp(value.at))
    || (value.untrustedOnly !== undefined && typeof value.untrustedOnly !== "boolean")
    || (value.userId !== undefined && typeof value.userId !== "string")) {
    throw new ConversationExactReadError("conversation archive contains an invalid turn");
  }
  return {
    content: value.content,
    role: value.role,
    ...(value.at !== undefined ? { at: value.at } : {}),
    ...(value.untrustedOnly !== undefined ? { untrustedOnly: value.untrustedOnly } : {}),
    ...(value.userId !== undefined ? { userId: value.userId } : {})
  };
}

function parseConversation(mapKey: string, value: unknown): Conversation {
  if (!isRecord(value)
    || !hasExactKeys(value, ["createdAt", "id", "origin", "title", "turns", "updatedAt"])
    || typeof value.id !== "string"
    || value.id.length === 0
    || value.id !== mapKey
    || typeof value.title !== "string"
    || typeof value.origin !== "string"
    || value.origin.length === 0
    || !isCanonicalTimestamp(value.createdAt)
    || !isCanonicalTimestamp(value.updatedAt)
    || !Array.isArray(value.turns)
    || value.turns.length > 200) {
    throw new ConversationExactReadError(`conversation archive contains an invalid record for '${mapKey}'`);
  }
  return {
    createdAt: value.createdAt,
    id: value.id,
    origin: value.origin,
    title: value.title,
    turns: value.turns.map(parseTurn),
    updatedAt: value.updatedAt
  };
}

async function readStrictArchive(file: string): Promise<readonly Conversation[]> {
  let handle: Awaited<ReturnType<typeof fs.open>>;
  try {
    handle = await fs.open(file, "r");
  } catch (cause) {
    if (isRecord(cause) && cause.code === "ENOENT") return [];
    throw new ConversationExactReadError("conversation archive could not be opened", { cause });
  }
  try {
    const before = await handle.stat();
    if (before.size > EXACT_CONVERSATION_FILE_MAX_BYTES) {
      throw new ConversationExactReadError("conversation archive exceeds the size limit");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (bytes.byteLength > EXACT_CONVERSATION_FILE_MAX_BYTES || after.size > EXACT_CONVERSATION_FILE_MAX_BYTES) {
      throw new ConversationExactReadError("conversation archive exceeds the size limit");
    }
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (cause) {
      throw new ConversationExactReadError("conversation archive is not valid UTF-8", { cause });
    }
    const parsed = parseStrictJson(text, {
      maxArrayItems: 200,
      maxDepth: 8,
      maxNodes: 2_000_000,
      maxObjectMembers: 5_002
    });
    if (!isRecord(parsed)
      || !hasExactKeys(parsed, ["conversations", "version"])
      || parsed.version !== 1
      || !isRecord(parsed.conversations)) {
      throw new ConversationExactReadError("conversation archive has an unsupported schema");
    }
    const entries = Object.entries(parsed.conversations);
    if (entries.length > EXACT_CONVERSATION_MAX_RECORDS) {
      throw new ConversationExactReadError("conversation archive exceeds the record limit");
    }
    return entries.map(([key, value]) => parseConversation(key, value));
  } catch (cause) {
    if (cause instanceof ConversationExactReadError) throw cause;
    throw new ConversationExactReadError("conversation archive is invalid", { cause });
  } finally {
    await closeArchive(handle);
  }
}

export async function readExactConversationCatalog(file: string): Promise<readonly Conversation[]> {
  return readStrictArchive(file);
}

export async function readExactConversation(file: string, artifactId: string): Promise<Conversation | undefined> {
  return (await readStrictArchive(file)).find((conversation) => conversation.id === artifactId);
}
