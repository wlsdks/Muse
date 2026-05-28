/**
 * `muse feedback` — runtime self-tuning, slice 1 (Reflexion; Shinn et al.
 * 2023, arXiv:2303.11366: persist textual feedback and feed it into future
 * attempts). The user records a behavioral CORRECTION ("always cite the
 * source", "never invent dates — say you're unsure") that is then injected
 * as a `[Learned Corrections]` block into `muse ask`'s system prompt, so
 * the assistant tunes its answers to past feedback. Mirrors the P7
 * veto-avoidance injection seam.
 *
 * Distinct from user-memory facts/preferences (who the user IS) and from
 * vetoes (an action class to avoid): these are answer-quality corrections.
 * Deterministic store + a pure renderer; whether the local model obeys is
 * trusted like the veto directive (not unit-tested here).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { Command } from "commander";

import type { ProgramIO } from "./program.js";

export interface LearnedCorrection {
  readonly id: string;
  readonly at: string;
  readonly text: string;
}

const MAX_CORRECTIONS = 50;

export function resolveCorrectionsFile(env: Record<string, string | undefined> = process.env): string {
  const fromEnv = env.MUSE_CORRECTIONS_FILE?.trim();
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }
  return join(env.MUSE_HOME?.trim() || join(homedir(), ".muse"), "corrections.json");
}

export async function readCorrections(file: string): Promise<LearnedCorrection[]> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter(
    (entry): entry is LearnedCorrection =>
      Boolean(entry) && typeof entry === "object"
      && typeof (entry as LearnedCorrection).id === "string"
      && typeof (entry as LearnedCorrection).at === "string"
      && typeof (entry as LearnedCorrection).text === "string"
      && (entry as LearnedCorrection).text.trim().length > 0
  );
}

async function writeCorrections(file: string, corrections: readonly LearnedCorrection[]): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(corrections.slice(-MAX_CORRECTIONS), null, 2)}\n`, "utf8");
}

export async function addCorrection(file: string, text: string, now: Date = new Date()): Promise<LearnedCorrection> {
  const entry: LearnedCorrection = {
    at: now.toISOString(),
    id: `corr_${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    text: text.replace(/\s+/gu, " ").trim()
  };
  const existing = await readCorrections(file);
  await writeCorrections(file, [...existing, entry]);
  return entry;
}

/**
 * The `[Learned Corrections]` system-prompt block, or undefined when there
 * are none (so the prompt is byte-identical to before — fail-open, no-op).
 */
export function renderCorrectionsBlock(corrections: readonly LearnedCorrection[]): string | undefined {
  const lines = corrections.map((c) => c.text.trim()).filter((t) => t.length > 0);
  if (lines.length === 0) {
    return undefined;
  }
  return [
    "[Learned Corrections — the user has corrected you before; apply these]",
    ...lines.map((line) => `- ${line}`)
  ].join("\n");
}

export function registerFeedbackCommand(program: Command, io: ProgramIO): void {
  const feedback = program
    .command("feedback")
    .description("Record a behavioral correction Muse should apply to future answers (Reflexion-style learning). With no subcommand, lists them.");

  feedback
    .command("add", { isDefault: true })
    .description("Add a correction, e.g. `muse feedback add \"always cite the source file\"`")
    .argument("<text...>", "The correction in your own words")
    .action(async (parts: readonly string[]) => {
      const text = parts.join(" ").trim();
      if (text.length === 0) {
        io.stderr("usage: muse feedback add <correction text>\n");
        process.exitCode = 1;
        return;
      }
      const entry = await addCorrection(resolveCorrectionsFile(), text);
      io.stdout(`Recorded correction ${entry.id}: ${entry.text}\n`);
    });

  feedback
    .command("list")
    .description("List recorded corrections")
    .option("--json", "Emit JSON")
    .action(async (options: { readonly json?: boolean }) => {
      const corrections = await readCorrections(resolveCorrectionsFile());
      if (options.json) {
        io.stdout(`${JSON.stringify(corrections, null, 2)}\n`);
        return;
      }
      if (corrections.length === 0) {
        io.stdout("No corrections recorded yet. Add one with `muse feedback add \"...\"`.\n");
        return;
      }
      io.stdout(`Learned corrections (${corrections.length.toString()}):\n`);
      for (const correction of corrections) {
        io.stdout(`  [${correction.id}] ${correction.text}\n`);
      }
    });

  feedback
    .command("clear")
    .description("Remove all recorded corrections")
    .action(async () => {
      await writeCorrections(resolveCorrectionsFile(), []);
      io.stdout("Cleared all corrections.\n");
    });
}
