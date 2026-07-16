import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

import { runSourceInstall, sourceInstallCommands, supportsNode } from "./install-source.mjs";

const dirs = [];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "muse-source-install-"));
  dirs.push(root);
  await mkdir(join(root, ".git"));
  await writeFile(join(root, "package.json"), "{}\n");
  await writeFile(join(root, "pnpm-workspace.yaml"), "packages: []\n");
  return root;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

function scripted(results = {}) {
  const calls = [];
  return {
    calls,
    run: async (call) => {
      calls.push(call);
      const key = `${call.command} ${call.args.join(" ")}`;
      if (key === "git rev-parse --abbrev-ref HEAD") return { code: 0, stderr: "", stdout: "main\n" };
      if (key === "git status --porcelain") return { code: 0, stderr: "", stdout: "" };
      return results[key] ?? { code: 0, stderr: "", stdout: "ok\n" };
    }
  };
}

test("Node support starts at 22.12", () => {
  assert.equal(supportsNode("22.11.0"), false);
  assert.equal(supportsNode("22.12.0"), true);
  assert.equal(supportsNode("24.0.0"), true);
});

test("dry run validates the checkout and prints the one install plan without mutations", async () => {
  const root = await fixture();
  const fake = scripted();
  const lines = [];
  await runSourceInstall({ dryRun: true, nodeVersion: "24.0.0", root, run: fake.run, stdout: (line) => lines.push(line) });

  assert.deepEqual(fake.calls.map((call) => `${call.command} ${call.args.join(" ")}`), [
    "git rev-parse --abbrev-ref HEAD",
    "git status --porcelain",
    "pnpm --version",
    "pnpm bin --global"
  ]);
  assert.match(lines.join(""), /pnpm install --frozen-lockfile/u);
  assert.match(lines.join(""), /pnpm --dir apps\/cli link --global/u);
});

test("a successful install runs frozen install, build, global link, and CLI verification in order", async () => {
  const root = await fixture();
  const fake = scripted();
  const lines = [];
  await runSourceInstall({ nodeVersion: "24.0.0", root, run: fake.run, stdout: (line) => lines.push(line) });

  assert.deepEqual(fake.calls.slice(4), sourceInstallCommands(root));
  assert.match(lines.join(""), /Update:    muse update/u);
  assert.match(lines.join(""), /Uninstall: pnpm --global remove @muse\/cli/u);
});

test("a build failure stops before the global link", async () => {
  const root = await fixture();
  const fake = scripted({ "pnpm build": { code: 1, stderr: "compile failed", stdout: "" } });
  await assert.rejects(
    runSourceInstall({ nodeVersion: "24.0.0", root, run: fake.run, stdout: () => undefined }),
    /compile failed/u
  );
  assert.equal(fake.calls.some((call) => call.args.includes("link")), false);
});
