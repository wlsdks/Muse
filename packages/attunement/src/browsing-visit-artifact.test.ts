import { describe, expect, it } from "vitest";

import {
  createBrowsingVisitArtifactValidator,
  createBrowsingVisitExactArtifactResolver,
  type BrowsingVisitSourceRecord
} from "./index.js";

const VISIT: BrowsingVisitSourceRecord = {
  id: "13390000000000000-0a1b2c3d",
  title: "Exact page",
  url: "https://example.com/exact",
  visitedAt: "2026-07-22T01:00:00.000Z"
};

describe("exact browsing-visit artifact adapter", () => {
  it("validates one canonical full id through the injected local reader", async () => {
    const validate = createBrowsingVisitArtifactValidator({
      readExactVisit: async (artifactId) => artifactId === VISIT.id ? VISIT : undefined
    });

    await expect(validate({
      artifactId: VISIT.id,
      artifactType: "browsing-visit",
      providerId: "local"
    })).resolves.toEqual({
      artifactId: VISIT.id,
      artifactType: "browsing-visit",
      providerId: "local"
    });
  });

  it("rejects non-canonical, prefix, case-folded, and over-bound ids even if a reader returns them", async () => {
    const validate = createBrowsingVisitArtifactValidator({
      readExactVisit: async (artifactId) => ({ ...VISIT, id: artifactId })
    });
    const invalid = [
      "13390000000000000",
      "13390000000000000-0A1B2C3D",
      "013390000000000000-0a1b2c3d",
      "133900000000000000000-0a1b2c3d",
      "13390000000000000-0a1b2c3",
      "13390000000000000-0a1b2c3d\n"
    ];

    for (const artifactId of invalid) {
      await expect(validate({ artifactId, artifactType: "browsing-visit", providerId: "local" }))
        .rejects.toThrow("canonical browsing visit id");
    }
  });

  it("resolves only the bounded Continuity browsing projection", async () => {
    const resolve = createBrowsingVisitExactArtifactResolver({
      readExactVisit: async () => VISIT
    });

    await expect(resolve({
      artifactId: VISIT.id,
      artifactType: "browsing-visit",
      linkedAt: "2026-07-22T01:05:00.000Z",
      linkedBy: "user",
      providerId: "local",
      role: "context",
      threadId: "thread_life"
    })).resolves.toEqual({
      artifactId: VISIT.id,
      artifactType: "browsing-visit",
      browsingUrl: "https://example.com/exact",
      browsingVisitedAt: "2026-07-22T01:00:00.000Z",
      providerId: "local",
      role: "context",
      title: "Exact page"
    });
  });

  it("strips terminal controls, collapses whitespace, and bounds the projected title", async () => {
    const resolve = createBrowsingVisitExactArtifactResolver({
      readExactVisit: async () => ({
        ...VISIT,
        title: `  Before\u001b[31m\u009b after\n${"x".repeat(300)}  `
      })
    });
    const artifact = await resolve({
      artifactId: VISIT.id,
      artifactType: "browsing-visit",
      linkedAt: "2026-07-22T01:05:00.000Z",
      linkedBy: "user",
      providerId: "local",
      role: "context",
      threadId: "thread_life"
    });

    expect(artifact?.title).toHaveLength(240);
    expect(artifact?.title).toMatch(/^Before\[31m after x/u);
    expect(artifact?.title).not.toMatch(/[\x00-\x1f\x7f-\x9f]/u);
  });

  it("fails closed on a non-http URL or non-canonical visit timestamp", async () => {
    const link = {
      artifactId: VISIT.id,
      artifactType: "browsing-visit" as const,
      linkedAt: "2026-07-22T01:05:00.000Z",
      linkedBy: "user" as const,
      providerId: "local",
      role: "context" as const,
      threadId: "thread_life"
    };
    for (const visit of [
      { ...VISIT, url: "javascript:alert(1)" },
      { ...VISIT, url: `https://example.com/\u001b[31m` },
      { ...VISIT, url: `https://example.com/${"x".repeat(2_001)}` },
      { ...VISIT, visitedAt: "2026-07-22T01:00:00Z" }
    ]) {
      const resolve = createBrowsingVisitExactArtifactResolver({ readExactVisit: async () => visit });
      await expect(resolve(link)).rejects.toThrow(/browsing visit/u);
    }
  });

  it("rejects an unsafe visit before link persistence rather than deferring to Pack open", async () => {
    for (const visit of [
      { ...VISIT, url: "javascript:alert(1)" },
      { ...VISIT, visitedAt: "2026-07-22T01:00:00Z" }
    ]) {
      const validate = createBrowsingVisitArtifactValidator({ readExactVisit: async () => visit });
      await expect(validate({ artifactId: VISIT.id, artifactType: "browsing-visit", providerId: "local" }))
        .rejects.toThrow(/browsing visit/u);
    }
  });
});
