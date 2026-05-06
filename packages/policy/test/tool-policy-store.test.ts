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
  createToolPolicyConfig,
  createToolPolicyInsert,
  mapToolPolicyRow,
  toolPolicyToJson
} from "../src/index.js";

describe("tool policy store mapping", () => {
  it("normalizes policy input and maps database rows", () => {
    const now = new Date("2026-05-06T00:00:00.000Z");
    const config = createToolPolicyConfig({
      allowWriteToolNamesByChannel: {
        " CHANNEL-1 ": ["write_note", "write_note", ""]
      },
      allowWriteToolNamesInDenyChannels: ["write_note"],
      denyWriteChannels: [" CHANNEL-1 "],
      denyWriteMessage: " no writes ",
      enabled: true,
      writeToolNames: ["write_note", "write_note"]
    }, now);
    const row = createToolPolicyInsert(config);
    const sql = createPostgresBuilder()
      .insertInto("tool_policy")
      .values(row)
      .onConflict((oc) => oc.column("id").doUpdateSet({ enabled: row.enabled }))
      .returningAll()
      .compile();

    expect(sql.sql).toContain('insert into "tool_policy"');
    expect(mapToolPolicyRow(row)).toMatchObject({
      allowWriteToolNamesByChannel: { "channel-1": ["write_note"] },
      denyWriteChannels: ["channel-1"],
      denyWriteMessage: "no writes",
      enabled: true,
      writeToolNames: ["write_note"]
    });
    expect(toolPolicyToJson(config)).toMatchObject({
      createdAt: "2026-05-06T00:00:00.000Z",
      enabled: true
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

