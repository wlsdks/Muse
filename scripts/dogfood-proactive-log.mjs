#!/usr/bin/env node
/**
 * Dogfood: run a real proactive tick end-to-end against the
 * credential-free `LogMessagingProvider`. Asserts the notice line
 * lands in the configured log file. Proves the "JARVIS popped up
 * unbidden" loop works without setting up Telegram / Slack /
 * Discord first.
 *
 * Uses a tmp tasks file with one task due in 5 minutes + a tmp
 * dedup sidecar + a tmp notifications log so we never touch the
 * user's real ~/.muse state.
 */

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("../", import.meta.url);
const mcp = await import(new URL("./packages/mcp/dist/index.js", ROOT).href);
const messaging = await import(new URL("./packages/messaging/dist/index.js", ROOT).href);

const { runDueProactiveNotices } = mcp;
const { LogMessagingProvider, MessagingProviderRegistry } = messaging;

const dir = mkdtempSync(join(tmpdir(), "muse-dogfood-proactive-log-"));
const tasksFile = join(dir, "tasks.json");
const sidecarFile = join(dir, "proactive-fired.json");
const logFile = join(dir, "notifications.log");

const now = new Date();
const dueAt = new Date(now.getTime() + 5 * 60_000);
writeFileSync(tasksFile, JSON.stringify({
  tasks: [{
    createdAt: now.toISOString(),
    dueAt: dueAt.toISOString(),
    id: "dogfood-task-log",
    status: "open",
    title: "Send the Q3 budget memo to Finance"
  }]
}), "utf8");

const registry = new MessagingProviderRegistry();
registry.register(new LogMessagingProvider({ file: logFile }));

const summary = await runDueProactiveNotices({
  destination: "@dogfood",
  leadMinutes: 10,
  messagingRegistry: registry,
  providerId: "log",
  sidecarFile,
  tasksFile
});

console.log(`summary: imminent=${summary.imminent} fired=${summary.fired} errors=${summary.errors.length}`);
if (summary.fired !== 1) {
  console.error(`FAIL — expected fired=1, got ${summary.fired}. errors=${JSON.stringify(summary.errors)}`);
  process.exit(1);
}

const contents = readFileSync(logFile, "utf8");
console.log(`notifications.log contents:`);
for (const line of contents.split("\n").filter((l) => l.length > 0)) {
  console.log(`  ${line}`);
}

if (!contents.includes("Send the Q3 budget memo to Finance")) {
  console.error(`FAIL — notification log doesn't mention the task title.`);
  process.exit(1);
}
if (!contents.includes("(@dogfood)")) {
  console.error(`FAIL — log line doesn't include the destination tag.`);
  process.exit(1);
}

console.log("---");
console.log("PASS  proactive notice delivered through LogMessagingProvider end-to-end.");
