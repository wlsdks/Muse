import { existsSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ModelEvent, ModelProvider, ModelRequest, ModelResponse } from "@muse/model";
import { FileLocalModelExecutionLeaseCoordinator } from "@muse/stores";
import { describe, expect, it, vi } from "vitest";

import {
  crossProcessModelExecutionLeaseEnvironment,
  createCrossProcessModelExecutionLeaseProviders,
  resolveCrossProcessModelExecutionLeaseOptions
} from "../src/cross-process-model-execution-lease.js";
import { createMuseRuntimeAssembly } from "../src/runtime-assembly.js";

const response = (output: string): ModelResponse => ({ id: output, model: "test", output });
const request = (model: string, signal?: AbortSignal): ModelRequest => ({
  messages: [{ content: "hello", role: "user" }],
  model,
  ...(signal ? { signal } : {})
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 10));

function options(root: string, enabled = true) {
  return {
    backgroundWaitMs: 1_000,
    enabled,
    foregroundWaitMs: 1_000,
    pollMs: 5,
    preemptPollMs: 5,
    root
  };
}

function provider(generate: ModelProvider["generate"], stream?: ModelProvider["stream"]): ModelProvider {
  return {
    generate,
    id: "local-test",
    listModels: async () => [],
    stream: stream ?? (() => (async function* (): AsyncIterable<ModelEvent> {
      yield { response: response("stream"), type: "done" };
    })())
  };
}

describe("cross-process local model execution lease", () => {
  it("resolves bounded owner settings and the private default root", () => {
    const ownerHome = join(tmpdir(), "muse-owner");
    expect(resolveCrossProcessModelExecutionLeaseOptions({ HOME: ownerHome })).toEqual({
      backgroundWaitMs: 1_000,
      enabled: true,
      foregroundWaitMs: 15_000,
      pollMs: 25,
      preemptPollMs: 100,
      root: join(ownerHome, ".muse", "model-execution-lease")
    });
    expect(resolveCrossProcessModelExecutionLeaseOptions({
      HOME: ownerHome,
      MUSE_CROSS_PROCESS_MODEL_BACKGROUND_WAIT_MS: "999999",
      MUSE_CROSS_PROCESS_MODEL_LEASE_ENABLED: "false",
      MUSE_CROSS_PROCESS_MODEL_POLL_MS: "5",
      MUSE_CROSS_PROCESS_MODEL_PREEMPT_POLL_MS: "25"
    })).toMatchObject({ backgroundWaitMs: 1_000, enabled: false, pollMs: 5, preemptPollMs: 25 });
  });

  it("projects only valid explicit settings across a resident process boundary", () => {
    const leaseRoot = join(tmpdir(), "muse-owner-lease");
    expect(crossProcessModelExecutionLeaseEnvironment({
      MUSE_CROSS_PROCESS_MODEL_BACKGROUND_WAIT_MS: "0",
      MUSE_CROSS_PROCESS_MODEL_FOREGROUND_WAIT_MS: "120000",
      MUSE_CROSS_PROCESS_MODEL_LEASE_ENABLED: " FALSE ",
      MUSE_CROSS_PROCESS_MODEL_LEASE_ROOT: leaseRoot,
      MUSE_CROSS_PROCESS_MODEL_POLL_MS: "4",
      MUSE_CROSS_PROCESS_MODEL_PREEMPT_POLL_MS: "25"
    })).toEqual({
      MUSE_CROSS_PROCESS_MODEL_BACKGROUND_WAIT_MS: "0",
      MUSE_CROSS_PROCESS_MODEL_FOREGROUND_WAIT_MS: "120000",
      MUSE_CROSS_PROCESS_MODEL_LEASE_ENABLED: "false",
      MUSE_CROSS_PROCESS_MODEL_LEASE_ROOT: leaseRoot,
      MUSE_CROSS_PROCESS_MODEL_PREEMPT_POLL_MS: "25"
    });
    expect(() => crossProcessModelExecutionLeaseEnvironment({
      MUSE_CROSS_PROCESS_MODEL_LEASE_ROOT: "relative/lease"
    })).toThrow("MUSE_CROSS_PROCESS_MODEL_LEASE_ROOT must be an absolute path without NUL bytes");
  });

  it("serializes providers created by separate runtime assemblies until settlement", async () => {
    const root = join(mkdtempSync(join(tmpdir(), "muse-cross-process-")), "lease");
    const firstWork = deferred<ModelResponse>();
    const starts: string[] = [];
    const base = provider(async (input) => {
      starts.push(input.model);
      return input.model === "first" ? firstWork.promise : response(input.model);
    });
    const first = createCrossProcessModelExecutionLeaseProviders(base, options(root));
    const second = createCrossProcessModelExecutionLeaseProviders(base, options(root));

    const running = first.foreground.generate(request("first"));
    await vi.waitFor(() => expect(starts).toEqual(["first"]));
    const queued = second.foreground.generate(request("second"));
    await flush();
    expect(starts).toEqual(["first"]);

    firstWork.resolve(response("first"));
    await running;
    await expect(queued).resolves.toMatchObject({ output: "second" });
    expect(starts).toEqual(["first", "second"]);
  });

  it("preempts background once but retains the lease until an uncooperative provider settles", async () => {
    const root = join(mkdtempSync(join(tmpdir(), "muse-cross-process-")), "lease");
    const backgroundWork = deferred<ModelResponse>();
    let backgroundSignal: AbortSignal | undefined;
    const starts: string[] = [];
    const base = provider(async (input) => {
      starts.push(input.model);
      if (input.model === "background") {
        backgroundSignal = input.signal;
        return backgroundWork.promise;
      }
      return response(input.model);
    });
    const backgroundRuntime = createCrossProcessModelExecutionLeaseProviders(base, options(root));
    const foregroundRuntime = createCrossProcessModelExecutionLeaseProviders(base, options(root));

    const background = backgroundRuntime.background.generate(request("background"));
    await vi.waitFor(() => expect(starts).toEqual(["background"]));
    const foreground = foregroundRuntime.foreground.generate(request("foreground"));
    await vi.waitFor(() => expect(backgroundSignal?.aborted).toBe(true));
    expect(starts).toEqual(["background"]);

    backgroundWork.resolve(response("ignored abort"));
    await expect(background).rejects.toMatchObject({ code: "REQUEST_ABORTED", retryable: false });
    await expect(foreground).resolves.toMatchObject({ output: "foreground" });
    expect(backgroundRuntime.snapshot()).toMatchObject({ preempted: 1 });
  });

  it("preserves caller cancellation while a foreground-demand check is blocked on the filesystem guard", async () => {
    const root = join(mkdtempSync(join(tmpdir(), "muse-cross-process-")), "lease");
    const backgroundWork = deferred<ModelResponse>();
    const guardEntered = deferred<void>();
    const releaseGuard = deferred<void>();
    const base = provider(async () => backgroundWork.promise);
    const backgroundRuntime = createCrossProcessModelExecutionLeaseProviders(base, options(root));
    const caller = new AbortController();
    const background = backgroundRuntime.background.generate(request("background", caller.signal));
    await vi.waitFor(() => expect(backgroundRuntime.snapshot().activeLocalRole).toBe("background"));

    const blockerController = new AbortController();
    const blocker = new FileLocalModelExecutionLeaseCoordinator({
      ...options(root),
      onGuardStage: async (stage) => {
        if (stage !== "entered") return;
        guardEntered.resolve();
        await releaseGuard.promise;
      }
    }).acquire("foreground", blockerController.signal);
    await guardEntered.promise;
    await new Promise((resolve) => setTimeout(resolve, 25));

    caller.abort("private reason");
    backgroundWork.resolve(response("ignored abort"));
    blockerController.abort();
    releaseGuard.resolve();

    await expect(blocker).rejects.toMatchObject({ code: "REQUEST_ABORTED" });
    await expect(background).rejects.toMatchObject({ code: "REQUEST_ABORTED", retryable: false });
    expect(backgroundRuntime.snapshot()).toMatchObject({ cancelled: 1, stateFailures: 0 });
  });

  it("maps a global queue timeout to a fixed retryable provider error with zero underlying calls", async () => {
    const root = join(mkdtempSync(join(tmpdir(), "muse-cross-process-")), "lease");
    const firstWork = deferred<ModelResponse>();
    const starts: string[] = [];
    const base = provider(async (input) => {
      starts.push(input.model);
      return input.model === "active" ? firstWork.promise : response(input.model);
    });
    const activeRuntime = createCrossProcessModelExecutionLeaseProviders(base, options(root));
    const impatientRuntime = createCrossProcessModelExecutionLeaseProviders(base, {
      ...options(root),
      backgroundWaitMs: 0
    });
    const active = activeRuntime.foreground.generate(request("active"));
    await vi.waitFor(() => expect(starts).toEqual(["active"]));

    await expect(impatientRuntime.background.generate(request("timed-out"))).rejects.toMatchObject({
      code: "QUEUE_TIMEOUT",
      message: "local model execution lease queue timed out",
      retryable: true
    });
    expect(starts).toEqual(["active"]);
    expect(impatientRuntime.snapshot()).toMatchObject({ timedOut: 1 });
    firstWork.resolve(response("active"));
    await active;
  });

  it("keeps invalid explicit roots lazy and fails closed before the provider call", async () => {
    const generate = vi.fn(async (input: ModelRequest) => response(input.model));
    const resolved = resolveCrossProcessModelExecutionLeaseOptions({
      MUSE_CROSS_PROCESS_MODEL_LEASE_ROOT: "relative/lease"
    });
    expect(resolved.root).toBe("relative/lease");
    const views = createCrossProcessModelExecutionLeaseProviders(provider(generate), resolved);
    await expect(views.foreground.generate(request("invalid-root"))).rejects.toMatchObject({
      code: "STATE_UNAVAILABLE",
      retryable: false
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("holds a foreground lease after caller cancellation until the provider actually settles", async () => {
    const root = join(mkdtempSync(join(tmpdir(), "muse-cross-process-")), "lease");
    const firstWork = deferred<ModelResponse>();
    const starts: string[] = [];
    const base = provider(async (input) => {
      starts.push(input.model);
      return input.model === "cancelled" ? firstWork.promise : response(input.model);
    });
    const firstRuntime = createCrossProcessModelExecutionLeaseProviders(base, options(root));
    const secondRuntime = createCrossProcessModelExecutionLeaseProviders(base, options(root));
    const controller = new AbortController();
    const cancelled = firstRuntime.foreground.generate(request("cancelled", controller.signal));
    await vi.waitFor(() => expect(starts).toEqual(["cancelled"]));
    controller.abort("private reason");
    const queued = secondRuntime.foreground.generate(request("after-cancel"));
    await flush();
    expect(starts).toEqual(["cancelled"]);

    firstWork.resolve(response("ignored abort"));
    await expect(cancelled).rejects.toMatchObject({ code: "REQUEST_ABORTED", retryable: false });
    await expect(queued).resolves.toMatchObject({ output: "after-cancel" });
  });

  it("keeps streaming lazy, yields live events, and releases on early iterator return", async () => {
    const root = join(mkdtempSync(join(tmpdir(), "muse-cross-process-")), "lease");
    const continueStream = deferred<void>();
    const streamStarted = vi.fn();
    const base = provider(
      async (input) => response(input.model),
      () => (async function* (): AsyncIterable<ModelEvent> {
        streamStarted();
        yield { text: "first", type: "text-delta" };
        await continueStream.promise;
        yield { response: response("done"), type: "done" };
      })()
    );
    const views = createCrossProcessModelExecutionLeaseProviders(base, options(root));
    const iterable = views.foreground.stream(request("stream"));
    expect(streamStarted).not.toHaveBeenCalled();
    expect(existsSync(root)).toBe(false);

    const iterator = iterable[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toEqual({ done: false, value: { text: "first", type: "text-delta" } });
    expect(streamStarted).toHaveBeenCalledOnce();
    await iterator.return?.();
    await expect(views.foreground.generate(request("after"))).resolves.toMatchObject({ output: "after" });
  });

  it("releases the lease when a provider throws synchronously while constructing a stream", async () => {
    const root = join(mkdtempSync(join(tmpdir(), "muse-cross-process-")), "lease");
    const base = provider(
      async (input) => response(input.model),
      () => { throw new Error("stream construction failed"); }
    );
    const views = createCrossProcessModelExecutionLeaseProviders(base, options(root));
    const iterator = views.foreground.stream(request("broken-stream"))[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toThrow("stream construction failed");
    await expect(views.foreground.generate(request("after"))).resolves.toMatchObject({ output: "after" });
  });

  it("bypasses all filesystem work when disabled and rejects pre-aborted input without state", async () => {
    const baseGenerate = vi.fn(async (input: ModelRequest) => response(input.model));
    const base = provider(baseGenerate);
    const disabledRoot = join(mkdtempSync(join(tmpdir(), "muse-cross-process-")), "disabled");
    const disabled = createCrossProcessModelExecutionLeaseProviders(base, options(disabledRoot, false));
    expect(disabled.foreground).toBe(base);
    expect(disabled.background).toBe(base);
    await disabled.foreground.generate(request("disabled"));
    expect(existsSync(disabledRoot)).toBe(false);

    const abortedRoot = join(mkdtempSync(join(tmpdir(), "muse-cross-process-")), "aborted");
    const enabled = createCrossProcessModelExecutionLeaseProviders(base, options(abortedRoot));
    const controller = new AbortController();
    controller.abort("private reason");
    const error = await enabled.foreground.generate(request("aborted", controller.signal))
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "REQUEST_ABORTED", retryable: false });
    expect(String(error)).not.toContain("private reason");
    expect(existsSync(abortedRoot)).toBe(false);
    expect(baseGenerate).toHaveBeenCalledTimes(1);
  });

  it("assembles usage, one global lease, then the process-local budget without double wrapping", async () => {
    const home = mkdtempSync(join(tmpdir(), "muse-cross-process-assembly-"));
    const leaseRoot = join(home, "lease");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      choices: [{ message: { content: "ok" } }],
      id: "c1",
      model: "local/test"
    }), { status: 200 })) as typeof globalThis.fetch;
    const assembly = createMuseRuntimeAssembly({
      env: {
        HOME: home,
        MUSE_ACTIVE_CONTEXT_ENABLED: "false",
        MUSE_CROSS_PROCESS_MODEL_LEASE_ROOT: leaseRoot,
        MUSE_FOLLOWUP_CAPTURE_ENABLED: "false",
        MUSE_LOCAL_ONLY: "true",
        MUSE_MODEL: "local/test",
        MUSE_MODEL_BASE_URL: "http://localhost:18000/v1",
        MUSE_SCHEDULER_CRON_ENABLED: "false",
        MUSE_USER_MEMORY_AUTO_EXTRACT: "false"
      }
    });
    try {
      await expect(assembly.modelProvider?.generate(request("local/test")))
        .resolves.toMatchObject({ output: "ok" });
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(assembly.observability.crossProcessModelExecutionLeaseSnapshot?.()).toMatchObject({
      acquired: 1,
      completed: 1
    });
    expect(assembly.observability.modelExecutionBudgetSnapshot?.()).toMatchObject({
      activeForeground: 0,
      maxObservedActiveForeground: 1
    });
  });
});
