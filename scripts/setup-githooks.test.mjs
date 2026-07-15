// node --test coverage for scripts/setup-githooks.mjs. Every git operation
// runs against a throwaway temp repo (fs.mkdtempSync) — this suite NEVER
// touches the real repo's git config, only fixtures under os.tmpdir().

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  chmodExecutable,
  findHookFiles,
  findLegacyHooks,
  getHooksPath,
  HOOKS_RELATIVE_PATH,
  isInsideGitWorkTree,
  setupGitHooks
} from "./setup-githooks.mjs";

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function makeTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "muse-githooks-test-"));
  git(dir, ["init", "--quiet"]);
  git(dir, ["config", "user.email", "test@example.invalid"]);
  git(dir, ["config", "user.name", "Muse Test"]);
  return dir;
}

function writeHookFixtures(repoDir) {
  const hooksDir = path.join(repoDir, HOOKS_RELATIVE_PATH);
  fs.mkdirSync(path.join(hooksDir, "lib"), { recursive: true });
  fs.writeFileSync(path.join(hooksDir, "pre-push"), "#!/usr/bin/env bash\nexit 0\n", { mode: 0o644 });
  fs.writeFileSync(path.join(hooksDir, "commit-msg"), "#!/usr/bin/env bash\nexit 0\n", { mode: 0o644 });
  fs.writeFileSync(path.join(hooksDir, "lib", "pushlock.sh"), "#!/usr/bin/env bash\n", { mode: 0o644 });
  return hooksDir;
}

test("isInsideGitWorkTree is false outside any git repo", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "muse-githooks-notgit-"));
  assert.equal(isInsideGitWorkTree(dir), false);
});

test("setupGitHooks is a silent no-op outside a git working tree", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "muse-githooks-notgit-"));
  const result = setupGitHooks(dir);
  assert.equal(result.skipped, true);
  assert.match(result.reason, /not inside a git working tree/u);
});

test("setupGitHooks is a no-op when scripts/githooks doesn't exist in the repo", () => {
  const repoDir = makeTempRepo();
  const result = setupGitHooks(repoDir);
  assert.equal(result.skipped, true);
  assert.match(result.reason, /scripts\/githooks not found/u);
});

test("setupGitHooks sets core.hooksPath to the versioned relative path", () => {
  const repoDir = makeTempRepo();
  writeHookFixtures(repoDir);

  assert.equal(getHooksPath(repoDir), undefined);
  const result = setupGitHooks(repoDir);
  assert.equal(result.skipped, false);
  assert.equal(result.current, "scripts/githooks");
  assert.equal(getHooksPath(repoDir), "scripts/githooks");
});

test("setupGitHooks chmods every hook file (including nested lib/) to executable", () => {
  const repoDir = makeTempRepo();
  writeHookFixtures(repoDir);
  const hooksDir = path.join(fs.realpathSync(repoDir), HOOKS_RELATIVE_PATH);

  const before = fs.statSync(path.join(hooksDir, "pre-push")).mode & 0o777;
  assert.notEqual(before, 0o755);

  const result = setupGitHooks(repoDir);
  assert.deepEqual(
    result.chmodded.map((p) => path.relative(hooksDir, p)).sort(),
    ["commit-msg", "lib/pushlock.sh", "pre-push"]
  );

  for (const file of findHookFiles(hooksDir)) {
    assert.equal(fs.statSync(file).mode & 0o777, 0o755);
  }
});

test("setupGitHooks is idempotent — a second run reports nothing new to chmod", () => {
  const repoDir = makeTempRepo();
  writeHookFixtures(repoDir);
  setupGitHooks(repoDir);
  const second = setupGitHooks(repoDir);
  assert.deepEqual(second.chmodded, []);
});

test("core.hooksPath is shared across worktrees of the same repo (not worktree-scoped)", () => {
  const repoDir = makeTempRepo();
  writeHookFixtures(repoDir);
  git(repoDir, ["commit", "--allow-empty", "--quiet", "-m", "init"]);

  const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), "muse-githooks-worktree-"));
  fs.rmdirSync(worktreeDir);
  git(repoDir, ["worktree", "add", "--quiet", "-b", "other", worktreeDir]);

  try {
    setupGitHooks(repoDir);
    assert.equal(getHooksPath(worktreeDir), "scripts/githooks", "the linked worktree must see the same core.hooksPath — it lives in git-common-dir, not per-worktree");
  } finally {
    git(repoDir, ["worktree", "remove", "--force", worktreeDir]);
  }
});

test("findLegacyHooks reports pre-existing .git/hooks/{pre-push,commit-msg} as superseded", () => {
  const repoDir = makeTempRepo();
  const gitDir = git(repoDir, ["rev-parse", "--git-common-dir"]);
  const absoluteGitDir = path.isAbsolute(gitDir) ? gitDir : path.join(repoDir, gitDir);
  fs.writeFileSync(path.join(absoluteGitDir, "hooks", "pre-push"), "#!/usr/bin/env bash\n");
  fs.writeFileSync(path.join(absoluteGitDir, "hooks", "commit-msg"), "#!/usr/bin/env bash\n");

  writeHookFixtures(repoDir);
  const result = setupGitHooks(repoDir);
  assert.equal(result.legacy.length, 2);
});

test("chmodExecutable only reports files whose mode actually changed", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "muse-githooks-chmod-"));
  const alreadyExec = path.join(dir, "a.sh");
  const needsChmod = path.join(dir, "b.sh");
  fs.writeFileSync(alreadyExec, "", { mode: 0o755 });
  fs.writeFileSync(needsChmod, "", { mode: 0o644 });

  const changed = chmodExecutable([alreadyExec, needsChmod]);
  assert.deepEqual(changed, [needsChmod]);
  assert.equal(fs.statSync(alreadyExec).mode & 0o777, 0o755);
  assert.equal(fs.statSync(needsChmod).mode & 0o777, 0o755);
});
