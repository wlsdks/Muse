/**
 * `muse models` — list the models Muse can use and their capabilities (vision / tools / local),
 * filterable, from the static `@muse/model` catalog (no live provider call). Complements
 * `muse setup cloud`: pick a model by what it can do, offline. Read-only.
 */

import { MODEL_CATALOG, modelSpec, type ModelInfo } from "@muse/model";
import type { Command } from "commander";

import type { ProgramIO } from "./program.js";

export interface ModelCatalogFilters {
  readonly vision?: boolean;
  readonly tools?: boolean;
  readonly local?: boolean;
  readonly provider?: string;
}

/** Apply the CLI filters to the catalog. A filter is AND-combined; an unset filter is a pass. Pure. */
export function filterCatalog(models: readonly ModelInfo[], filters: ModelCatalogFilters): ModelInfo[] {
  return models.filter((m) =>
    (filters.vision !== true || m.capabilities.vision) &&
    (filters.tools !== true || m.capabilities.toolCalling) &&
    (filters.local !== true || m.capabilities.local) &&
    (filters.provider === undefined || m.providerId === filters.provider));
}

/** Human-readable capability listing. Pure. */
export function formatModelCatalog(models: readonly ModelInfo[]): string {
  if (models.length === 0) return "No models match those filters.";
  const lines = ["Models Muse can use (capabilities):", ""];
  for (const m of models) {
    const tags = [
      m.capabilities.local ? "local" : "cloud",
      m.capabilities.vision ? "vision" : undefined,
      m.capabilities.toolCalling ? "tools" : undefined,
      m.capabilities.structuredOutput ? "structured" : undefined,
      `${m.capabilities.cost} cost`
    ].filter((t): t is string => t !== undefined).join(" · ");
    lines.push(`  ${modelSpec(m).padEnd(38)} ${tags}`);
    if (m.displayName !== undefined) lines.push(`    ${m.displayName}`);
  }
  return lines.join("\n");
}

export function registerModelsCommand(program: Command, io: ProgramIO): void {
  program
    .command("models")
    .description("List the models Muse can use + their capabilities (vision/tools/local). Filter: --vision/--tools/--local/--provider")
    .option("--vision", "Only models that accept image input")
    .option("--tools", "Only models that support tool-calling")
    .option("--local", "Only local (no cloud egress) models")
    .option("--provider <id>", "Only this provider (ollama/gemini/openai/anthropic/openrouter)")
    .option("--json", "Emit the catalog as JSON")
    .action((opts: { readonly vision?: boolean; readonly tools?: boolean; readonly local?: boolean; readonly provider?: string; readonly json?: boolean }) => {
      const filtered = filterCatalog(MODEL_CATALOG, { local: opts.local, provider: opts.provider, tools: opts.tools, vision: opts.vision });
      io.stdout(opts.json === true ? `${JSON.stringify(filtered, null, 2)}\n` : `${formatModelCatalog(filtered)}\n`);
    });
}
