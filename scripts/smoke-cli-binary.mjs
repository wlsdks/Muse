// smoke:binary — build the SELF-CONTAINED CLI binary the desktop .app bundles
// (bun `--compile`) and prove it actually RUNS. This is the gap that let a
// startup crash ship undetected: `node apps/cli/dist/index.js` tolerates an
// async module-init graph, but bun `--compile` emits a top-level
// `await init_<module>()` in a SYNC context and the bundled binary dies with
// `SyntaxError: Unexpected identifier 'init_…'` before it does anything. Every
// `node`-based test still passes, so only building + running the real artifact
// catches it. A new heavy static import in the chat path is the usual trigger.
//
// Offline by design: the assertion is a META question ("뭐 할 수 있어?"), which
// short-circuits to a deterministic answer with NO model call — so it exercises
// the full bundle (assembly + runLocalChat) without needing Ollama.
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const buildScript = join(repoRoot, "apps/desktop/scripts/build-cli-binary.mjs");
const binPath = join(tmpdir(), `muse-cli-smoke-${process.pid.toString()}`);

// The desktop binary is built with bun; skip gracefully where bun is absent.
if (spawnSync("bun", ["--version"], { encoding: "utf8" }).status !== 0) {
  console.log("smoke:binary skipped — bun is not installed (the desktop binary is built with `bun --compile`).");
  process.exit(0);
}
if (!existsSync(join(repoRoot, "apps/cli/dist/index.js"))) {
  console.error("smoke:binary — apps/cli/dist/index.js missing; run `pnpm --filter @muse/cli build` first.");
  process.exit(1);
}

console.log("smoke:binary — compiling the self-contained CLI binary (bun --compile)…");
const build = spawnSync("bun", [buildScript, binPath], { cwd: repoRoot, encoding: "utf8" });
if (build.status !== 0 || !existsSync(binPath)) {
  console.error(`FAIL: the self-contained binary did not build.\n${build.stderr ?? ""}`);
  process.exit(1);
}

const run = spawnSync(binPath, ["chat", "--local", "--json", "뭐 할 수 있어?"], {
  encoding: "utf8",
  env: { ...process.env, OLLAMA_BASE_URL: "http://127.0.0.1:1", MUSE_CACHE_ENABLED: "false" },
  timeout: 60_000
});
rmSync(binPath, { force: true });

const stderr = run.stderr ?? "";
if (/SyntaxError|init_[a-z0-9_]+\(\)/u.test(stderr)) {
  console.error(`FAIL: the bundled binary crashed at startup (a bundling/import issue node never shows):\n${stderr.slice(0, 600)}`);
  process.exit(1);
}
let parsed;
try { parsed = JSON.parse(run.stdout ?? ""); } catch { parsed = null; }
if (run.status !== 0 || !parsed || typeof parsed.response !== "string" || parsed.response.length < 10) {
  console.error(`FAIL: the binary ran but produced no valid answer.\nstdout: ${(run.stdout ?? "").slice(0, 300)}\nstderr: ${stderr.slice(0, 300)}`);
  process.exit(1);
}
console.log(`PASS: the self-contained binary builds + runs (meta answer: "${parsed.response.slice(0, 40)}…").`);
process.exit(0);
