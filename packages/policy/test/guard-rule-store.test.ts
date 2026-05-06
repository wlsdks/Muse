import type { MuseDatabase } from "@muse/db";
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler
} from "kysely";
import { describe, expect, it } from "vitest";
import {
  InMemoryGuardRuleStore,
  createInputGuardRuleInsert,
  createOutputGuardRuleAuditInsert,
  createOutputGuardRuleInsert,
  mapInputGuardRuleRow,
  mapOutputGuardRuleAuditRow,
  mapOutputGuardRuleRow
} from "../src/index.js";

describe("guard rule store mapping", () => {
  it("stores guard rules in memory and maps database rows", async () => {
    const store = new InMemoryGuardRuleStore();
    const inputRule = await store.saveInputRule({
      action: "block",
      category: "custom",
      createdAt: "2026-05-06T00:00:00.000Z",
      id: "input-rule-1",
      name: "Block token",
      pattern: "secret",
      patternType: "keyword",
      priority: 10
    });
    const outputRule = await store.saveOutputRule({
      action: "MASK",
      createdAt: "2026-05-06T00:00:00.000Z",
      id: "output-rule-1",
      name: "Mask token",
      pattern: "secret",
      priority: 20,
      replacement: "[MASKED]"
    });
    const audit = await store.saveOutputAudit({
      action: "CREATE",
      actor: "admin",
      createdAt: "2026-05-06T00:01:00.000Z",
      id: "audit-1",
      ruleId: "output-rule-1"
    });
    const sql = createPostgresBuilder()
      .insertInto("output_guard_rules")
      .values(createOutputGuardRuleInsert(outputRule))
      .onConflict((oc) => oc.column("id").doUpdateSet({ enabled: true }))
      .returningAll()
      .compile();

    expect(sql.sql).toContain('insert into "output_guard_rules"');
    expect(await store.getInputRule("input-rule-1")).toMatchObject({ patternType: "keyword" });
    expect(await store.listOutputAudits(10)).toHaveLength(1);
    expect(mapInputGuardRuleRow(createInputGuardRuleInsert(inputRule))).toMatchObject({ id: "input-rule-1" });
    expect(mapOutputGuardRuleRow(createOutputGuardRuleInsert(outputRule))).toMatchObject({
      replacement: "[MASKED]"
    });
    expect(mapOutputGuardRuleAuditRow(createOutputGuardRuleAuditInsert(audit))).toMatchObject({
      ruleId: "output-rule-1"
    });
  });
});

function createPostgresBuilder(): Kysely<MuseDatabase> {
  return new Kysely<MuseDatabase>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler()
    }
  });
}
