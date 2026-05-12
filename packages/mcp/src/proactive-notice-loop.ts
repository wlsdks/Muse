/**
 * Proactive surfacing Phase A + B — calendar imminence + task due-soon push.
 *
 * Companion to `runDueReminders` for events and tasks the user
 * *didn't* set up a reminder for. Scans the calendar registry for
 * events starting within `leadMinutes` AND (when wired) the
 * personal-tasks store for open tasks whose `dueAt` falls in the
 * same window. Delivers a one-line notice per imminent item via
 * the messaging registry, deduped through a shared sidecar so a
 * single item fires at most once per `{kind, id, startIso}` tuple.
 *
 * A rescheduled item (same id, new startsAt / dueAt) re-fires.
 *
 * The function is data-only — registries, files and `now` are
 * injected so tests can fake the upstream without touching real
 * provider APIs.
 */

import { promises as fs } from "node:fs";
import { dirname } from "node:path";

import type { CalendarEvent, CalendarProviderRegistry } from "@muse/calendar";
import type { MessagingProviderRegistry } from "@muse/messaging";

import { readTasks, type PersistedTask } from "./personal-tasks-store.js";

export type ProactiveFiredKind = "calendar" | "task";

export interface ProactiveFiredEntry {
  /** Signal source. `calendar` = Phase A, `task` = Phase B. */
  readonly kind: ProactiveFiredKind;
  /** Provider-reported event id, or task id. */
  readonly id: string;
  /**
   * For calendar items: event `startsAt` (ISO). For task items:
   * task `dueAt` (ISO). Included in the dedupe key so a moved
   * meeting / rescheduled task (same id, new time) re-fires.
   */
  readonly startIso: string;
  /** When the notice was delivered (or attempted). */
  readonly firedAt: string;
}

const MAX_FIRED_ENTRIES = 1_000;

export async function readProactiveFired(file: string): Promise<readonly ProactiveFiredEntry[]> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { fired?: unknown }).fired)) {
    return [];
  }
  return (parsed as { fired: unknown[] }).fired.flatMap((entry): readonly ProactiveFiredEntry[] =>
    isProactiveFiredEntry(entry) ? [entry] : []
  );
}

export async function writeProactiveFired(file: string, entries: readonly ProactiveFiredEntry[]): Promise<void> {
  // FIFO trim — keep the most recent N. A year of daily meetings
  // + tasks is ~700 entries so 1k is generous; the trim mainly
  // guards a pathological clock drift.
  const trimmed = entries.length > MAX_FIRED_ENTRIES
    ? entries.slice(entries.length - MAX_FIRED_ENTRIES)
    : entries;
  const payload = `${JSON.stringify({ fired: trimmed }, null, 2)}\n`;
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fs.mkdir(dirname(file), { recursive: true });
  await fs.writeFile(tmp, payload, "utf8");
  await fs.rename(tmp, file);
}

function isProactiveFiredEntry(value: unknown): value is ProactiveFiredEntry {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ProactiveFiredEntry>;
  return (candidate.kind === "calendar" || candidate.kind === "task")
    && typeof candidate.id === "string"
    && typeof candidate.startIso === "string"
    && typeof candidate.firedAt === "string";
}

function firedKey(entry: { readonly kind: string; readonly id: string; readonly startIso: string }): string {
  return `${entry.kind} ${entry.id} ${entry.startIso}`;
}

interface ImminentItem {
  readonly kind: ProactiveFiredKind;
  readonly id: string;
  readonly startsAt: Date;
  readonly text: string;
}

export interface RunDueProactiveNoticesOptions {
  readonly calendarRegistry?: CalendarProviderRegistry;
  /**
   * Personal-tasks store path (`~/.muse/tasks.json` by default).
   * When set, open tasks whose `dueAt` falls in
   * `[now, now + leadMinutes]` are surfaced alongside calendar
   * events.
   */
  readonly tasksFile?: string;
  readonly messagingRegistry: MessagingProviderRegistry;
  /** Messaging provider id (e.g. "telegram"). */
  readonly providerId: string;
  /** Messaging destination (chat id, channel id, etc). */
  readonly destination: string;
  /**
   * How far in advance to fire. Events / tasks within
   * `[now, now + leadMinutes]` are candidates. Default 10 min.
   */
  readonly leadMinutes?: number;
  /** Dedupe sidecar path. Required — without it, every tick re-fires. */
  readonly sidecarFile: string;
  /** Injectable clock for tests. Default `() => new Date()`. */
  readonly now?: () => Date;
}

export interface RunDueProactiveNoticesSummary {
  /** Count of imminent items found (whether or not they were fired). */
  readonly imminent: number;
  /** Count of notices actually delivered this run. */
  readonly fired: number;
  /** Human-readable error strings, one per failed delivery. */
  readonly errors: readonly string[];
}

export async function runDueProactiveNotices(
  options: RunDueProactiveNoticesOptions
): Promise<RunDueProactiveNoticesSummary> {
  const now = options.now ?? (() => new Date());
  const leadMinutes = options.leadMinutes ?? 10;
  const nowDate = now();
  const cutoff = new Date(nowDate.getTime() + leadMinutes * 60_000);

  const errors: string[] = [];
  const imminent: ImminentItem[] = [];

  if (options.calendarRegistry) {
    try {
      const events = await options.calendarRegistry.listEvents({ from: nowDate, to: cutoff });
      for (const event of events) {
        if (event.allDay) continue;
        if (event.startsAt < nowDate || event.startsAt > cutoff) continue;
        // Phase C opt-out: `[no-proactive]` marker in notes / title
        // (case-insensitive) tells the daemon to skip this event.
        // The marker is provider-neutral (works with CalDAV / Google
        // Calendar / LocalCalendar / macOS Calendar) since every
        // backend surfaces user-typed notes or title text.
        if (isCalendarOptedOut(event)) continue;
        imminent.push({
          id: event.id,
          kind: "calendar",
          startsAt: event.startsAt,
          text: calendarNoticeText(event, nowDate)
        });
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      errors.push(`calendar.listEvents failed: ${message}`);
    }
  }

  if (options.tasksFile) {
    try {
      const tasks = await readTasks(options.tasksFile);
      for (const task of tasks) {
        if (task.status !== "open") continue;
        if (!task.dueAt) continue;
        // Phase C opt-out: explicit `proactive: false` on a task
        // suppresses the notice without affecting the rest of the
        // task's lifecycle (still due, still surfaces in `muse today`).
        if (task.proactive === false) continue;
        const dueAt = new Date(task.dueAt);
        if (Number.isNaN(dueAt.getTime())) continue;
        if (dueAt < nowDate || dueAt > cutoff) continue;
        imminent.push({
          id: task.id,
          kind: "task",
          startsAt: dueAt,
          text: taskNoticeText(task, dueAt, nowDate)
        });
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      errors.push(`tasks.readTasks failed: ${message}`);
    }
  }

  if (imminent.length === 0) {
    return { errors, fired: 0, imminent: 0 };
  }

  const fired = await readProactiveFired(options.sidecarFile);
  const seen = new Set(fired.map((entry) => firedKey(entry)));
  let firedThisRun = 0;
  let nextFired: readonly ProactiveFiredEntry[] = fired;

  for (const item of imminent) {
    const candidate: ProactiveFiredEntry = {
      firedAt: now().toISOString(),
      id: item.id,
      kind: item.kind,
      startIso: item.startsAt.toISOString()
    };
    const key = firedKey(candidate);
    if (seen.has(key)) {
      continue;
    }

    try {
      await options.messagingRegistry.send(options.providerId, {
        destination: options.destination,
        text: item.text
      });
      firedThisRun += 1;
      nextFired = [...nextFired, candidate];
      seen.add(key);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      errors.push(`${item.kind}:${item.id}: ${message}`);
    }
  }

  if (firedThisRun > 0) {
    try {
      await writeProactiveFired(options.sidecarFile, nextFired);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      errors.push(`sidecar write failed: ${message}`);
    }
  }

  return { errors, fired: firedThisRun, imminent: imminent.length };
}

/**
 * Phase C marker — case-insensitive `[no-proactive]` anywhere in the
 * event's user-visible text (title or notes). Provider-neutral so
 * the same opt-out works against every CalendarProvider without
 * needing per-backend extended-property plumbing.
 */
function isCalendarOptedOut(event: CalendarEvent): boolean {
  const marker = "[no-proactive]";
  if (event.title.toLowerCase().includes(marker)) return true;
  if (event.notes && event.notes.toLowerCase().includes(marker)) return true;
  return false;
}

function calendarNoticeText(event: CalendarEvent, now: Date): string {
  const minutes = Math.max(0, Math.round((event.startsAt.getTime() - now.getTime()) / 60_000));
  const head = minutes === 0
    ? `⏰ ${event.title} starting now`
    : `⏰ ${event.title} in ${minutes} min`;
  return event.location ? `${head} (${event.location})` : head;
}

function taskNoticeText(task: PersistedTask, dueAt: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((dueAt.getTime() - now.getTime()) / 60_000));
  return minutes === 0
    ? `📋 ${task.title} due now`
    : `📋 ${task.title} due in ${minutes} min`;
}
