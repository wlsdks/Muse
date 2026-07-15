// node --test coverage for scripts/githooks/lib/pushlock.sh's mkdir-spinlock
// (the macOS-default path — no real flock(1) is assumed present). Drives the
// script's direct-invocation test entry as a real bash subprocess; never
// touches a real push or real git config.

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pushlockScript = path.join(here, "githooks", "lib", "pushlock.sh");

function tempPath(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return path.join(dir, "lock");
}

function runPushlock(lockPath, holdSeconds, logFile, env = {}) {
  return spawn("bash", [pushlockScript, lockPath, String(holdSeconds), logFile], {
    env: { ...process.env, ...env }
  });
}

function waitForExit(child) {
  return new Promise((resolve) => {
    child.on("exit", (code) => resolve(code));
  });
}

test("two concurrent invocations serialize — never both hold the lock at once", async () => {
  const lockPath = tempPath("muse-pushlock-serialize-");
  const logFile = tempPath("muse-pushlock-log-") + ".log";
  fs.writeFileSync(logFile, "");

  const a = runPushlock(lockPath, 0.4, logFile);
  const b = runPushlock(lockPath, 0.4, logFile);
  const [codeA, codeB] = await Promise.all([waitForExit(a), waitForExit(b)]);

  assert.equal(codeA, 0);
  assert.equal(codeB, 0);

  const lines = fs.readFileSync(logFile, "utf8").trim().split("\n");
  assert.equal(lines.length, 4);
  // Serialized: start,end MUST pair up before the next start ever appears —
  // "start,start,end,end" is the interleaved failure this lock exists to prevent.
  assert.match(lines[0], /^start:/u);
  assert.match(lines[1], /^end:/u);
  assert.match(lines[2], /^start:/u);
  assert.match(lines[3], /^end:/u);
  const [, pidA] = lines[0].split(":");
  const [, pidAEnd] = lines[1].split(":");
  assert.equal(pidA, pidAEnd, "the first holder's start/end must be the same process");
});

test("a stale lock (older than the timeout) is reclaimed instead of deadlocking forever", async () => {
  const lockPath = tempPath("muse-pushlock-stale-");
  const lockDir = `${lockPath}.d`;
  fs.mkdirSync(lockDir, { recursive: true });
  const past = new Date(Date.now() - 20_000);
  fs.utimesSync(lockDir, past, past);

  const logFile = tempPath("muse-pushlock-stale-log-") + ".log";
  fs.writeFileSync(logFile, "");

  const child = runPushlock(lockPath, 0.1, logFile, { MUSE_PREPUSH_LOCK_TIMEOUT: "1" });
  const code = await waitForExit(child);
  assert.equal(code, 0);
  const lines = fs.readFileSync(logFile, "utf8").trim().split("\n");
  assert.equal(lines.length, 2);
});

test("lock directory is released after the holder exits", async () => {
  const lockPath = tempPath("muse-pushlock-release-");
  const logFile = tempPath("muse-pushlock-release-log-") + ".log";
  fs.writeFileSync(logFile, "");

  const child = runPushlock(lockPath, 0.1, logFile);
  await waitForExit(child);
  assert.equal(fs.existsSync(`${lockPath}.d`), false, "the mkdir-lock directory must be removed on exit (EXIT trap)");
});

test("acquiring the lock times out and exits nonzero when it cannot be obtained in time", async () => {
  const lockPath = tempPath("muse-pushlock-timeout-");
  const lockDir = `${lockPath}.d`;
  fs.mkdirSync(lockDir, { recursive: true });
  const now = new Date();
  fs.utimesSync(lockDir, now, now);

  const logFile = tempPath("muse-pushlock-timeout-log-") + ".log";
  fs.writeFileSync(logFile, "");

  // A LIVE holder heartbeats the lock mtime (pushlock refreshes it every 30s
  // in production; compressed here) — keep it fresh so the waiter can never
  // stale-reclaim and must hit the give-up bound (2x the reclaim timeout).
  const heartbeat = setInterval(() => {
    const tick = new Date();
    try { fs.utimesSync(lockDir, tick, tick); } catch { /* gone = test over */ }
  }, 300);
  const child = runPushlock(lockPath, 0.1, logFile, { MUSE_PREPUSH_LOCK_TIMEOUT: "1" });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  const code = await waitForExit(child);
  clearInterval(heartbeat);
  assert.notEqual(code, 0);
  assert.match(stderr, /BLOCKED/u);
  assert.equal(fs.readFileSync(logFile, "utf8"), "");
});

test("pushlock.sh is executable and shellcheck-clean where shellcheck is available", () => {
  assert.equal(fs.statSync(pushlockScript).mode & 0o111, 0o111);
  try {
    execFileSync("shellcheck", [pushlockScript], { encoding: "utf8" });
  } catch (error) {
    if (error.code === "ENOENT") return; // shellcheck not installed — skip
    throw error;
  }
});
