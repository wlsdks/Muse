#!/usr/bin/env node
// Deterministic immutable-core guard (fail-close).
//
// The autonomous loop commits to this repo and is only ASKED, in
// prose, not to weaken its own honesty machinery. Prose is fail-open.
// This makes it fail-close: a commit whose diff touches any line
// inside an IMMUTABLE-CORE sentinel block is REJECTED unless the
// commit message carries the explicit human override token
//   [core-change: human]
// Muse non-negotiable: "Security is deterministic code, never prompt
// instruction." This is that, for the loop's own constitution.
//
// Wired as .git/hooks/pre-commit (see scripts/install-git-hooks.sh)
// and runnable as `pnpm guard:core`. Zero deps.

import { execFileSync } from "node:child_process";

const OVERRIDE = "[core-change: human]";
const BEGIN = "IMMUTABLE-CORE:BEGIN";
const END = "IMMUTABLE-CORE:END";

function sh(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8" });
  } catch (e) {
    return e.stdout ? String(e.stdout) : "";
  }
}

// Files that contain immutable sentinel blocks.
const guarded = sh("git", [
  "grep",
  "-l",
  "--cached",
  BEGIN,
  "--",
  "*.md"
])
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

if (guarded.length === 0) process.exit(0);

// Lines (1-based) inside a BEGIN..END block, per file, at the staged
// (post-change) revision.
function protectedLines(file) {
  const text = sh("git", ["show", `:${file}`]) || "";
  const lines = text.split("\n");
  const set = new Set();
  let inside = false;
  lines.forEach((ln, i) => {
    if (ln.includes(BEGIN)) inside = true;
    if (inside) set.add(i + 1);
    if (ln.includes(END)) inside = false;
  });
  return set;
}

// Changed line numbers (new-side) from the staged diff hunks.
function changedLines(file) {
  const diff = sh("git", ["diff", "--cached", "--unified=0", "--", file]);
  const set = new Set();
  let newLn = 0;
  for (const line of diff.split("\n")) {
    const m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (m) {
      newLn = Number(m[1]);
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) {
      set.add(newLn);
      newLn += 1;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      set.add(newLn);
    }
  }
  return set;
}

const msg = process.env.MUSE_COMMIT_MSG || sh("git", ["log", "-1", "--format=%B"]) || "";
const stagedMsgFile = process.env.HUSKY_GIT_PARAMS || process.argv[2];
let commitMsg = msg;
if (stagedMsgFile) {
  try {
    commitMsg = sh("cat", [stagedMsgFile]) || msg;
  } catch {
    /* fall back to last commit msg */
  }
}

const violations = [];
for (const file of guarded) {
  const prot = protectedLines(file);
  if (prot.size === 0) continue;
  for (const ln of changedLines(file)) {
    if (prot.has(ln)) {
      violations.push(`${file}:${ln}`);
      break;
    }
  }
}

if (violations.length === 0) process.exit(0);

if (commitMsg.includes(OVERRIDE)) {
  process.stderr.write(
    `guard-immutable: human override accepted for ${violations.join(", ")}\n`
  );
  process.exit(0);
}

process.stderr.write(
  `\nguard-immutable: REJECTED — this commit edits the IMMUTABLE CORE:\n` +
    violations.map((v) => `  ${v}`).join("\n") +
    `\n\nThe autonomous loop must NOT weaken its own honesty machinery.\n` +
    `If a human truly intends this, put exactly "${OVERRIDE}" in the\n` +
    `commit message. The loop itself may never use that token.\n\n`
);
process.exit(1);
