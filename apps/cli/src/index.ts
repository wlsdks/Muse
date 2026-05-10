#!/usr/bin/env node
import { createProgram } from "./program.js";

try {
  await createProgram().parseAsync(process.argv);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`muse: ${message}\n`);
  process.exit(1);
}
