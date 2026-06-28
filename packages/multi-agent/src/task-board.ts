/**
 * Agent task board — the durable Kanban coordination layer for ops-style multi-agent
 * work (the "handoff layer" hermes/openclaw build their orchestration on). A board is
 * an ordered list of tasks moving across columns (todo → in_progress → review → done),
 * gated by DEPENDENCIES (a task is runnable only once every task it `dependsOn` is done)
 * and carrying a RUN HISTORY so a retry feeds the previous failure's reason back into the
 * next attempt's context. This module is the PURE core (immutable transforms, no I/O); a
 * file-backed store + the dispatcher that assigns ready tasks to agents build on it.
 */

export type TaskStatus = "todo" | "in_progress" | "review" | "blocked" | "done" | "failed";

/** One execution attempt of a task — the history a retry reads to avoid repeating a failure. */
export interface TaskRun {
  /** ISO timestamp of the attempt's conclusion. */
  readonly at: string;
  readonly status: "completed" | "failed";
  /** Why it failed (fed into the retry's context) / a short completion note. */
  readonly reason?: string;
}

export interface AgentTask {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly status: TaskStatus;
  /** Ids of tasks that must reach `done` before this one is runnable (the DAG edges). */
  readonly dependsOn: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  /** The agent/profile currently assigned (set when it leaves `todo`). */
  readonly assignee?: string;
  readonly runs: readonly TaskRun[];
  /** Set when blocked/failed — surfaced for human input and replayed on retry. */
  readonly blockedReason?: string;
}

/** True when EVERY task this one depends on is `done` (a missing/incomplete dep ⇒ not met). */
export function taskDepsMet(task: AgentTask, tasks: readonly AgentTask[]): boolean {
  if (task.dependsOn.length === 0) return true;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return task.dependsOn.every((dep) => byId.get(dep)?.status === "done");
}

/**
 * The next task the dispatcher should hand to an agent: the OLDEST `todo` task whose
 * dependencies are all met (FIFO within ready). `undefined` when nothing is runnable —
 * every remaining task is done, in flight, blocked, or waiting on an unmet dependency.
 */
export function nextReadyTask(tasks: readonly AgentTask[]): AgentTask | undefined {
  return [...tasks]
    .filter((t) => t.status === "todo" && taskDepsMet(t, tasks))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
}

/** Immutably move a task to a new status (+ optional assignee), stamping updatedAt. */
export function transitionTask(
  tasks: readonly AgentTask[],
  id: string,
  status: TaskStatus,
  nowIso: string,
  assignee?: string
): AgentTask[] {
  return tasks.map((t) =>
    t.id === id
      ? { ...t, status, updatedAt: nowIso, ...(assignee !== undefined ? { assignee } : {}) }
      : t
  );
}

/**
 * Append a run to a task's history. A FAILED run moves it to `blocked` and stamps the
 * reason (so a human can intervene and a retry can replay it); a COMPLETED run moves it
 * to `done`. The history is never dropped — that's what makes a retry smarter than a re-run.
 */
export function recordTaskRun(tasks: readonly AgentTask[], id: string, run: TaskRun): AgentTask[] {
  return tasks.map((t) => {
    if (t.id !== id) return t;
    const runs = [...t.runs, run];
    if (run.status === "failed") {
      return { ...t, runs, status: "blocked", updatedAt: run.at, ...(run.reason !== undefined ? { blockedReason: run.reason } : {}) };
    }
    const { blockedReason: _dropped, ...rest } = t;
    return { ...rest, runs, status: "done", updatedAt: run.at };
  });
}

/**
 * Re-queue a blocked/failed task for another attempt (blocked → todo), KEEPING its run
 * history so the dispatcher can prepend the last failure reason to the retry's context
 * (hermes' "retry with the previous run's reason included"). Returns the board unchanged
 * if the task isn't blocked/failed (only a stuck task is retryable).
 */
export function retryTask(tasks: readonly AgentTask[], id: string, nowIso: string): AgentTask[] {
  return tasks.map((t) =>
    t.id === id && (t.status === "blocked" || t.status === "failed")
      ? { ...t, status: "todo", updatedAt: nowIso }
      : t
  );
}

/** Append a new task to the board (immutable). The caller supplies a unique id + clock. */
export function addTask(
  tasks: readonly AgentTask[],
  spec: { readonly id: string; readonly title: string; readonly description?: string; readonly dependsOn?: readonly string[] },
  nowIso: string
): AgentTask[] {
  return [
    ...tasks,
    {
      createdAt: nowIso,
      dependsOn: spec.dependsOn ?? [],
      id: spec.id,
      runs: [],
      status: "todo",
      title: spec.title,
      updatedAt: nowIso,
      ...(spec.description !== undefined ? { description: spec.description } : {})
    }
  ];
}

/**
 * Turn a lead agent's DECOMPOSITION into board tasks (S5 — board-as-handoff): each
 * subtask becomes a `todo` card, and `dependsOn` edges make the board the fan-in gate
 * — a downstream subtask is not runnable until its upstream subtasks are `done`, so the
 * dependency DAG (not an in-memory promise) coordinates the workers. Pure.
 */
export function tasksFromSubtasks(
  subtasks: readonly { readonly id: string; readonly title: string; readonly dependsOn?: readonly string[] }[],
  nowIso: string
): AgentTask[] {
  return subtasks.reduce<AgentTask[]>((board, s) => addTask(board, s, nowIso), []);
}

/** The reason of a task's most recent FAILED run — the context a retry replays. */
export function lastFailureReason(task: AgentTask): string | undefined {
  for (let i = task.runs.length - 1; i >= 0; i--) {
    const run = task.runs[i]!;
    if (run.status === "failed") return run.reason;
  }
  return undefined;
}
