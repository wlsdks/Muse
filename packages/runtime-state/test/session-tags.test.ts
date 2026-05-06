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
  createSessionTagInsert,
  InMemorySessionTagStore,
  mapSessionTagRow
} from "../src/index.js";

describe("SessionTagStore", () => {
  it("creates, lists, and deletes session tags in memory", async () => {
    const store = new InMemorySessionTagStore({
      idFactory: () => "tag-1",
      now: () => 1_776_000_000_000
    });

    const tag = await store.create({
      comment: "Needs review",
      createdBy: "admin-1",
      label: "review",
      sessionId: "session-1"
    });

    expect(tag).toMatchObject({
      comment: "Needs review",
      id: "tag-1",
      label: "review",
      sessionId: "session-1"
    });
    expect(await store.listBySession("session-1")).toHaveLength(1);
    expect(await store.delete("session-1", "tag-1")).toBe(true);
    expect(await store.listBySession("session-1")).toEqual([]);
  });

  it("builds database inserts and maps rows", () => {
    const db = createPostgresBuilder();
    const row = createSessionTagInsert(
      {
        comment: "Needs review",
        createdBy: "admin-1",
        label: "review",
        sessionId: "session-1"
      },
      {
        idFactory: () => "tag-1",
        now: () => 1_776_000_000_000
      }
    );
    const compiled = db.insertInto("session_tags").values(row).returningAll().compile();

    expect(compiled.sql).toContain('insert into "session_tags"');
    expect(row).toMatchObject({
      created_by: "admin-1",
      id: "tag-1",
      label: "review",
      session_id: "session-1"
    });
    expect(mapSessionTagRow(row)).toMatchObject({
      createdBy: "admin-1",
      id: "tag-1",
      label: "review",
      sessionId: "session-1"
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

