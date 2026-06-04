/**
 * `muse week` — your next 7 days at a glance, grouped BY DAY: events, due
 * tasks, and birthdays under each day's header, so you can plan the week
 * instead of reading a flat next-24h brief. Read-only, local, deterministic
 * (file mtime / dueAt arithmetic; no model). The day-grouped planning twin of
 * `muse today` (which is the today-framed brief).
 */

import { resolveContactsFile, resolveLocalCalendarFile, resolveTasksFile } from "@muse/autoconfigure";
import { OpenMeteoWeatherProvider, readTasks, type DailyForecast, type WeatherProvider } from "@muse/mcp";
import { stripUntrustedTerminalChars } from "@muse/shared";
import type { Command } from "commander";

import { readLocalEvents, readUpcomingBirthdays } from "./commands-today.js";
import type { ProgramIO } from "./program.js";

type Env = Record<string, string | undefined>;

export interface WeekDay {
  readonly label: string;
  readonly lines: readonly string[];
  /** This day's weather forecast summary, e.g. "Partly cloudy, 15–25°C, rain 30%" — present only when configured + available. */
  readonly forecast?: string;
}

export interface WeekAgendaInput {
  readonly events: readonly { readonly title: string; readonly startsAtIso: string }[];
  readonly tasks: readonly { readonly title: string; readonly dueAt: string }[];
  readonly birthdays: readonly { readonly name: string; readonly daysUntil: number }[];
  /** Per-day forecast summaries keyed by local YYYY-MM-DD; attached to each day's header. */
  readonly forecasts?: readonly { readonly dateIso: string; readonly summary: string }[];
}

const DAY_MS = 86_400_000;
const clean = (s: string): string => stripUntrustedTerminalChars(s).replace(/\s+/gu, " ").trim();
const startOfLocalDay = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const dayLabel = (d: Date): string => d.toLocaleDateString("en-US", { day: "numeric", month: "short", weekday: "short" });
const localDateIso = (d: Date): string =>
  `${d.getFullYear().toString()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;

/** A compact one-day forecast for the week header (no date prefix — the day's header already carries the date). Pure. */
export function formatWeekForecast(day: DailyForecast): string {
  const range = `${Math.round(day.tempMinC).toString()}–${Math.round(day.tempMaxC).toString()}°C`;
  const rain = day.precipitationProbabilityMaxPct !== undefined ? `, rain ${day.precipitationProbabilityMaxPct.toString()}%` : "";
  return `${day.condition}, ${range}${rain}`;
}

/**
 * The next `days` days of forecast summaries keyed by local date, for the week
 * agenda — resolved from `MUSE_WEATHER_LOCATION` via the same Open-Meteo provider
 * `muse today`/`muse brief` use (a public weather DATA api, not a cloud LLM). Returns
 * [] when no location is configured or the lookup fails (graceful, never throws), so
 * the week view simply omits weather rather than erroring.
 */
export async function resolveWeekForecasts(
  env: Env,
  days = 7,
  provider?: WeatherProvider
): Promise<readonly { readonly dateIso: string; readonly summary: string }[]> {
  const location = env.MUSE_WEATHER_LOCATION?.trim();
  if (!location || location.length === 0) {
    return [];
  }
  const wp = provider ?? new OpenMeteoWeatherProvider();
  if (!wp.dailyForecast) {
    return [];
  }
  try {
    const geo = await wp.geocode(location);
    if (!geo) {
      return [];
    }
    const forecast = await wp.dailyForecast(geo, { days });
    return forecast.slice(0, days).map((d) => ({ dateIso: d.dateIso, summary: formatWeekForecast(d) }));
  } catch {
    return [];
  }
}

/**
 * Bucket events / due tasks / birthdays into the next `days` LOCAL calendar
 * days from `now` and render each as a line (timed events first by time, then
 * untimed tasks/birthdays). Only days with something appear. Pure.
 */
export function groupWeekAgenda(data: WeekAgendaInput, now: Date, days = 7): readonly WeekDay[] {
  const today0 = startOfLocalDay(now);
  const dayIndex = (ms: number): number => Math.floor((startOfLocalDay(new Date(ms)) - today0) / DAY_MS);
  const buckets: { time: number; text: string }[][] = Array.from({ length: days }, () => []);
  const push = (idx: number, text: string, time: number): void => {
    if (idx >= 0 && idx < days) {
      buckets[idx]!.push({ text, time });
    }
  };
  for (const event of data.events) {
    const ms = Date.parse(event.startsAtIso);
    if (Number.isFinite(ms)) {
      push(dayIndex(ms), `${new Date(ms).toTimeString().slice(0, 5)} ${clean(event.title)}`, ms);
    }
  }
  for (const task of data.tasks) {
    const ms = Date.parse(task.dueAt);
    if (Number.isFinite(ms)) {
      push(dayIndex(ms), `☑ ${clean(task.title)} (due)`, Number.POSITIVE_INFINITY);
    }
  }
  for (const birthday of data.birthdays) {
    push(birthday.daysUntil, `🎂 ${clean(birthday.name)}'s birthday`, Number.POSITIVE_INFINITY);
  }
  const forecastByDate = new Map((data.forecasts ?? []).map((f) => [f.dateIso, f.summary] as const));
  const out: WeekDay[] = [];
  for (let i = 0; i < days; i += 1) {
    const items = buckets[i]!;
    const date = new Date(today0 + i * DAY_MS);
    const forecast = forecastByDate.get(localDateIso(date));
    // A day appears if it has agenda items OR a forecast — so a free-but-known
    // day still shows its weather (plan around it), while staying backward
    // compatible: with no forecasts passed, empty days are skipped as before.
    if (items.length === 0 && forecast === undefined) {
      continue;
    }
    items.sort((a, b) => a.time - b.time);
    const label = i === 0 ? `Today — ${dayLabel(date)}` : i === 1 ? `Tomorrow — ${dayLabel(date)}` : dayLabel(date);
    out.push({ label, lines: items.map((item) => item.text), ...(forecast !== undefined ? { forecast } : {}) });
  }
  return out;
}

/** Human-readable week agenda. Pure. */
export function formatWeekAgenda(week: readonly WeekDay[]): string {
  if (week.length === 0) {
    return "📅 Your week ahead is clear — nothing scheduled in the next 7 days.\n";
  }
  const lines = ["📅 This week:"];
  for (const day of week) {
    lines.push("", `  ${day.label}${day.forecast ? ` — ${day.forecast}` : ""}`);
    for (const item of day.lines) {
      lines.push(`    ${item}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export function registerWeekCommand(program: Command, io: ProgramIO): void {
  program
    .command("week")
    .description("Your next 7 days at a glance — events, due tasks, birthdays, and the daily weather forecast grouped by day (read-only, local)")
    .option("--json", "Emit the agenda as JSON")
    .action(async (options: { readonly json?: boolean }) => {
      const env = process.env as Env;
      const now = new Date();
      const weekEnd = new Date(now.getTime() + 7 * DAY_MS);
      const events = await readLocalEvents(resolveLocalCalendarFile(env), now, weekEnd).catch(() => []);
      const allTasks = await readTasks(resolveTasksFile(env)).catch(() => []);
      const tasks = allTasks
        .filter((task) => task.status === "open" && typeof task.dueAt === "string"
          && Date.parse(task.dueAt) >= now.getTime() && Date.parse(task.dueAt) < weekEnd.getTime())
        .map((task) => ({ dueAt: task.dueAt as string, title: task.title }));
      const birthdays = await readUpcomingBirthdays(resolveContactsFile(env), now).catch(() => []);
      const forecasts = await resolveWeekForecasts(env).catch(() => []);
      const week = groupWeekAgenda({ birthdays, events, forecasts, tasks }, now);
      if (options.json) {
        io.stdout(`${JSON.stringify(week, null, 2)}\n`);
        return;
      }
      io.stdout(formatWeekAgenda(week));
    });
}
