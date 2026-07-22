import { stripUntrustedTerminalChars } from "@muse/shared";

import { AttunementStoreError } from "./attunement-store.js";
import type { ArtifactLinkValidator } from "./attunement-store.js";
import { isCanonicalBrowsingVisitId, type ExactArtifactResolver } from "./types.js";

export interface BrowsingVisitSourceRecord {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly visitedAt: string;
}

export type ExactBrowsingVisitReader = (artifactId: string) => Promise<BrowsingVisitSourceRecord | undefined>;

export interface BrowsingVisitArtifactOptions {
  readonly readExactVisit: ExactBrowsingVisitReader;
}

const CANONICAL_UTC_MILLISECOND_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const UNSAFE_DISPLAY_CONTROL = /[\x00-\x1f\x7f-\x9f]/u;

export function createBrowsingVisitArtifactValidator(
  options: BrowsingVisitArtifactOptions
): ArtifactLinkValidator {
  return async ({ artifactId, artifactType, providerId }) => {
    if (artifactType !== "browsing-visit" || providerId !== "local") {
      throw new AttunementStoreError("browsing visit validation requires the local browsing-visit source");
    }
    if (!isCanonicalBrowsingVisitId(artifactId)) {
      throw new AttunementStoreError("browsing visit validation requires a canonical browsing visit id");
    }
    const visit = await options.readExactVisit(artifactId);
    if (!visit || visit.id !== artifactId) {
      throw new AttunementStoreError(`no local browsing visit with exact id '${artifactId}'`);
    }
    projectVisit(visit, artifactId);
    return { artifactId: visit.id, artifactType, providerId };
  };
}

function projectVisit(visit: BrowsingVisitSourceRecord, artifactId: string) {
  if (visit.id !== artifactId || !isCanonicalBrowsingVisitId(visit.id)) return undefined;
  if (visit.url.length > 2_000 || UNSAFE_DISPLAY_CONTROL.test(visit.url)) {
    throw new AttunementStoreError("browsing visit URL is not safe to display");
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(visit.url);
  } catch {
    throw new AttunementStoreError("browsing visit URL must be absolute http(s)");
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new AttunementStoreError("browsing visit URL must be absolute http(s)");
  }
  if (!CANONICAL_UTC_MILLISECOND_ISO.test(visit.visitedAt)
    || !Number.isFinite(Date.parse(visit.visitedAt))
    || new Date(visit.visitedAt).toISOString() !== visit.visitedAt) {
    throw new AttunementStoreError("browsing visit timestamp must be canonical UTC ISO milliseconds");
  }
  const normalizedTitle = stripUntrustedTerminalChars(visit.title).replace(/\s+/gu, " ").trim();
  return {
    browsingUrl: visit.url,
    browsingVisitedAt: visit.visitedAt,
    title: normalizedTitle.length > 0 ? normalizedTitle.slice(0, 240) : "(untitled page)"
  };
}

export function createBrowsingVisitExactArtifactResolver(
  options: BrowsingVisitArtifactOptions
): ExactArtifactResolver {
  return async (link) => {
    if (link.artifactType !== "browsing-visit" || link.providerId !== "local" || link.role !== "context") {
      return undefined;
    }
    const visit = await options.readExactVisit(link.artifactId);
    if (!visit) return undefined;
    const projected = projectVisit(visit, link.artifactId);
    return projected ? {
      artifactId: link.artifactId,
      artifactType: "browsing-visit",
      providerId: "local",
      role: "context",
      ...projected
    } : undefined;
  };
}
