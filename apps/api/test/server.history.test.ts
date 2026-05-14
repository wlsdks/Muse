import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server.js";

describe("api server: GET /api/history", () => {
  it("merges reminder + proactive + followup + pattern + episode stores newest-first", async () => {
    const dir = mkdtempSync(join(tmpdir(), "muse-api-history-"));
    const reminderHistoryFile = join(dir, "reminder-history.json");
    const proactiveHistoryFile = join(dir, "proactive-history.json");
    const followupsFile = join(dir, "followups.json");
    const patternsFiredFile = join(dir, "patterns-fired.json");
    const episodesFile = join(dir, "episodes.json");

    const t1 = "2026-05-12T08:00:00.000Z";
    const t2 = "2026-05-12T10:00:00.000Z";
    const t3 = "2026-05-12T22:00:00.000Z";
    const t4 = "2026-05-13T07:00:00.000Z";

    writeFileSync(reminderHistoryFile, JSON.stringify({
      entries: [{ reminderId: "rem_a", text: "Call vet", providerId: "log", destination: "@me", firedAtIso: t2, status: "delivered" }],
      version: 1
    }), "utf8");
    writeFileSync(proactiveHistoryFile, JSON.stringify({
      entries: [{ kind: "calendar", itemId: "evt_a", startIso: t4, title: "Standup", providerId: "log", destination: "@me", text: "Standup in 5 min", firedAtIso: t4, status: "delivered" }],
      version: 1
    }), "utf8");
    writeFileSync(followupsFile, JSON.stringify({
      followups: [{ id: "fu_a", userId: "stark", scheduledFor: t1, status: "fired", summary: "Sent Q3 memo", firedAt: t1, createdAt: t1 }]
    }), "utf8");
    writeFileSync(patternsFiredFile, JSON.stringify({
      fired: [{ patternId: "pat_morning", firedAtMs: Date.parse(t1) - 1000, suggestion: "morning walk" }]
    }), "utf8");
    writeFileSync(episodesFile, JSON.stringify({
      episodes: [{ id: "ep_a", userId: "stark", startedAt: "2026-05-12T21:30:00Z", endedAt: t3, summary: "Budget review" }]
    }), "utf8");

    const server = buildServer({
      episodesFile,
      followupsFile,
      logger: false,
      patternsFiredFile,
      proactiveHistoryFile,
      reminderHistoryFile
    });

    const reply = await server.inject({ method: "GET", url: "/api/history" });
    expect(reply.statusCode).toBe(200);
    const body = reply.json() as { entries: Array<{ kind: string; id?: string; whenIso: string }>; total: number };
    expect(body.total).toBe(5);
    // Newest first: proactive(t4) → episode(t3) → reminder(t2) → followup(t1) → pattern(t1 - 1s).
    expect(body.entries.map((e) => e.kind)).toEqual(["proactive", "episode", "reminder", "followup", "pattern"]);
  });

  it("rejects invalid kind / sinceIso with structured errors", async () => {
    const server = buildServer({ logger: false });
    const bogusKind = await server.inject({ method: "GET", url: "/api/history?kind=bogus" });
    expect(bogusKind.statusCode).toBe(400);
    expect(bogusKind.json()).toMatchObject({ error: expect.stringContaining("kind must be one of") });

    const bogusSince = await server.inject({ method: "GET", url: "/api/history?sinceIso=not-an-iso" });
    expect(bogusSince.statusCode).toBe(400);
    expect(bogusSince.json()).toMatchObject({ error: expect.stringContaining("parseable ISO timestamp") });
  });

  it("returns an empty feed when no store paths are wired", async () => {
    const server = buildServer({ logger: false });
    const reply = await server.inject({ method: "GET", url: "/api/history" });
    expect(reply.statusCode).toBe(200);
    expect(reply.json()).toEqual({ entries: [], total: 0 });
  });
});
