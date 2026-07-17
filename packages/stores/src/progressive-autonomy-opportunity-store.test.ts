import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FileProgressiveAutonomyOpportunityStore,
  type ProgressiveAutonomyRuntimeOpportunityReceipt
} from "./progressive-autonomy-opportunity-store.js";

describe("FileProgressiveAutonomyOpportunityStore public evidence contract", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
  });

  it("is no-write idempotent for exact replay, records a new trace without recounting a logical duplicate, and rejects a conflicting trace scope", async () => {
    const { file, store } = await fixture();
    const first = receipt();
    await store.record(first);
    expect((await stat(file)).mode & 0o777).toBe(0o600);

    const exactBytes = await readFile(file, "utf8");
    await store.record({ ...first, recordedAt: "2026-07-17T04:00:00.000Z" });
    expect(await readFile(file, "utf8")).toBe(exactBytes);

    await store.record({
      ...first,
      envelope: { ...first.envelope, traceId: "runtime-tool:run-1:call-2" },
      id: "opportunity-2",
      toolCallId: "call-2"
    });
    expect(await store.list()).toEqual([first]);

    const beforeConflict = await readFile(file, "utf8");
    await expect(store.record({
      ...first,
      envelope: {
        ...first.envelope,
        idempotencyKey: "runtime-opportunity:run-1:other-task",
        link: { ...first.envelope.link, taskId: "other-task" }
      }
    })).rejects.toThrow("different scope");
    expect(await readFile(file, "utf8")).toBe(beforeConflict);
  });

  it("fails closed on corrupt or unknown schema without overwriting bytes", async () => {
    const sample = receipt();
    for (const raw of [
      "{not-json\n",
      JSON.stringify({ opportunities: [], schemaVersion: 999, traces: [] }),
      JSON.stringify({
        opportunities: [],
        schemaVersion: 1,
        traces: [{ envelope: sample.envelope, runId: sample.runId, toolCallId: sample.toolCallId }]
      })
    ]) {
      const { file, store } = await fixture();
      await writeFile(file, raw, "utf8");

      await expect(store.list()).rejects.toThrow("opportunity store is corrupt");
      await expect(store.record(receipt())).rejects.toThrow("opportunity store is corrupt");
      expect(await readFile(file, "utf8")).toBe(raw);
    }
  });

  it("validates the complete candidate before the first write", async () => {
    const { file, store } = await fixture();
    const invalid = {
      ...receipt(),
      envelope: { ...receipt().envelope, transition: { from: "open", to: "open" } }
    } as unknown as ProgressiveAutonomyRuntimeOpportunityReceipt;

    await expect(store.record(invalid)).rejects.toThrow("opportunity store is corrupt");
    await expect(readFile(file, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects an orphan opportunity with no semantic trace and preserves corrupt bytes", async () => {
    const { file, store } = await fixture();
    await store.record(receipt());
    const state = JSON.parse(await readFile(file, "utf8")) as { traces: unknown[] };
    state.traces = [];
    const corrupt = JSON.stringify(state);
    await writeFile(file, corrupt, "utf8");

    await expect(store.list()).rejects.toThrow("opportunity store is corrupt");
    await expect(store.record(receipt())).rejects.toThrow("opportunity store is corrupt");
    expect(await readFile(file, "utf8")).toBe(corrupt);
  });

  it("rejects traces whose semantic scope differs from their opportunity beyond tool-call traceId", async () => {
    type MutableEnvelope = {
      idempotencyKey: string;
      link: { linkedAt: string };
      threadId: string;
      transition: { from: string; to: string };
      userId: string;
    };
    const mutations = [
      (envelope: MutableEnvelope) => { envelope.threadId = "thread-other"; },
      (envelope: MutableEnvelope) => { envelope.userId = "other-user"; },
      (envelope: MutableEnvelope) => { envelope.link.linkedAt = "2026-07-17T02:00:01.000Z"; },
      (envelope: MutableEnvelope) => { envelope.idempotencyKey = "different-idempotency"; },
      (envelope: MutableEnvelope) => { envelope.transition = { from: "open", to: "open" }; }
    ];
    for (const mutate of mutations) {
      const { file, store } = await fixture();
      await store.record(receipt());
      const state = JSON.parse(await readFile(file, "utf8")) as { traces: Array<{ envelope: MutableEnvelope }> };
      mutate(state.traces[0]!.envelope);
      const corrupt = JSON.stringify(state);
      await writeFile(file, corrupt, "utf8");

      await expect(store.list()).rejects.toThrow("opportunity store is corrupt");
      expect(await readFile(file, "utf8")).toBe(corrupt);
    }
  });

  it("rejects an impossible wouldAllowStanding decision without an exact matched grant", async () => {
    const { file, store } = await fixture();
    await store.record(receipt());
    const state = JSON.parse(await readFile(file, "utf8")) as {
      opportunities: Array<{ shadowAssessment: string; shadowRationale: string }>;
    };
    state.opportunities[0]!.shadowAssessment = "wouldAllowStanding";
    state.opportunities[0]!.shadowRationale = "exact active standing grant";
    const corrupt = JSON.stringify(state);
    await writeFile(file, corrupt, "utf8");

    await expect(store.list()).rejects.toThrow("opportunity store is corrupt");
    await expect(store.record(receipt())).rejects.toThrow("opportunity store is corrupt");
    expect(await readFile(file, "utf8")).toBe(corrupt);
  });

  it("rejects every other impossible shadow decision/grant combination", async () => {
    const mutations = [
      (entry: Record<string, unknown>) => { entry.matchedGrantId = "grant-unexpected"; },
      (entry: Record<string, unknown>) => {
        entry.enforcementDecision = "deny";
        entry.matchedGrantId = "grant-unexpected";
        entry.shadowAssessment = "wouldDeny";
      },
      (entry: Record<string, unknown>) => {
        entry.enforcementDecision = "allow-standing";
        entry.matchedGrantId = "grant-1";
        entry.shadowAssessment = "wouldAllowStanding";
      }
    ];
    for (const mutate of mutations) {
      const { file, store } = await fixture();
      await store.record(receipt());
      const state = JSON.parse(await readFile(file, "utf8")) as { opportunities: Array<Record<string, unknown>> };
      mutate(state.opportunities[0]!);
      const corrupt = JSON.stringify(state);
      await writeFile(file, corrupt, "utf8");

      await expect(store.list()).rejects.toThrow("opportunity store is corrupt");
      expect(await readFile(file, "utf8")).toBe(corrupt);
    }
  });

  it("rejects duplicate opportunity receipt IDs across distinct logical opportunities", async () => {
    const { file, store } = await fixture();
    const first = receipt();
    await store.record(first);
    await store.record({
      ...first,
      envelope: {
        ...first.envelope,
        idempotencyKey: "runtime-opportunity:run-2:task-next",
        traceId: "runtime-tool:run-2:call-1"
      },
      id: "opportunity-2",
      runId: "run-2"
    });
    const state = JSON.parse(await readFile(file, "utf8")) as { opportunities: Array<{ id: string }> };
    state.opportunities[1]!.id = state.opportunities[0]!.id;
    const corrupt = JSON.stringify(state);
    await writeFile(file, corrupt, "utf8");

    await expect(store.list()).rejects.toThrow("opportunity store is corrupt");
    expect(await readFile(file, "utf8")).toBe(corrupt);
  });

  it("rejects persisted tool-call, traceId, and logical idempotency bindings that are individually or jointly inconsistent", async () => {
    type MutableBinding = {
      envelope: { idempotencyKey: string; traceId: string };
      toolCallId: string;
    };
    type MutableState = {
      opportunities: MutableBinding[];
      traces: MutableBinding[];
    };
    const mutations = [
      (state: MutableState) => { state.opportunities[0]!.toolCallId = "different-call"; },
      (state: MutableState) => {
        state.opportunities[0]!.envelope.traceId = "arbitrary-shared-trace";
        state.traces[0]!.envelope.traceId = "arbitrary-shared-trace";
      },
      (state: MutableState) => {
        state.opportunities[0]!.envelope.idempotencyKey = "arbitrary-shared-key";
        state.traces[0]!.envelope.idempotencyKey = "arbitrary-shared-key";
      },
      (state: MutableState) => {
        state.traces[0]!.toolCallId = "different-call";
        state.opportunities[0]!.envelope.traceId = "arbitrary-shared-trace";
        state.traces[0]!.envelope.traceId = "arbitrary-shared-trace";
        state.opportunities[0]!.envelope.idempotencyKey = "arbitrary-shared-key";
        state.traces[0]!.envelope.idempotencyKey = "arbitrary-shared-key";
      }
    ];
    for (const mutate of mutations) {
      const { file, store } = await fixture();
      await store.record(receipt());
      const state = JSON.parse(await readFile(file, "utf8")) as MutableState;
      mutate(state);
      const corrupt = JSON.stringify(state);
      await writeFile(file, corrupt, "utf8");

      await expect(store.list()).rejects.toThrow("opportunity store is corrupt");
      await expect(store.record(receipt())).rejects.toThrow("opportunity store is corrupt");
      expect(await readFile(file, "utf8")).toBe(corrupt);
    }
  });

  async function fixture() {
    const dir = await mkdtemp(join(tmpdir(), "muse-opportunity-store-"));
    dirs.push(dir);
    const file = join(dir, "progressive-autonomy-opportunities.json");
    return { file, store: new FileProgressiveAutonomyOpportunityStore({ file }) };
  }
});

function receipt(): ProgressiveAutonomyRuntimeOpportunityReceipt {
  return {
    enforcementDecision: "confirm",
    envelope: {
      action: "muse.tasks.complete-linked-next-step",
      idempotencyKey: "runtime-opportunity:run-1:task-next",
      link: {
        artifactType: "task",
        linkedAt: "2026-07-17T02:00:00.000Z",
        providerId: "local",
        role: "next-step",
        taskId: "task-next"
      },
      schemaVersion: 1,
      threadId: "thread-life",
      traceId: "runtime-tool:run-1:call-1",
      transition: { from: "open", to: "done" },
      userId: "dogfood-user"
    },
    id: "opportunity-1",
    origin: "runtime-opportunity",
    rationale: "explicit confirmation required",
    recordedAt: "2026-07-17T03:00:00.000Z",
    runId: "run-1",
    shadowAssessment: "wouldConfirm",
    shadowRationale: "no exact active standing grant",
    toolCallId: "call-1"
  };
}
