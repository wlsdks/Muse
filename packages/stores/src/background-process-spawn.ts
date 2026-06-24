/**
 * X-3 (slice 2) — spawn a background process and TRACK it in the registry.
 *
 * Orchestration only: the actual OS spawn and the danger check are INJECTED,
 * so this package stays dependency-free and unit-testable without touching
 * the filesystem-exec boundary. The caller (CLI) injects a real detached
 * `child_process.spawn` wrapper and the deterministic catastrophic-command
 * guard (`classifyDangerousCommand` from @muse/tools) — a refused command
 * never spawns. On launch the process is recorded `running`; when the child
 * exits, the record is updated to `exited`/`failed` with its code, so a
 * later turn (or a post-restart recovery) sees an accurate state.
 */

import {
  registerBackgroundProcess,
  updateBackgroundProcess,
  type BackgroundProcessRecord
} from "./background-process-store.js";

export interface SpawnedChild {
  readonly pid: number;
  /** Register a listener fired once when the child exits (code is null if signalled). */
  onExit(listener: (exitCode: number | null) => void | Promise<void>): void;
}

export interface BackgroundSpawner {
  spawn(command: string, options: { readonly cwd?: string; readonly logFile: string }): SpawnedChild;
}

export interface SpawnBackgroundDeps {
  readonly storeFile: string;
  readonly spawner: BackgroundSpawner;
  readonly logFileFor: (id: string) => string;
  readonly now: () => Date;
  readonly newId: () => string;
  /** Returns a refusal reason when the command is catastrophic, else undefined. Wire classifyDangerousCommand. */
  readonly classifyDanger?: (command: string) => string | undefined;
}

export async function spawnBackgroundProcess(
  command: string,
  options: { readonly cwd?: string },
  deps: SpawnBackgroundDeps
): Promise<BackgroundProcessRecord> {
  const trimmed = command.trim();
  if (trimmed.length === 0) {
    throw new Error("spawnBackgroundProcess: empty command");
  }
  const refusal = deps.classifyDanger?.(trimmed);
  if (refusal) {
    throw new Error(`background process refused: ${refusal}`);
  }

  const id = deps.newId();
  const logFile = deps.logFileFor(id);
  const child = deps.spawner.spawn(trimmed, { ...(options.cwd ? { cwd: options.cwd } : {}), logFile });
  const record: BackgroundProcessRecord = {
    id,
    pid: child.pid,
    command: trimmed,
    ...(options.cwd ? { cwd: options.cwd } : {}),
    startedAt: deps.now().toISOString(),
    status: "running",
    logFile
  };
  await registerBackgroundProcess(deps.storeFile, record);

  child.onExit(async (exitCode) => {
    await updateBackgroundProcess(deps.storeFile, id, {
      status: exitCode === 0 ? "exited" : "failed",
      exitCode,
      endedAt: deps.now().toISOString()
    });
  });

  return record;
}
