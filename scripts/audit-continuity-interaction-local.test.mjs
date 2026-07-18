import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  runLocalInteractionAudit,
  validateLocalInteractionAuditArtifact
} from "./audit-continuity-interaction-local.mjs";

test("local audit preserves present and absent canonical sources", async () => {
  const dir = await mkdtemp(join(tmpdir(), "muse-local-interaction-audit-"));
  const attunementFile = join(dir, "attunement.json");
  const tasksFile = join(dir, "absent-tasks.json");
  await writeFile(attunementFile, JSON.stringify({
    deliveries: [],
    interactionReceipts: [],
    nextPolicyVersion: 1,
    resetReceipts: [],
    schemaVersion: 2,
    threads: [],
    undoResetReceipts: []
  }));
  const before = await readFile(attunementFile);
  const artifact = await runLocalInteractionAudit({
    env: { HOME: dir, MUSE_ATTUNEMENT_FILE: attunementFile, MUSE_TASKS_FILE: tasksFile }
  });
  assert.equal(artifact.audit.status, "collecting");
  assert.deepEqual(artifact.files, {
    attunement: { existsAfter: true, existsBefore: true, sha256Unchanged: true },
    tasks: { existsAfter: false, existsBefore: false, sha256Unchanged: true }
  });
  assert.deepEqual(await readFile(attunementFile), before);
  await assert.rejects(readFile(tasksFile), /ENOENT/iu);
});

test("aggregate artifact validator rejects identifying interaction evidence", () => {
  const artifact = {
    audit: { status: "collecting" },
    classification: "actual-local-read-only",
    digest: { overall: { totalDeliveries: 0 } },
    files: {
      attunement: { existsAfter: false, existsBefore: false, sha256Unchanged: true },
      tasks: { existsAfter: false, existsBefore: false, sha256Unchanged: true }
    },
    naturalLongitudinalEvidence: false,
    permissionExpansion: false,
    schema: "muse.continuity-interaction-audit-local/v1",
    syntheticDataUsed: false
  };
  assert.equal(validateLocalInteractionAuditArtifact(artifact), artifact);
  assert.throws(
    () => validateLocalInteractionAuditArtifact({ ...artifact, deliveryId: "forbidden" }),
    /restricted evidence key/iu
  );
});
