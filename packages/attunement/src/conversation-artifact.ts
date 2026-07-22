import { isCanonicalConversationId } from "@muse/stores";
import { stripUntrustedTerminalChars } from "@muse/shared";

import { AttunementStoreError, type ArtifactLinkValidator } from "./attunement-store.js";
import type { ExactArtifactResolver } from "./types.js";

export interface ConversationSourceTurn {
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
  readonly at?: string;
  readonly untrustedOnly?: boolean;
  readonly userId?: string;
}

export interface ConversationSourceRecord {
  readonly createdAt: string;
  readonly id: string;
  readonly origin: string;
  readonly title: string;
  readonly turns: readonly ConversationSourceTurn[];
  readonly updatedAt: string;
}

export type ExactConversationReader = (artifactId: string) => Promise<ConversationSourceRecord | undefined>;

export interface ConversationArtifactOptions {
  readonly readExactConversation: ExactConversationReader;
}

function normalizeDisplayText(value: string, limit: number): string {
  return stripUntrustedTerminalChars(value).replace(/\s+/gu, " ").trim().slice(0, limit);
}

function projectConversation(conversation: ConversationSourceRecord, artifactId: string) {
  if (conversation.id !== artifactId || !isCanonicalConversationId(conversation.id)) return undefined;
  if (conversation.origin !== "cli" && conversation.origin !== "web") {
    throw new AttunementStoreError("conversation continuity requires an owner-authored cli or web origin");
  }
  const ownerPrompt = [...conversation.turns]
    .reverse()
    .filter((turn) => turn.role === "user")
    .map((turn) => normalizeDisplayText(turn.content, 1_000))
    .find((content) => content.length > 0);
  if (!ownerPrompt) throw new AttunementStoreError("conversation continuity requires an owner prompt");
  const title = normalizeDisplayText(conversation.title, 240);
  return {
    conversationLastOwnerPrompt: ownerPrompt,
    conversationOrigin: conversation.origin as "cli" | "web",
    conversationUpdatedAt: conversation.updatedAt,
    title: title.length > 0 ? title : "(untitled conversation)"
  };
}

export function createConversationArtifactValidator(options: ConversationArtifactOptions): ArtifactLinkValidator {
  return async ({ artifactId, artifactType, providerId }) => {
    if (artifactType !== "conversation" || providerId !== "local") {
      throw new AttunementStoreError("conversation validation requires the local conversation source");
    }
    if (!isCanonicalConversationId(artifactId)) {
      throw new AttunementStoreError("conversation validation requires a canonical conversation id");
    }
    const conversation = await options.readExactConversation(artifactId);
    if (!conversation || conversation.id !== artifactId) {
      throw new AttunementStoreError(`no local conversation with exact id '${artifactId}'`);
    }
    projectConversation(conversation, artifactId);
    return { artifactId, artifactType, providerId };
  };
}

export function createConversationExactArtifactResolver(options: ConversationArtifactOptions): ExactArtifactResolver {
  return async (link) => {
    if (link.artifactType !== "conversation" || link.providerId !== "local" || link.role !== "context") return undefined;
    const conversation = await options.readExactConversation(link.artifactId);
    if (!conversation) return undefined;
    const projected = projectConversation(conversation, link.artifactId);
    return projected ? {
      artifactId: link.artifactId,
      artifactType: "conversation",
      providerId: "local",
      role: "context",
      ...projected
    } : undefined;
  };
}
