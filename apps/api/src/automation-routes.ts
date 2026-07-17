/**
 * `GET /api/automation/upcoming` — the Automation view's first-thing-you-see
 * aggregator: what Muse will do NEXT (digest, scheduled jobs, next
 * reminder) and how much unasked-interruption room is left this hour/day.
 * Read-only, grounded 100% in real server state — no model call, no
 * synthesized text.
 *
 * Every section is resolved independently and swallows its own failure
 * (missing/corrupt store → null/[]) so one broken sidecar never 500s the
 * whole endpoint — same posture as `today-routes.ts`.
 */

import {
  computeNextRunAt,
  type ScheduledJob
} from "@muse/scheduler";
import { parseBoolean } from "@muse/autoconfigure";
import { DEFAULT_DIGEST_HOUR, readInterruptionBudgetStatus, type InterruptionBudgetStatus } from "@muse/proactivity";
import { compareRemindersByDueAt, readInterruptionLedger, readReminders } from "@muse/stores";
import type { FastifyInstance } from "fastify";

import { requireAuthenticated } from "./server-helpers.js";
import { resolveInterruptionBudgetWiring } from "./tick-daemons.js";
import type { SchedulerRouteScheduler } from "./scheduler-routes.js";
import type { ServerOptions } from "./server.js";

const MAX_UPCOMING_JOBS = 5;

export interface AutomationRoutesGate {
  readonly authService: ServerOptions["authService"];
  /** Process env the digest + interruption-budget config is read from. */
  readonly env: NodeJS.ProcessEnv;
  readonly scheduler?: SchedulerRouteScheduler;
  readonly remindersFile?: string;
}

interface UpcomingDigest {
  readonly enabled: boolean;
  readonly hour: number;
  readonly nextAtIso: string;
}

interface UpcomingScheduledJob {
  readonly id: string;
  readonly label: string;
  readonly nextRunAtIso: string | null;
}

interface UpcomingReminder {
  readonly id: string;
  readonly text: string;
  readonly dueAtIso: string;
}

export interface AutomationUpcomingResponse {
  readonly digest: UpcomingDigest | null;
  readonly budget: InterruptionBudgetStatus | null;
  readonly scheduledJobs: readonly UpcomingScheduledJob[];
  readonly nextReminder: UpcomingReminder | null;
}

export function registerAutomationRoutes(server: FastifyInstance, gate: AutomationRoutesGate): void {
  server.get("/api/automation/upcoming", async (request, reply) => {
    if (!requireAuthenticated(request, reply, Boolean(gate.authService))) {
      return reply;
    }

    const now = new Date();
    const [digest, budget, scheduledJobs, nextReminder] = await Promise.all([
      resolveDigestStatus(gate.env, now),
      resolveBudgetStatus(gate.env, now).catch(() => null),
      resolveScheduledJobs(gate.scheduler, now).catch(() => []),
      resolveNextReminder(gate.remindersFile).catch(() => null)
    ]);

    const response: AutomationUpcomingResponse = { budget, digest, nextReminder, scheduledJobs };
    return response;
  });
}

/**
 * Mirrors `startDigestDaemonIfConfigured`'s config resolution
 * (`tick-daemons.ts`): the digest rides the SAME
 * `MUSE_PROACTIVE_PROVIDER` / `MUSE_PROACTIVE_DESTINATION` as the
 * proactive daemon. Neither configured → nothing to ever turn on →
 * `null` (hide the row). Both configured → a real digest row, whose
 * `enabled` reflects the SAME `MUSE_DIGEST_ENABLED` predicate
 * (default true) `digest-tick.ts` uses — `enabled: false` still
 * returns a row so the UI can show a "꺼짐" badge instead of hiding it.
 *
 * `nextAtIso` is the next occurrence of the configured local hour
 * (today if still upcoming, else tomorrow) — the same local-hour
 * comparison `runDigestFlushIfDue` makes (`now.getHours() !==
 * digestHour`). It does NOT fold in quiet-hours suppression (which can
 * push the real fire to the following day) — this is the configured-hour
 * approximation, not a live scheduler prediction.
 */
function resolveDigestStatus(env: NodeJS.ProcessEnv, now: Date): UpcomingDigest | null {
  try {
    const provider = env.MUSE_PROACTIVE_PROVIDER?.trim();
    const destination = env.MUSE_PROACTIVE_DESTINATION?.trim();
    if (!provider || provider.length === 0 || !destination || destination.length === 0) {
      return null;
    }
    const enabled = parseBoolean(env.MUSE_DIGEST_ENABLED, true);
    const hourRaw = env.MUSE_DIGEST_HOUR ? Number(env.MUSE_DIGEST_HOUR) : undefined;
    const hour = hourRaw !== undefined && Number.isFinite(hourRaw) ? hourRaw : DEFAULT_DIGEST_HOUR;
    return { enabled, hour, nextAtIso: nextLocalHourOccurrence(now, hour).toISOString() };
  } catch {
    return null;
  }
}

function nextLocalHourOccurrence(now: Date, hour: number): Date {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

/**
 * Reads the SAME ledger file + caps `resolveInterruptionBudgetWiring`
 * hands every UNASKED notice daemon, then counts trailing-hour /
 * trailing-day deliveries with `readInterruptionBudgetStatus` — the same
 * windowing `applyInterruptionBudget` gates a real send against, so the
 * numbers shown here match what the gate itself would decide.
 */
async function resolveBudgetStatus(env: NodeJS.ProcessEnv, now: Date): Promise<InterruptionBudgetStatus> {
  const wiring = resolveInterruptionBudgetWiring(env);
  const entries = await readInterruptionLedger(wiring.ledgerFile);
  return readInterruptionBudgetStatus(entries, { dailyCap: wiring.dailyCap, hourlyCap: wiring.hourlyCap }, now);
}

/**
 * Top 5 soonest-firing ENABLED jobs, reusing the same
 * `service.list() ?? store.list()` fallback `/api/scheduler/jobs` uses.
 * A job whose cron can't be evaluated (corrupt persisted expression)
 * still appears (so the user isn't silently missing a job they created)
 * but sorts last with a `null` next-run.
 */
async function resolveScheduledJobs(
  scheduler: SchedulerRouteScheduler | undefined,
  now: Date
): Promise<readonly UpcomingScheduledJob[]> {
  if (!scheduler) {
    return [];
  }
  const jobs = await (scheduler.service?.list() ?? scheduler.store.list());
  return jobs
    .filter((job) => job.enabled)
    .map((job) => toUpcomingScheduledJob(job, now))
    .sort(compareUpcomingScheduledJobs)
    .slice(0, MAX_UPCOMING_JOBS);
}

function toUpcomingScheduledJob(job: ScheduledJob, now: Date): UpcomingScheduledJob {
  let nextRunAtIso: string | null;
  try {
    nextRunAtIso = computeNextRunAt(job, now).toISOString();
  } catch {
    nextRunAtIso = null;
  }
  const label = job.description?.trim();
  return { id: job.id, label: label && label.length > 0 ? label : job.name, nextRunAtIso };
}

function compareUpcomingScheduledJobs(left: UpcomingScheduledJob, right: UpcomingScheduledJob): number {
  if (left.nextRunAtIso === null && right.nextRunAtIso === null) return 0;
  if (left.nextRunAtIso === null) return 1;
  if (right.nextRunAtIso === null) return -1;
  return left.nextRunAtIso.localeCompare(right.nextRunAtIso);
}

/** The single pending reminder due soonest, same store the `/api/reminders` routes read. */
async function resolveNextReminder(remindersFile: string | undefined): Promise<UpcomingReminder | null> {
  if (!remindersFile) {
    return null;
  }
  const all = await readReminders(remindersFile);
  const pending = all.filter((reminder) => reminder.status === "pending").slice().sort(compareRemindersByDueAt);
  const next = pending[0];
  return next ? { dueAtIso: next.dueAt, id: next.id, text: next.text } : null;
}
