// Tests for session persistence (checkpoint/resume) + its integration with the
// orchestrator. Proves a resumed run does NOT redo completed steps.
// Run: node --test harness/runner/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { snapshot, serializeSession, deserializeSession, createMemoryStore, createFileStore } from './session.mjs';
import { runCycle } from './orchestrator.mjs';

test('snapshot round-trips through serialize/deserialize; invalid is rejected', () => {
  const s = snapshot({ runId: 'r', phase: 'PLANNED', criteria: ['c'], attempt: 1 });
  const back = deserializeSession(serializeSession(s));
  assert.deepEqual(back, s);
  assert.throws(() => deserializeSession('{"v":2}'));
  assert.throws(() => snapshot({ runId: 'r' })); // no phase
});

test('memory store save/load/list', async () => {
  const store = createMemoryStore();
  await store.save(snapshot({ runId: 'a', phase: 'BUILT' }));
  await store.save(snapshot({ runId: 'b', phase: 'DONE' }));
  assert.equal((await store.load('a')).phase, 'BUILT');
  assert.equal(await store.load('missing'), null);
  assert.deepEqual((await store.list()).sort(), ['a', 'b']);
});

test('file store persists to disk and reloads', async () => {
  const dir = join(tmpdir(), `harness-sess-${process.pid}`);
  try {
    const store = createFileStore(dir);
    await store.save(snapshot({ runId: 'run1', phase: 'EVALUATED', criteria: ['x'], verdict: 'FAIL' }));
    const loaded = await store.load('run1');
    assert.equal(loaded.phase, 'EVALUATED');
    assert.equal(loaded.verdict, 'FAIL');
    assert.deepEqual(await store.list(), ['run1']);
    assert.equal(await store.load('nope'), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('orchestrator checkpoints at each phase', async () => {
  const seen = [];
  const res = await runCycle('add', {
    checkpoint: (s) => { seen.push(s.phase); },
    callAgent: async (role) => ({
      planner: '{"criteria":["a+b"]}',
      worker: 'def add(a,b): return a+b',
      evaluator: '{"verdict":"PASS"}',
    })[role],
  });
  assert.equal(res.ok, true);
  assert.deepEqual(seen, ['PLANNED', 'BUILT', 'EVALUATED', 'DONE']);
});

test('resume from PLANNED snapshot skips the planner (criteria reused)', async () => {
  let plannerCalls = 0;
  const res = await runCycle('add', {
    resume: snapshot({ runId: 'r', phase: 'PLANNED', criteria: ['reused criterion'] }),
    callAgent: async (role) => {
      if (role === 'planner') { plannerCalls += 1; return '{"criteria":["SHOULD NOT BE USED"]}'; }
      if (role === 'worker') return 'build';
      return '{"verdict":"PASS"}';
    },
  });
  assert.equal(res.ok, true);
  assert.equal(plannerCalls, 0); // planner never re-ran
  assert.deepEqual(res.criteria, ['reused criterion']);
  assert.ok(res.trace.some((e) => e.event === 'resumed'));
});

test('resume with a checkpointed build skips the worker for that iteration', async () => {
  let workerCalls = 0;
  const res = await runCycle('add', {
    resume: snapshot({ runId: 'r', phase: 'BUILT', criteria: ['c'], attempt: 0, build: 'restored-build' }),
    callAgent: async (role) => {
      if (role === 'worker') { workerCalls += 1; return 'fresh-build'; }
      if (role === 'evaluator') return '{"verdict":"PASS"}';
      return '{"criteria":["x"]}';
    },
  });
  assert.equal(res.ok, true);
  assert.equal(workerCalls, 0); // build was restored, not rebuilt
  assert.equal(res.build, 'restored-build');
  const buildEvent = res.trace.find((e) => e.event === 'build');
  assert.equal(buildEvent.resumed, true);
});
