/**
 * `muse diversity <file> <column>` — how diverse (vs concentrated) is a
 * categorical CSV column? Shannon & Simpson indices + Pielou evenness, the
 * ecologist's biodiversity measures. Deterministic, local, no model. Distinct
 * from `muse csv --group-by` (the buckets) — this is their EVENNESS.
 */

import { readFile } from "node:fs/promises";
import { resolve as pathResolve } from "node:path";

import type { Command } from "commander";

import { parseCsv, resolveColumn } from "./csv-aggregate.js";
import { categoryCounts, diversityOf, formatDiversity } from "./diversity.js";
import type { ProgramIO } from "./program.js";

export function registerDiversityCommand(program: Command, io: ProgramIO): void {
  program
    .command("diversity")
    .description("How diverse (vs concentrated) is a categorical CSV column? Shannon & Simpson indices + evenness — the ecologist's biodiversity measures. Deterministic, no model. e.g. `muse diversity expenses.csv category`")
    .argument("<file>", "Path to the .csv file, e.g. expenses.csv")
    .argument("<column>", "Categorical column to measure, e.g. category")
    .option("--json", "Print the structured result")
    .action(async (file: string, column: string, options: { readonly json?: boolean }) => {
      let text: string;
      try {
        text = await readFile(pathResolve(process.cwd(), file), "utf8");
      } catch (cause) {
        io.stderr(`muse diversity: cannot read ${file} (${cause instanceof Error ? cause.message : String(cause)})\n`);
        process.exitCode = 1;
        return;
      }

      const parsed = parseCsv(text);
      if (parsed.headers.length === 0) {
        io.stderr(`muse diversity: ${file} has no rows\n`);
        process.exitCode = 1;
        return;
      }
      const columnIndex = resolveColumn(parsed.headers, column);
      if (columnIndex === undefined) {
        io.stderr(`muse diversity: no column '${column}' (have: ${parsed.headers.join(", ")})\n`);
        process.exitCode = 1;
        return;
      }

      const result = diversityOf(categoryCounts(parsed.rows.map((row) => row[columnIndex] ?? "")));
      if (options.json) {
        io.stdout(`${JSON.stringify({ column, ...result }, null, 2)}\n`);
        return;
      }
      io.stdout(formatDiversity(result, column));
    });
}
