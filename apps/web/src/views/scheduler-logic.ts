import type { CadenceSummary } from "../api/types.js";
import type { Translate } from "../i18n/index.js";

// Cadence formatting + form-composition for the Scheduler view. Pure so the
// server↔cron-string mapping and the dropdown→cadence-text composition are
// unit-testable without a DOM. The view never invents its own cadence
// grammar — every string this module composes is sent to the server as-is
// and resolved through the SAME `parseCadence` the CLI uses.

const pad2 = (n: number): string => n.toString().padStart(2, "0");

export function formatTimeOfDay(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

// cron weekday numbering: 0 = Sunday .. 6 = Saturday. 2024-01-07 is a fixed
// UTC Sunday reference date, so the localized weekday name is deterministic
// (locale-driven via Intl, not a hardcoded EN/KO day-name table).
export function weekdayName(weekday: number, locale: string): string {
  const reference = new Date(Date.UTC(2024, 0, 7 + weekday));
  return reference.toLocaleDateString(locale, { timeZone: "UTC", weekday: "long" });
}

export function formatCadenceSummary(summary: CadenceSummary, t: Translate, locale: string): string {
  switch (summary.kind) {
    case "hourly":
      return t("scheduler.cadence.hourly");
    case "interval":
      return t("scheduler.cadence.interval", { minutes: summary.minutes });
    case "daily":
      return t("scheduler.cadence.daily", { time: formatTimeOfDay(summary.hour, summary.minute) });
    case "weekdays":
      return t("scheduler.cadence.weekdays", { time: formatTimeOfDay(summary.hour, summary.minute) });
    case "weekly":
      return t("scheduler.cadence.weekly", {
        time: formatTimeOfDay(summary.hour, summary.minute),
        weekday: weekdayName(summary.weekday, locale)
      });
    case "custom":
      return t("scheduler.cadence.custom", { cron: summary.cronExpression });
  }
}

export type CadenceKind = "daily" | "weekdays" | "weekly" | "interval" | "custom";

export const CADENCE_KINDS: readonly CadenceKind[] = ["daily", "weekdays", "weekly", "interval", "custom"];

// Index = cron weekday number (0 Sunday .. 6 Saturday). Always composed in
// English regardless of UI language — `parseCadence` recognizes the EN
// weekday words in every locale, so this keeps cadence-string composition
// independent of the display language.
const EN_WEEKDAY_TOKENS: readonly string[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
];

export function schedulerStatusTone(status: string | null): "ok" | "err" | "accent" | "neutral" {
  switch (status?.toLowerCase()) {
    case "success":
      return "ok";
    case "failed":
      return "err";
    case "running":
      return "accent";
    default:
      return "neutral";
  }
}

export function schedulerStatusLabel(status: string | null, t: Translate): string {
  switch (status?.toLowerCase()) {
    case "success":
      return t("scheduler.status.success");
    case "failed":
      return t("scheduler.status.failed");
    case "running":
      return t("scheduler.status.running");
    case "skipped":
      return t("scheduler.status.skipped");
    default:
      return t("scheduler.status.none");
  }
}

export interface CadenceFormState {
  readonly kind: CadenceKind;
  readonly time: string;
  readonly weekday: number;
  readonly intervalMinutes: string;
  readonly customText: string;
}

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/u;

/**
 * Compose the raw cadence string the create form submits to
 * `POST /api/scheduler/jobs`, or `undefined` while the selected kind's
 * required field isn't filled in yet (the client-side non-empty gate —
 * the Create button stays disabled until this resolves).
 */
export function buildCadenceInput(state: CadenceFormState): string | undefined {
  switch (state.kind) {
    case "daily":
      return HHMM_RE.test(state.time) ? `daily ${state.time}` : undefined;
    case "weekdays":
      return HHMM_RE.test(state.time) ? `weekdays ${state.time}` : undefined;
    case "weekly":
      return HHMM_RE.test(state.time) ? `${EN_WEEKDAY_TOKENS[state.weekday] ?? "monday"} ${state.time}` : undefined;
    case "interval": {
      const n = Number(state.intervalMinutes);
      return Number.isInteger(n) && n >= 1 && n <= 59 ? `every ${n.toString()} minutes` : undefined;
    }
    case "custom":
      return state.customText.trim().length > 0 ? state.customText.trim() : undefined;
  }
}
