import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  appendInterruptionDelivery,
  writeReminders,
  type PersistedReminder
} from "@muse/stores";
import { InMemoryScheduledJobStore, type ScheduledJobInput } from "@muse/scheduler";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { registerAutomationRoutes, type AutomationUpcomingResponse } from "./automation-routes.js";

let root: string;
let remindersFile: string;
let ledgerFile: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "muse-automation-api-"));
  remindersFile = join(root, "reminders.json");
  ledgerFile = join(root, "interruption-ledger.json");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const PENDING_REMINDER: PersistedReminder = {
  createdAt: "2026-07-16T00:00:00.000Z",
  dueAt: "2026-07-18T09:00:00.000Z",
  id: "rem_1",
  status: "pending",
  text: "Call the vet"
};

const LATER_PENDING_REMINDER: PersistedReminder = {
  createdAt: "2026-07-16T00:00:00.000Z",
  dueAt: "2026-07-20T09:00:00.000Z",
  id: "rem_2",
  status: "pending",
  text: "Renew passport"
};

const FIRED_REMINDER: PersistedReminder = {
  createdAt: "2026-07-15T00:00:00.000Z",
  dueAt: "2026-07-16T09:00:00.000Z",
  firedAt: "2026-07-16T09:00:00.000Z",
  id: "rem_0",
  status: "fired",
  text: "Already sent"
};

const JOB_INPUT: ScheduledJobInput = {
  cronExpression: "0 9 * * *",
  enabled: true,
  jobType: "agent",
  name: "Morning brief"
};

describe("GET /api/automation/upcoming — empty stores", () => {
  it("returns null digest/reminder and an empty jobs list when nothing is configured (budget is always-on with its own defaults)", async () => {
    const server = Fastify();
    registerAutomationRoutes(server, { authService: undefined, env: { MUSE_INTERRUPTION_LEDGER_FILE: ledgerFile } });
    const res = await server.inject({ method: "GET", url: "/api/automation/upcoming" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as AutomationUpcomingResponse;
    expect(body).toEqual({
      budget: { dayCap: 6, dayUsed: 0, hourCap: 2, hourUsed: 0 },
      digest: null,
      nextReminder: null,
      scheduledJobs: []
    });
  });

  it("returns a budget section from an empty/missing ledger file (all zero used)", async () => {
    const server = Fastify();
    registerAutomationRoutes(server, {
      authService: undefined,
      env: { MUSE_INTERRUPTION_DAILY_CAP: "6", MUSE_INTERRUPTION_HOURLY_CAP: "2", MUSE_INTERRUPTION_LEDGER_FILE: ledgerFile }
    });
    const res = await server.inject({ method: "GET", url: "/api/automation/upcoming" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as AutomationUpcomingResponse;
    expect(body.budget).toEqual({ dayCap: 6, dayUsed: 0, hourCap: 2, hourUsed: 0 });
  });
});

describe("GET /api/automation/upcoming — populated stores", () => {
  it("surfaces the digest config, the counted budget, the soonest pending reminder, and the soonest enabled job", async () => {
    await writeReminders(remindersFile, [FIRED_REMINDER, LATER_PENDING_REMINDER, PENDING_REMINDER]);
    await appendInterruptionDelivery(ledgerFile, { at: new Date(), source: "pattern-firing" });

    let jobIdCounter = 0;
    const jobStore = new InMemoryScheduledJobStore({
      idFactory: () => `job_${(jobIdCounter += 1).toString()}`,
      now: () => new Date("2026-07-17T00:00:00.000Z")
    });
    await jobStore.save(JOB_INPUT);
    await jobStore.save({ ...JOB_INPUT, enabled: false, name: "Disabled job" });

    const server = Fastify();
    registerAutomationRoutes(server, {
      authService: undefined,
      env: {
        MUSE_DIGEST_ENABLED: "false",
        MUSE_DIGEST_HOUR: "9",
        MUSE_INTERRUPTION_DAILY_CAP: "6",
        MUSE_INTERRUPTION_HOURLY_CAP: "2",
        MUSE_INTERRUPTION_LEDGER_FILE: ledgerFile,
        MUSE_PROACTIVE_DESTINATION: "12345",
        MUSE_PROACTIVE_PROVIDER: "telegram"
      },
      remindersFile,
      scheduler: { store: jobStore }
    });

    const res = await server.inject({ method: "GET", url: "/api/automation/upcoming" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as AutomationUpcomingResponse;

    expect(body.digest).toMatchObject({ enabled: false, hour: 9 });
    expect(typeof body.digest?.nextAtIso).toBe("string");

    expect(body.budget).toEqual({ dayCap: 6, dayUsed: 1, hourCap: 2, hourUsed: 1 });

    expect(body.nextReminder).toEqual({ dueAtIso: "2026-07-18T09:00:00.000Z", id: "rem_1", text: "Call the vet" });

    expect(body.scheduledJobs).toHaveLength(1);
    expect(body.scheduledJobs[0]).toMatchObject({ label: "Morning brief" });
    expect(typeof body.scheduledJobs[0]!.nextRunAtIso).toBe("string");
  });
});
