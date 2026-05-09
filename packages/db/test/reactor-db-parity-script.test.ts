import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildDbParityReport } from "../../../scripts/verify-reactor-db-parity.mjs";

const tempDirs: string[] = [];

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe("verify-reactor-db-parity", () => {
  it("reports Reactor tables missing from Muse migrations", () => {
    const root = createFixture({
      museSql: `
        CREATE TABLE IF NOT EXISTS agent_runs (id text primary key);
        CREATE TABLE IF NOT EXISTS pending_approvals (id text primary key);
      `,
      compatSql: `
        CREATE TABLE conversation_messages (id uuid primary key);
        CREATE TABLE IF NOT EXISTS pending_approvals (id text primary key);
        CREATE TABLE public.feedback (id text primary key);
      `
    });

    const report = buildDbParityReport(root.reactor, root.muse);

    expect(report.reactor.tableCount).toBe(3);
    expect(report.muse.tableCount).toBe(2);
    expect(report.missingCompatTables.map((table) => table.name)).toEqual([
      "conversation_messages",
      "feedback"
    ]);
    expect(report.missingByFamily).toMatchObject({
      feedback: 1,
      "memory/context": 1
    });
  });

  it("ignores comments and de-duplicates repeated table definitions", () => {
    const root = createFixture({
      museSql: "CREATE TABLE IF NOT EXISTS users (id text primary key);",
      compatSql: `
        -- CREATE TABLE commented_out (id text);
        CREATE TABLE users (id text primary key);
        CREATE TABLE IF NOT EXISTS users (id text primary key);
        /* CREATE TABLE hidden_table (id text); */
      `
    });

    const report = buildDbParityReport(root.reactor, root.muse);

    expect(report.reactor.tables).toEqual(["users"]);
    expect(report.missingCompatTables).toEqual([]);
  });
});

function createFixture(input: {
  readonly museSql: string;
  readonly compatSql: string;
}): { readonly muse: string; readonly reactor: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "muse-db-parity-"));
  tempDirs.push(root);

  const reactor = path.join(root, "reactor");
  const muse = path.join(root, "Muse");
  fs.mkdirSync(path.join(reactor, "modules/persistence-schema/src/main/resources/db/migration"), { recursive: true });
  fs.mkdirSync(path.join(reactor, "modules/admin/src/main/resources/db/admin-migration"), { recursive: true });
  fs.mkdirSync(path.join(muse, "packages/db/src"), { recursive: true });
  fs.writeFileSync(path.join(reactor, "settings.gradle.kts"), "rootProject.name = \"reactor\"\n");
  fs.writeFileSync(
    path.join(reactor, "modules/persistence-schema/src/main/resources/db/migration/V1__fixture.sql"),
    input.compatSql
  );
  fs.writeFileSync(path.join(muse, "packages/db/src/migrations.ts"), input.museSql);

  return { muse, reactor };
}
