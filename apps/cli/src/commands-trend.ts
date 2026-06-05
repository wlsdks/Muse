/**
 * `muse trend <file> <column>` — is a numeric CSV column trending up or down over
 * time? Mann-Kendall non-parametric trend test + Sen's slope. Deterministic,
 * local, no model. Assumes rows are in time order (a log is). Distinct from
 * `muse csv` (a static aggregate) and `muse benford` (distribution shape) — this
 * is the DIRECTION over time.
 */

import { readFile } from "node:fs/promises";
import { resolve as pathResolve } from "node:path";

import type { Command } from "commander";

import { parseCsv, resolveColumn, toNumber } from "./csv-aggregate.js";
import type { ProgramIO } from "./program.js";
import { formatTrend, mannKendall } from "./trend.js";

export function registerTrendCommand(program: Command, io: ProgramIO): void {
  program
    .command("trend")
    .description("Is a numeric CSV column trending up or down over time? Mann-Kendall test + Sen's slope. Deterministic, no model. Rows are read in time order. e.g. `muse trend weight.csv kg`")
    .argument("<file>", "Path to the .csv file (rows in time order), e.g. weight.csv")
    .argument("<column>", "Numeric column to test, e.g. kg")
    .option("--json", "Print the structured result")
    .action(async (file: string, column: string, options: { readonly json?: boolean }) => {
      let text: string;
      try {
        text = await readFile(pathResolve(process.cwd(), file), "utf8");
      } catch (cause) {
        io.stderr(`muse trend: cannot read ${file} (${cause instanceof Error ? cause.message : String(cause)})\n`);
        process.exitCode = 1;
        return;
      }

      const parsed = parseCsv(text);
      if (parsed.headers.length === 0) {
        io.stderr(`muse trend: ${file} has no rows\n`);
        process.exitCode = 1;
        return;
      }
      const columnIndex = resolveColumn(parsed.headers, column);
      if (columnIndex === undefined) {
        io.stderr(`muse trend: no column '${column}' (have: ${parsed.headers.join(", ")})\n`);
        process.exitCode = 1;
        return;
      }

      const values = parsed.rows
        .map((row) => toNumber(row[columnIndex] ?? ""))
        .filter((n): n is number => n !== undefined);
      const result = mannKendall(values);

      if (options.json) {
        io.stdout(`${JSON.stringify({ column, ...result }, null, 2)}\n`);
        return;
      }
      io.stdout(formatTrend(result, column));
    });
}
