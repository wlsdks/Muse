/**
 * Deliver the synthesised situational briefing (P8-b1) on the real
 * channel, once per situation-window. Composes the P2
 * contract-faithful messaging-send path with a minimal
 * last-fired-at dedupe sidecar so a JARVIS briefs the situation
 * once, not on every tick.
 *
 * `now` / the imminent list / the registry are injected so the
 * delivery is exercised over a real provider request shape with
 * only the HTTP boundary faked. The setInterval daemon that drives
 * this lives in apps/api, mirroring the proactive / reminder ticks.
 */

import { promises as fs } from "node:fs";
import { dirname } from "node:path";

import type { MessagingProviderRegistry } from "@muse/messaging";

import { sendWithRetry } from "./messaging-retry.js";
import { readObjectives } from "./personal-objectives-store.js";
import { composeSituationalBriefing, type BriefingImminent } from "./situational-briefing.js";

const DEFAULT_WINDOW_MS = 4 * 60 * 60_000;

export interface RunDueSituationalBriefingOptions {
  readonly objectivesFile: string;
  readonly imminent: readonly BriefingImminent[];
  readonly messagingRegistry: MessagingProviderRegistry;
  readonly providerId: string;
  readonly destination: string;
  /** Last-fired-at dedupe sidecar. Required — without it every tick re-briefs. */
  readonly sidecarFile: string;
  /** Suppress a re-brief within this window of the last one. Default 4h. */
  readonly windowMs?: number;
  readonly now?: () => Date;
}

export interface RunDueSituationalBriefingSummary {
  readonly delivered: number;
  readonly reason?: "nothing-to-say" | "in-window";
}

async function readLastFiredAt(file: string): Promise<number | undefined> {
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8")) as { lastFiredAt?: unknown };
    const ms = typeof parsed.lastFiredAt === "string" ? Date.parse(parsed.lastFiredAt) : Number.NaN;
    return Number.isFinite(ms) ? ms : undefined;
  } catch {
    return undefined;
  }
}

async function writeLastFiredAt(file: string, iso: string): Promise<void> {
  const tmp = `${file}.tmp-${process.pid.toString()}-${Date.now().toString()}`;
  await fs.mkdir(dirname(file), { recursive: true });
  const handle = await fs.open(tmp, "w", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify({ lastFiredAt: iso }, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, file);
  await fs.chmod(file, 0o600).catch(() => undefined);
}

export async function runDueSituationalBriefing(
  options: RunDueSituationalBriefingOptions
): Promise<RunDueSituationalBriefingSummary> {
  const now = options.now ?? (() => new Date());
  const windowMs = typeof options.windowMs === "number" && Number.isFinite(options.windowMs)
    ? options.windowMs
    : DEFAULT_WINDOW_MS;
  const nowDate = now();

  const objectives = await readObjectives(options.objectivesFile);
  const text = composeSituationalBriefing({ imminent: options.imminent, now: nowDate, objectives });
  if (!text) {
    return { delivered: 0, reason: "nothing-to-say" };
  }

  const lastFiredMs = await readLastFiredAt(options.sidecarFile);
  if (lastFiredMs !== undefined && nowDate.getTime() - lastFiredMs < windowMs) {
    return { delivered: 0, reason: "in-window" };
  }

  await sendWithRetry(options.messagingRegistry, options.providerId, {
    destination: options.destination,
    text
  });
  await writeLastFiredAt(options.sidecarFile, nowDate.toISOString());
  return { delivered: 1 };
}
