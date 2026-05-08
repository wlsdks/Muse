/**
 * Reactor-compat user-memory + auth-identity helpers extracted from
 * reactor-compat-routes.ts.
 *
 * Each store helper dispatches to options.userMemoryStore (the configured
 * @muse/memory UserMemoryStore) when present, otherwise falls back to the
 * file-private compat state via getStateUserMemory.
 */

import { extractBearerToken, type AuthIdentity } from "@muse/auth";
import type { UserMemory } from "@muse/memory";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  errorResponse,
  getStateUserMemory,
  nowIso,
  readBodyString,
  toBody,
  type ReactorCompatibilityRouteOptions
} from "./reactor-compat-routes.js";

export async function updateUserMemory(
  request: FastifyRequest,
  reply: FastifyReply,
  key: "facts" | "preferences",
  options?: ReactorCompatibilityRouteOptions
) {
  const { userId } = request.params as { readonly userId: string };
  const body = toBody(request.body);
  const itemKey = readBodyString(body, "key")?.trim();
  const itemValue = readBodyString(body, "value")?.trim();

  if (!itemKey || !itemValue) {
    return reply.status(400).send(errorResponse("Body must include non-empty key and value"));
  }

  if (options?.userMemoryStore) {
    await (key === "facts"
      ? options.userMemoryStore.upsertFact(userId, itemKey, itemValue)
      : options.userMemoryStore.upsertPreference(userId, itemKey, itemValue));
    return { updated: true };
  }

  const store = getStateUserMemory();
  const existing = store.get(userId) ?? {
    facts: {},
    preferences: {},
    recentTopics: [],
    updatedAt: nowIso()
  };
  const updated = {
    facts: key === "facts" ? { ...existing.facts, [itemKey]: itemValue } : existing.facts,
    preferences: key === "preferences" ? { ...existing.preferences, [itemKey]: itemValue } : existing.preferences,
    recentTopics: existing.recentTopics,
    updatedAt: nowIso()
  };
  store.set(userId, updated);
  return { updated: true };
}

export async function readUserMemory(
  options: ReactorCompatibilityRouteOptions,
  userId: string
): Promise<UserMemory | {
  readonly facts: Record<string, string>;
  readonly preferences: Record<string, string>;
  readonly recentTopics: string[];
  readonly updatedAt: string;
} | undefined> {
  return await options.userMemoryStore?.findByUserId(userId) ?? getStateUserMemory().get(userId);
}

export async function deleteUserMemory(options: ReactorCompatibilityRouteOptions, userId: string): Promise<void> {
  await options.userMemoryStore?.deleteByUserId(userId);
  getStateUserMemory().delete(userId);
}

export async function canAccessUserMemory(
  request: FastifyRequest,
  options: ReactorCompatibilityRouteOptions,
  userId: string
): Promise<boolean> {
  if (userId.trim().length === 0 || userId.toLowerCase() === "anonymous") {
    return false;
  }

  const identity = await currentAuthIdentity(request, options);
  return Boolean(identity?.userId && identity.userId === userId && identity.userId.toLowerCase() !== "anonymous");
}

export async function currentAuthIdentity(
  request: FastifyRequest,
  options: ReactorCompatibilityRouteOptions
): Promise<AuthIdentity | undefined> {
  return (request as { auth?: AuthIdentity }).auth
    ?? await options.authService?.authenticateBearer(extractBearerToken(request.headers.authorization));
}

export function toUserMemoryResponse(memory: {
  readonly facts: Record<string, string>;
  readonly preferences: Record<string, string>;
  readonly recentTopics: readonly string[];
  readonly updatedAt: string | Date;
}) {
  return {
    facts: memory.facts,
    preferences: memory.preferences,
    recentTopics: [...memory.recentTopics],
    updatedAt: memory.updatedAt instanceof Date ? memory.updatedAt.toISOString() : memory.updatedAt
  };
}

export function userForbidden(reply: FastifyReply) {
  return reply.status(403).send({
    error: "관리자 권한이 필요합니다",
    timestamp: nowIso()
  });
}

export function userMemoryNotFound(reply: FastifyReply, userId: string) {
  return reply.status(404).send({
    error: `User memory not found: ${userId}`,
    timestamp: nowIso()
  });
}
