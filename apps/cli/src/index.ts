#!/usr/bin/env node
// Enable the V8 compile cache before any other module in the graph — see
// compile-cache.ts for why this must stay the first import.
import "./compile-cache.js";
import { trySpecFastPath } from "./muse-spec.js";
import { tryVersionFastPath } from "./muse-version.js";

// Reject an oversized argv BEFORE any heavy module import. A ~950k-char arg sits
// near V8's synchronous stack ceiling, and program.js's ~100-module ESM linking
// then tips over into a raw `RangeError: Maximum call stack size exceeded`. This
// check is deliberately INLINE and dependency-free — importing the shared
// `assertArgvWithinLimit` (from program-helpers) would drag that helper's own
// module graph into index's static linking, which overflows first, before the
// guard could run. Keep the two in sync; program-helpers' export is the
// unit-tested twin. Threshold (800k) is safely below the observed ~900k cliff.
{
  let argvChars = 0;
  for (const arg of process.argv) {
    argvChars += typeof arg === "string" ? arg.length : 0;
  }
  if (argvChars > 800_000) {
    process.stderr.write(
      `muse: input too large (${argvChars.toString()} chars) — pass large content via stdin ` +
        "(e.g. `muse ask \"$(cat file)\"` → `cat file | muse ask`) instead of a command-line argument.\n"
    );
    process.exit(1);
  }
}

// Handle the trivial `muse --version` / `muse spec` probes BEFORE importing the
// command framework, so these common invocations skip the ~100-module graph.
const fastWrite = (text: string) => process.stdout.write(text);
if (tryVersionFastPath(process.argv, fastWrite) || trySpecFastPath(process.argv, fastWrite)) {
  process.exit(0);
}

try {
  const { createProgram } = await import("./program.js");
  await createProgram().parseAsync(process.argv);
} catch (error) {
  const [{ formatCliError, commandFromArgv }, { MUSE_CLI_VERSION }] = await Promise.all([
    import("./format-cli-error.js"),
    import("./muse-version.js")
  ]);
  process.stderr.write(formatCliError(error, {
    command: commandFromArgv(process.argv) ?? "",
    version: MUSE_CLI_VERSION
  }));
  process.exit(1);
}
