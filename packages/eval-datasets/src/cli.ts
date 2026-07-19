#!/usr/bin/env node
import { FAMILIES, SYNTHETIC_PROVENANCE, TIERS, generateTier, validateTier, type Tier } from "./index.js";
import { executeStratifiedPublicSeams } from "./seams.js";
import { runScale, validateScale } from "./scale.js";

function flag(args: readonly string[], name: string): string {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`Missing required ${name}`);
  return value;
}

function tierValue(raw: string): Tier {
  const value = Number(raw);
  if (!TIERS.includes(value as Tier)) throw new Error(`Tier must be one of ${TIERS.join(", ")}`);
  return value as Tier;
}

function seedValue(raw: string): number {
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new Error("Seed must be a safe integer");
  return value;
}

async function main(): Promise<void> {
  const [command, ...rawArgs] = process.argv.slice(2);
  const args = rawArgs.filter((value) => value !== "--");
  switch (command) {
    case "generate": {
      const tier = tierValue(flag(args, "--tier"));
      const seed = seedValue(flag(args, "--seed"));
      const out = flag(args, "--out");
      const allowed = new Set(["--tier", String(tier), "--seed", String(seed), "--out", out]);
      if (args.some((value) => !allowed.has(value))) throw new Error("Unknown generate argument");
      const manifestPath = await generateTier({ tier, seed, out });
      const validation = await validateTier(manifestPath);
      const seams = await executeStratifiedPublicSeams(validation.sample, validation.manifest.familyCounts);
      process.stdout.write(`${JSON.stringify({ ...SYNTHETIC_PROVENANCE, manifestPath, records: validation.parsedAndSchemaValidated, publicSeamsExecuted: seams.executed, terminalInvariantPassed: seams.passed, llmCalls: 0, toolCalls: 0, networkCalls: 0 })}\n`);
      return;
    }
    case "validate": {
      const manifestPath = flag(args, "--manifest");
      if (args.length !== 2) throw new Error("Unknown validate argument");
      const validation = await validateTier(manifestPath);
      const seams = await executeStratifiedPublicSeams(validation.sample, validation.manifest.familyCounts);
      process.stdout.write(`${JSON.stringify({ ...SYNTHETIC_PROVENANCE, tier: validation.manifest.tier, records: validation.parsedAndSchemaValidated, collisions: validation.collisionCounts, publicSeamsExecuted: seams.executed, terminalInvariantPassed: seams.passed, families: FAMILIES, llmCalls: 0, toolCalls: 0, networkCalls: 0 })}\n`);
      return;
    }
    case "scale": {
      if (args.length > 0) throw new Error("eval:data:scale takes no arguments");
      const result = await runScale();
      process.stdout.write(`${JSON.stringify({ ...SYNTHETIC_PROVENANCE, qualification: result.qualification, records: result.totals.generated, publicSeamsExecuted: result.totals.namedPublicMuseSeamExecuted, terminalInvariantPassed: result.totals.terminalInvariantPassed, bulkBytes: result.totals.bulkBytes, totalDiskBytesPeak: result.totals.totalDiskBytesPeak, ownerStateByteStable: result.ownerState.byteStable })}\n`);
      return;
    }
    case "scale-validate": {
      if (args.length > 0) throw new Error("eval:data:scale:validate takes no arguments");
      const result = await validateScale();
      process.stdout.write(`${JSON.stringify({ ...SYNTHETIC_PROVENANCE, qualification: result.qualification, records: result.totals.parsedAndSchemaValidated, ownerStateByteStable: result.ownerState.byteStable })}\n`);
      return;
    }
    default: throw new Error("Expected generate, validate, scale, or scale-validate");
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
