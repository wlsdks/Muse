import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { clearSecretRegistryForTests, registerSecretValue } from "@muse/shared";

import { appendActionLog, queryActionLog } from "../src/personal-action-log-store.js";

describe("appendActionLog — secret redaction at the log boundary", () => {
  let dir: string;
  let file: string;
  const env: NodeJS.ProcessEnv = {};

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "muse-actionlog-secret-"));
    file = join(dir, "action-log.json");
    clearSecretRegistryForTests();
  });

  afterEach(async () => {
    clearSecretRegistryForTests();
    await rm(dir, { recursive: true, force: true });
  });

  it("masks a resolved secret value in what/why/detail, never persisting it in clear", async () => {
    const secret = "tg-bot-9f3a-super-secret-value";
    registerSecretValue(secret, "telegram-token");

    await appendActionLog(
      file,
      {
        id: "a1",
        userId: "u1",
        when: "2026-06-30T00:00:00.000Z",
        what: `sent message using token ${secret}`,
        why: `objective needed ${secret}`,
        result: "performed",
        detail: `auth header bearer ${secret}`
      },
      env
    );

    const raw = await readFile(file, "utf8");
    // Fail-closed: the raw on-disk text must NOT contain the value anywhere.
    expect(raw.includes(secret)).toBe(false);
    expect(raw).toContain("‹secret:telegram-token›");

    const [entry] = await queryActionLog(file, {}, env);
    expect(entry?.what).toBe("sent message using token ‹secret:telegram-token›");
    expect(entry?.why).toBe("objective needed ‹secret:telegram-token›");
    expect(entry?.detail).toBe("auth header bearer ‹secret:telegram-token›");
  });

  it("leaves entries untouched when no secret is registered (zero overhead path)", async () => {
    await appendActionLog(
      file,
      {
        id: "b1",
        userId: "u1",
        when: "2026-06-30T00:00:00.000Z",
        what: "read calendar",
        why: "daily brief",
        result: "performed"
      },
      env
    );
    const [entry] = await queryActionLog(file, {}, env);
    expect(entry?.what).toBe("read calendar");
  });
});
