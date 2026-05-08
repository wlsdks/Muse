/**
 * Reactor-compat document/RAG store helpers extracted from
 * reactor-compat-routes.ts.
 *
 * Each store helper dispatches to options.ragIngestion?.documentStore (the
 * configured StoredRagDocument store) when present, otherwise falls back to
 * the file-private compat state via the getStateDocuments accessor.
 */

import type { StoredRagDocument } from "@muse/rag";
import type { JsonObject } from "@muse/shared";
import type { FastifyReply } from "fastify";
import { createHash } from "node:crypto";
import {
  createRecord,
  getStateDocuments,
  jsonObjectField,
  readBodyNullableString,
  readBodyString,
  readBoolean,
  readNumber,
  stringArrayField,
  stringField,
  toBody,
  type CompatBody,
  type CompatRecord,
  type ReactorCompatibilityRouteOptions
} from "./reactor-compat-routes.js";

const DOCUMENT_CONTENT_HASH_KEY = "content_hash";

export async function createDocument(options: ReactorCompatibilityRouteOptions, bodyValue: unknown): Promise<CompatRecord> {
  const body = toBody(bodyValue);
  const content = readBodyString(body, "content") ?? "";
  const metadata = documentMetadata(body);
  return saveDocumentRecord(options, {
    chunkCount: 1,
    chunkIds: [],
    content,
    indexed: true,
    metadata: {
      ...metadata,
      [DOCUMENT_CONTENT_HASH_KEY]: computeContentHash(content)
    }
  });
}

export function toDocumentResponse(record: JsonObject) {
  return {
    chunkCount: readNumber(record.chunkCount, 1),
    chunkIds: stringArrayField(record.chunkIds, []),
    content: stringField(record.content, ""),
    id: stringField(record.id, ""),
    metadata: jsonObjectField(record.metadata)
  };
}

export function toSearchResultResponse(record: JsonObject) {
  return {
    content: stringField(record.content, ""),
    id: stringField(record.id, ""),
    metadata: jsonObjectField(record.metadata),
    score: null
  };
}

export async function saveDocumentRecord(
  options: ReactorCompatibilityRouteOptions,
  record: JsonObject
): Promise<CompatRecord> {
  const content = stringField(record.content, "");
  const metadata = jsonObjectField(record.metadata);
  const contentHash = stringField(metadata[DOCUMENT_CONTENT_HASH_KEY], computeContentHash(content));
  const id = typeof record.id === "string" && record.id.length > 0 ? record.id : undefined;

  if (options.ragIngestion?.documentStore) {
    const recordMetadata = documentRecordMetadata(record, metadata);
    return storedRagDocumentToCompat(await options.ragIngestion.documentStore.save({
      chunkCount: readNumber(record.chunkCount, 1),
      chunkIds: stringArrayField(record.chunkIds, []),
      content,
      contentHash,
      id,
      indexed: readBoolean(record.indexed, true),
      metadata: {
        ...recordMetadata,
        [DOCUMENT_CONTENT_HASH_KEY]: contentHash
      },
      source: readBodyNullableString(record, "source")
    }));
  }

  return createRecord(getStateDocuments(), {
    ...record,
    metadata: {
      ...metadata,
      [DOCUMENT_CONTENT_HASH_KEY]: contentHash
    }
  }, "document");
}

function documentRecordMetadata(record: JsonObject, metadata: JsonObject): JsonObject {
  const ignored = new Set(["chunkCount", "chunkIds", "content", "createdAt", "id", "indexed", "metadata", "updatedAt"]);
  const extra = Object.fromEntries(Object.entries(record).filter(([key]) => !ignored.has(key)));
  return {
    ...extra,
    ...metadata
  };
}

export async function listDocuments(
  options: ReactorCompatibilityRouteOptions,
  listOptions: { readonly limit?: number } = {}
): Promise<readonly CompatRecord[]> {
  const stored = await options.ragIngestion?.documentStore?.list(listOptions);
  return stored ? stored.map(storedRagDocumentToCompat) : [...getStateDocuments().values()].slice(0, listOptions.limit ?? 100);
}

export async function searchDocuments(
  options: ReactorCompatibilityRouteOptions,
  query: string,
  searchOptions: { readonly limit?: number } = {}
): Promise<readonly CompatRecord[]> {
  const stored = await options.ragIngestion?.documentStore?.search(query, searchOptions);

  if (stored) {
    return stored.map(storedRagDocumentToCompat);
  }

  return [...getStateDocuments().values()]
    .filter((document) => JSON.stringify(document).toLowerCase().includes(query))
    .slice(0, searchOptions.limit ?? 5);
}

export async function deleteDocument(options: ReactorCompatibilityRouteOptions, id: string): Promise<boolean> {
  if (options.ragIngestion?.documentStore) {
    return options.ragIngestion.documentStore.delete(id);
  }

  return getStateDocuments().delete(id);
}

export async function deleteDocuments(options: ReactorCompatibilityRouteOptions, ids: readonly string[]): Promise<number> {
  if (options.ragIngestion?.documentStore) {
    return options.ragIngestion.documentStore.deleteMany(ids);
  }

  let deleted = 0;

  for (const id of ids) {
    deleted += getStateDocuments().delete(id) ? 1 : 0;
  }

  return deleted;
}

export async function countDocuments(options: ReactorCompatibilityRouteOptions): Promise<number> {
  return options.ragIngestion?.documentStore
    ? options.ragIngestion.documentStore.count()
    : getStateDocuments().size;
}

function storedRagDocumentToCompat(document: StoredRagDocument): CompatRecord {
  return {
    chunkCount: document.chunkCount,
    chunkIds: [...document.chunkIds],
    content: document.content,
    createdAt: document.createdAt.toISOString(),
    id: document.id,
    indexed: document.indexed,
    metadata: document.metadata,
    source: document.source ?? null,
    updatedAt: document.updatedAt.toISOString()
  };
}

function documentMetadata(body: CompatBody): JsonObject {
  const metadata = jsonObjectField(body.metadata);
  return typeof body.title === "string" && body.title.trim().length > 0
    ? { ...metadata, title: body.title }
    : metadata;
}

export function validateAddDocumentBody(body: CompatBody): JsonObject | undefined {
  const content = readBodyString(body, "content");

  if (!content) {
    return { content: "Document content is required" };
  }

  if (content.length > 100_000) {
    return { content: "Document content must not exceed 100000 characters" };
  }

  if (Object.keys(jsonObjectField(body.metadata)).length > 50) {
    return { metadata: "Metadata must not exceed 50 entries" };
  }

  return undefined;
}

export async function findDocumentByContentHash(
  options: ReactorCompatibilityRouteOptions,
  contentHash: string
): Promise<CompatRecord | undefined> {
  const stored = await options.ragIngestion?.documentStore?.findByContentHash(contentHash);

  if (stored) {
    return storedRagDocumentToCompat(stored);
  }

  return [...getStateDocuments().values()].find((document) => {
    const metadata = jsonObjectField(document.metadata);
    return metadata[DOCUMENT_CONTENT_HASH_KEY] === contentHash;
  });
}

export function duplicateDocumentConflict(reply: FastifyReply, existingId: string) {
  return reply.status(409).send({
    error: "Document with identical content already exists",
    existingId
  });
}

export function computeContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
